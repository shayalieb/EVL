import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions, requireRole } from '../lib/membership.js';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { normalizeE164, displayPhone } from '../lib/phoneNumber.js';
import { sendSms, smsProviderConfigured, validateTwilioSignature } from '../lib/twilioSms.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

const sendLimiter = createRateLimiter('sms-send', { windowMs: 60 * 1000, limit: 30, message: { error: 'Too many text messages. Please wait a moment.' } });
const STATUS_MAP = { accepted: 'queued', queued: 'queued', sending: 'queued', sent: 'sent', delivered: 'delivered', undelivered: 'failed', failed: 'failed', received: 'received' };

function profileJson(profile) {
  if (!profile) return { status: 'not_started', phoneNumber: null, providerReady: smsProviderConfigured(), monthlyMessageLimit: null, currentPeriodCount: 0 };
  return { id: profile.id, status: profile.status, phoneNumber: profile.phoneNumber, phoneDisplay: displayPhone(profile.phoneNumber), areaCodePreference: profile.areaCodePreference, businessName: profile.businessName, businessWebsite: profile.businessWebsite, businessAddress: profile.businessAddress, businessCity: profile.businessCity, businessRegion: profile.businessRegion, businessPostalCode: profile.businessPostalCode, businessCountry: profile.businessCountry, useCaseDescription: profile.useCaseDescription, requestedAt: profile.requestedAt, activatedAt: profile.activatedAt, monthlyMessageLimit: profile.monthlyMessageLimit, currentPeriodCount: profile.currentPeriodCount, providerReady: smsProviderConfigured() };
}

router.get('/profile', asyncHandler(async (req, res) => {
  const profile = await prisma.messagingProfile.findUnique({ where: { accountId: req.membership.accountId } });
  res.json({ profile: profileJson(profile) });
}));

router.put('/profile/request', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageSettings) return res.status(403).json({ error: 'Not authorized.' });
  const input = req.body || {};
  const required = ['businessName', 'businessWebsite', 'businessAddress', 'businessCity', 'businessRegion', 'businessPostalCode'];
  if (required.some((key) => !String(input[key] || '').trim())) return res.status(400).json({ error: 'Complete all business registration fields.' });
  if (!/^https:\/\//i.test(String(input.businessWebsite))) return res.status(400).json({ error: 'Business website must start with https://.' });
  if (input.consentAttested !== true) return res.status(400).json({ error: 'Confirm that contractors have agreed to receive operational texts.' });
  const clean = (key, max = 200) => String(input[key] || '').trim().slice(0, max) || null;
  const profile = await prisma.messagingProfile.upsert({
    where: { accountId: req.membership.accountId },
    update: { status: 'requested', areaCodePreference: String(input.areaCodePreference || '').replace(/\D/g, '').slice(0, 3) || null, businessName: clean('businessName'), businessWebsite: clean('businessWebsite', 500), businessAddress: clean('businessAddress'), businessCity: clean('businessCity'), businessRegion: clean('businessRegion', 80), businessPostalCode: clean('businessPostalCode', 20), businessCountry: 'US', useCaseDescription: clean('useCaseDescription', 2000) || 'One-to-one operational messages to contractors about assigned gigs, schedules, confirmations, and payments.', consentAttestedAt: new Date(), consentAttestedById: req.session.userId, requestedAt: new Date() },
    create: { accountId: req.membership.accountId, status: 'requested', areaCodePreference: String(input.areaCodePreference || '').replace(/\D/g, '').slice(0, 3) || null, businessName: clean('businessName'), businessWebsite: clean('businessWebsite', 500), businessAddress: clean('businessAddress'), businessCity: clean('businessCity'), businessRegion: clean('businessRegion', 80), businessPostalCode: clean('businessPostalCode', 20), businessCountry: 'US', useCaseDescription: clean('useCaseDescription', 2000) || 'One-to-one operational messages to contractors about assigned gigs, schedules, confirmations, and payments.', consentAttestedAt: new Date(), consentAttestedById: req.session.userId, requestedAt: new Date() },
  });
  await prisma.accountActivity.create({ data: { accountId: req.membership.accountId, actorUserId: req.session.userId, type: 'sms_activation_requested', summary: 'Dedicated Gigworks number requested', metadata: { areaCodePreference: profile.areaCodePreference } } });
  res.json({ profile: profileJson(profile) });
}));

router.patch('/contractors/:contractorId/consent', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) return res.status(403).json({ error: 'Not authorized.' });
  const status = ['opted_in', 'opted_out', 'unknown'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Select a valid consent status.' });
  const result = await prisma.contractor.updateMany({ where: { id: req.params.contractorId, accountId: req.membership.accountId }, data: { smsConsentStatus: status, smsConsentedAt: status === 'opted_in' ? new Date() : null, smsOptedOutAt: status === 'opted_out' ? new Date() : null } });
  if (!result.count) return res.status(404).json({ error: 'Contractor not found.' });
  res.json({ ok: true, status });
}));

router.post('/send', sendLimiter, asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageContractors) return res.status(403).json({ error: 'Not authorized.' });
  const { eventId, contractorId } = req.body || {};
  const body = String(req.body?.body || '').trim();
  if (!eventId || !contractorId || !body) return res.status(400).json({ error: 'Event, contractor, and message are required.' });
  if (body.length > 1600) return res.status(400).json({ error: 'Text messages are limited to 1,600 characters.' });
  const [event, contractor, profile] = await Promise.all([
    prisma.event.findFirst({ where: { id: eventId, accountId: req.membership.accountId, deletedAt: null }, select: { id: true } }),
    prisma.contractor.findFirst({ where: { id: contractorId, accountId: req.membership.accountId } }),
    prisma.messagingProfile.findUnique({ where: { accountId: req.membership.accountId } }),
  ]);
  if (!event || !contractor) return res.status(404).json({ error: 'Event or contractor not found.' });
  if (profile?.status !== 'active' || !profile.phoneNumber) return res.status(409).json({ error: 'Activate your dedicated Gigworks number before sending texts.', code: 'SMS_NOT_ACTIVE' });
  if (contractor.smsConsentStatus !== 'opted_in') return res.status(409).json({ error: contractor.smsConsentStatus === 'opted_out' ? 'This contractor has opted out of text messages.' : 'Record this contractor’s permission to receive operational texts first.', code: 'SMS_CONSENT_REQUIRED' });
  const to = normalizeE164(contractor.phone);
  if (!to) return res.status(400).json({ error: 'This contractor needs a valid phone number.' });
  if (profile.monthlyMessageLimit && profile.currentPeriodCount >= profile.monthlyMessageLimit) return res.status(409).json({ error: 'This account has reached its monthly message allowance.', code: 'SMS_LIMIT_REACHED' });

  const thread = await prisma.emailThread.upsert({ where: { accountId_eventId_contractorId: { accountId: req.membership.accountId, eventId, contractorId } }, update: { contractorEmail: contractor.email || '' }, create: { accountId: req.membership.accountId, eventId, contractorId, contractorEmail: contractor.email || '' } });
  const message = await prisma.emailMessage.create({ data: { threadId: thread.id, direction: 'outbound', channel: 'sms', fromAddress: profile.phoneNumber, toAddress: to, subject: 'Text message', body, sentByUserId: req.session.userId, provider: profile.provider, deliveryStatus: 'queued' } });
  try {
    const publicBase = process.env.API_PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
    const sent = await sendSms({ from: profile.phoneNumber, to, body, messagingServiceSid: profile.messagingServiceSid, statusCallback: `${publicBase}/api/webhooks/twilio/sms/status` });
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.emailMessage.update({ where: { id: message.id }, data: { providerMessageId: sent.id, deliveryStatus: STATUS_MAP[sent.status] || 'queued' } });
      await tx.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
      await tx.messagingProfile.update({ where: { id: profile.id }, data: { currentPeriodCount: { increment: 1 } } });
      return saved;
    });
    res.status(201).json({ message: { id: updated.id, channel: 'sms', deliveryStatus: updated.deliveryStatus, createdAt: updated.createdAt } });
  } catch (error) {
    await prisma.emailMessage.update({ where: { id: message.id }, data: { deliveryStatus: 'failed', failedAt: new Date(), failureCode: error.code || 'send_failed' } });
    throw error;
  }
}));

export const publicMessagingRouter = Router();

function externallyVisibleUrl(req) {
  const configured = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
  return configured ? `${configured}${req.originalUrl}` : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

function requireValidTwilio(req, res, next) {
  try {
    if (!validateTwilioSignature({ url: externallyVisibleUrl(req), params: req.body || {}, signature: req.get('x-twilio-signature') })) return res.status(403).send('Invalid signature');
    next();
  } catch {
    return res.status(503).send('SMS provider is not configured');
  }
}

publicMessagingRouter.post('/twilio/sms/status', requireValidTwilio, asyncHandler(async (req, res) => {
  const status = STATUS_MAP[req.body.MessageStatus] || 'sent';
  const data = { deliveryStatus: status };
  if (status === 'delivered') data.deliveredAt = new Date();
  if (status === 'failed') { data.failedAt = new Date(); data.failureCode = String(req.body.ErrorCode || 'delivery_failed'); }
  await prisma.emailMessage.updateMany({ where: { provider: 'twilio', providerMessageId: req.body.MessageSid }, data });
  res.type('text/xml').send('<Response></Response>');
}));

publicMessagingRouter.post('/twilio/sms/inbound', requireValidTwilio, asyncHandler(async (req, res) => {
  const to = normalizeE164(req.body.To);
  const from = normalizeE164(req.body.From);
  const body = String(req.body.Body || '').trim().slice(0, 1600);
  const providerMessageId = String(req.body.MessageSid || '');
  const profile = to ? await prisma.messagingProfile.findUnique({ where: { phoneNumber: to } }) : null;
  if (!profile || !from || !body || !providerMessageId) return res.type('text/xml').send('<Response></Response>');
  const contractors = await prisma.contractor.findMany({ where: { accountId: profile.accountId }, select: { id: true, phone: true } });
  const contractor = contractors.find((item) => normalizeE164(item.phone) === from);
  if (!contractor) return res.type('text/xml').send('<Response></Response>');
  // A reply has no gig id. Attach it to the thread containing the most recent
  // outbound SMS to this exact phone number, not merely the contractor's most
  // recently emailed gig.
  const lastOutbound = await prisma.emailMessage.findFirst({
    where: { channel: 'sms', direction: 'outbound', toAddress: from, thread: { accountId: profile.accountId, contractorId: contractor.id } },
    orderBy: { createdAt: 'desc' },
    select: { thread: true },
  });
  const thread = lastOutbound?.thread;
  if (!thread) return res.type('text/xml').send('<Response></Response>');
  const keyword = body.trim().toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(keyword)) await prisma.contractor.update({ where: { id: contractor.id }, data: { smsConsentStatus: 'opted_out', smsOptedOutAt: new Date(), smsConsentedAt: null } });
  if (['START', 'UNSTOP'].includes(keyword)) await prisma.contractor.update({ where: { id: contractor.id }, data: { smsConsentStatus: 'opted_in', smsConsentedAt: new Date(), smsOptedOutAt: null } });
  await prisma.$transaction([
    prisma.emailMessage.create({ data: { threadId: thread.id, direction: 'inbound', channel: 'sms', fromAddress: from, toAddress: to, subject: 'Text message', body, provider: 'twilio', providerMessageId, deliveryStatus: 'received' } }),
    prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
    prisma.messagingProfile.update({ where: { id: profile.id }, data: { currentPeriodCount: { increment: 1 } } }),
  ]).catch((error) => { if (error.code !== 'P2002') throw error; });
  res.type('text/xml').send('<Response></Response>');
}));

export default router;
