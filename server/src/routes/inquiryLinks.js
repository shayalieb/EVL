import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader, escapeHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';

const router = Router();

const INQUIRY_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function newExpiry() {
  return new Date(Date.now() + INQUIRY_LINK_TTL_MS);
}

function serializeForOwner(link) {
  return {
    id: link.id,
    status: link.status,
    expiresAt: link.expiresAt,
    bookingId: link.bookingId,
    recipientEmail: link.recipientEmail,
    recipientName: link.recipientName,
    response: link.response,
    submittedAt: link.submittedAt,
    appliedAt: link.appliedAt,
    appliedBookingId: link.appliedBookingId,
    appliedClientId: link.appliedClientId,
    sentAt: link.sentAt,
    createdAt: link.createdAt,
  };
}

// Shared by POST / (initial send) and POST /:id/regenerate (resend after a
// lost/expired link) — only sent if a recipient email is on file, since an
// inquiry link is often handed out mid-phone-call with no email on hand yet.
async function emailInquiryLink({ accountId, recipientEmail, recipientName, inquiryUrl }) {
  const accountData = await prisma.accountData.findUnique({ where: { accountId } });
  const fromName = accountData?.data?.businessInfo?.name || 'GigWorks';
  await sendMail({
    from: buildFromHeader(fromName),
    to: recipientEmail,
    subject: `Tell us about your event — ${fromName}`,
    html: `<p>Hi ${escapeHtml(recipientName) || 'there'},</p><p>Please share your event details using the secure link below so we can get your booking started.</p><p><a href="${inquiryUrl}">${inquiryUrl}</a></p><p>${escapeHtml(fromName)}</p>`,
  });
}

// ---- Authenticated (owner-side) ----

router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const { status, bookingId } = req.query;
  const links = await prisma.inquiryLink.findMany({
    where: { accountId: req.membership.accountId, ...(status ? { status } : {}), ...(bookingId ? { bookingId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ links: links.map(serializeForOwner) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { recipientEmail, recipientName, bookingId } = req.body || {};
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const token = generateToken();

  const link = await prisma.inquiryLink.create({
    data: {
      accountId: req.membership.accountId,
      tokenHash: hashToken(token),
      status: 'open',
      expiresAt: newExpiry(),
      bookingId: bookingId || null,
      recipientEmail: recipientEmail?.trim() || null,
      recipientName: recipientName?.trim() || null,
      ownerEmail: owner.email,
    },
  });

  const inquiryUrl = `${frontendUrl()}/inquiry/${token}`;
  let emailSent = false;
  let emailError = null;
  if (recipientEmail?.trim()) {
    try {
      await emailInquiryLink({ accountId: req.membership.accountId, recipientEmail: recipientEmail.trim(), recipientName, inquiryUrl });
      await prisma.inquiryLink.update({ where: { id: link.id }, data: { sentAt: new Date() } });
      emailSent = true;
    } catch (err) {
      console.error('Failed to email inquiry link:', err);
      emailError = 'Link was created, but the email could not be sent — copy the link below to share it manually.';
    }
  }

  res.status(201).json({ link: serializeForOwner(link), inquiryLink: inquiryUrl, emailSent, emailError });
}));

// Issues a fresh token (and a fresh 30-day expiry) for a link that was lost
// before the client used it, or that expired unused — same idea as
// Contract's regenerate-client-link. Only valid while still 'open': once a
// client has submitted, the response is what matters, not the link itself.
router.post('/:id/regenerate', asyncHandler(async (req, res) => {
  const link = await prisma.inquiryLink.findUnique({ where: { id: req.params.id } });
  if (!link || link.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Inquiry link not found.' });
  }
  if (link.status !== 'open') {
    return res.status(400).json({ error: 'Only an unused link can be regenerated.' });
  }

  const token = generateToken();
  const updated = await prisma.inquiryLink.update({
    where: { id: link.id },
    data: { tokenHash: hashToken(token), expiresAt: newExpiry() },
  });

  const inquiryUrl = `${frontendUrl()}/inquiry/${token}`;
  let emailSent = false;
  let emailError = null;
  if (link.recipientEmail) {
    try {
      await emailInquiryLink({ accountId: req.membership.accountId, recipientEmail: link.recipientEmail, recipientName: link.recipientName, inquiryUrl });
      await prisma.inquiryLink.update({ where: { id: link.id }, data: { sentAt: new Date() } });
      emailSent = true;
    } catch (err) {
      console.error('Failed to email regenerated inquiry link:', err);
      emailError = 'Link was regenerated, but the email could not be sent — copy the link below to share it manually.';
    }
  }

  res.json({ link: serializeForOwner(updated), inquiryLink: inquiryUrl, emailSent, emailError });
}));

// Marks the inquiry consumed once the agent has already created/updated the
// Client/Booking client-side (see src/lib/applyInquiry.js) — this route
// never creates them itself, since that write has to go through the normal
// authenticated addClient/addBooking(orUpdateBooking) flow, not a bespoke
// server-side one.
router.post('/:id/apply', asyncHandler(async (req, res) => {
  const { bookingId, clientId } = req.body || {};
  const link = await prisma.inquiryLink.findUnique({ where: { id: req.params.id } });
  if (!link || link.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Inquiry link not found.' });
  }
  if (link.status !== 'submitted') {
    return res.status(400).json({ error: 'Only a submitted inquiry can be applied.' });
  }
  const updated = await prisma.inquiryLink.update({
    where: { id: link.id },
    data: {
      status: 'applied',
      appliedAt: new Date(),
      appliedBookingId: bookingId || null,
      appliedClientId: clientId || null,
    },
  });
  res.json({ link: serializeForOwner(updated) });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix (see
// contracts.js/publicContractsRouter for the identical pattern) so it never
// passes through the requireAuth/attachMembership pair above.

export const publicInquiryLinksRouter = Router();

async function findByToken(token) {
  const hash = hashToken(token);
  return prisma.inquiryLink.findFirst({ where: { tokenHash: hash } });
}

// Distinguishes "already used" from "expired" — a stale-but-unused link
// should send the client back to ask the agent for a fresh one (regenerate),
// which reads differently than "someone already submitted this."
function publicAccessError(link) {
  if (link.status !== 'open') return { status: 410, error: 'This inquiry link has already been used.' };
  if (link.expiresAt < new Date()) return { status: 410, error: 'This inquiry link has expired. Please ask for a new one.' };
  return null;
}

// No email-confirmation gate (unlike Contract/Invoice's public view) — an
// inquiry link goes out to a prospect whose email may not be known yet, so
// possession of the token itself is the only credential.
publicInquiryLinksRouter.get('/:token', asyncHandler(async (req, res) => {
  const link = await findByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });
  const accessError = publicAccessError(link);
  if (accessError) return res.status(accessError.status).json({ error: accessError.error });

  const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
  res.json({
    businessInfo: accountData?.data?.businessInfo || null,
    eventTypes: accountData?.data?.eventTypes || [],
  });
}));

publicInquiryLinksRouter.post('/:token/submit', asyncHandler(async (req, res) => {
  const link = await findByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'This link is invalid.' });
  const accessError = publicAccessError(link);
  if (accessError) return res.status(accessError.status).json({ error: accessError.error });

  const {
    firstName, lastName, phone, email,
    eventDate, eventType,
    brideName, groomName,
    venueName, address1, address2, city, state, zip, venueContactName, venueContactEmail,
    details,
  } = req.body || {};

  if (!firstName?.trim() || !lastName?.trim() || !eventDate) {
    return res.status(400).json({ error: 'First name, last name, and event date are required.' });
  }
  if (zip?.trim() && !/^\d{5}$/.test(zip.trim())) {
    return res.status(400).json({ error: 'Zip code must be 5 digits.' });
  }

  const updated = await prisma.inquiryLink.update({
    where: { id: link.id },
    data: {
      status: 'submitted',
      submittedAt: new Date(),
      response: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone?.trim() || '',
        email: email?.trim() || '',
        eventDate,
        eventType: eventType || '',
        brideName: brideName?.trim() || '',
        groomName: groomName?.trim() || '',
        venueName: venueName?.trim() || '',
        address1: address1?.trim() || '',
        address2: address2?.trim() || '',
        city: city?.trim() || '',
        state: state?.trim() || '',
        zip: zip?.trim() || '',
        venueContactName: venueContactName?.trim() || '',
        venueContactEmail: venueContactEmail?.trim() || '',
        details: details?.trim() || '',
      },
    },
  });

  // Best-effort nudge to the owner — the in-app "new inquiry response"
  // indicator on the Bookings page is the real notification, this is just
  // a heads-up if they're not looking at the app right now.
  const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
  const fromName = accountData?.data?.businessInfo?.name || 'GigWorks';
  try {
    await sendMail({
      from: buildFromHeader(fromName),
      to: updated.ownerEmail,
      subject: `New inquiry response — ${firstName.trim()} ${lastName.trim()}`,
      html: `<p>${escapeHtml(firstName.trim())} ${escapeHtml(lastName.trim())} just filled out an inquiry form. Review it and apply it in GigWorks to create the booking.</p>`,
    });
  } catch {
    // best effort — the in-app indicator is the real notification
  }

  res.json({ ok: true });
}));

export default router;
