import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { sendMail, resolveFromHeader, escapeHtml, buildActionEmailHtml } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { normalizeValidEmail } from '../lib/emailAddress.js';
import { withSerializableTransaction } from '../lib/serializableTransaction.js';

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
    isReusable: link.isReusable,
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
  const businessInfo = accountData?.data?.businessInfo || {};
  const fromName = businessInfo.name || 'GigWorks';
  await sendMail({
    from: await resolveFromHeader({ accountId, fromName, localPart: 'inquiries' }),
    to: recipientEmail,
    subject: `Tell us about your event — ${fromName}`,
    html: buildActionEmailHtml({
      businessInfo,
      heading: 'Tell us about your event',
      bodyHtml: `<p>Hi ${escapeHtml(recipientName) || 'there'},</p><p>Please share your event details using the secure link below so we can get your booking started. This link is unique to you — please don't forward it.</p>`,
      buttonText: 'Click here to submit your inquiry',
      buttonUrl: inquiryUrl,
    }),
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
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { recipientEmail, recipientName, bookingId } = req.body || {};
  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const normalizedOwnerEmail = normalizeValidEmail(owner?.email);
  const normalizedRecipientEmail = recipientEmail?.trim() ? normalizeValidEmail(recipientEmail) : null;
  if (!normalizedOwnerEmail) return res.status(400).json({ error: 'Your account needs a valid owner email address before inquiry links can be created.' });
  if (recipientEmail?.trim() && !normalizedRecipientEmail) return res.status(400).json({ error: 'Enter a valid recipient email address.' });
  const token = generateToken();

  const link = await prisma.inquiryLink.create({
    data: {
      accountId: req.membership.accountId,
      tokenHash: hashToken(token),
      status: 'open',
      expiresAt: newExpiry(),
      bookingId: bookingId || null,
      recipientEmail: normalizedRecipientEmail,
      recipientName: recipientName?.trim() || null,
      ownerEmail: normalizedOwnerEmail,
    },
  });

  const inquiryUrl = `${frontendUrl()}/inquiry/${token}`;
  let emailSent = false;
  let emailError = null;
  if (normalizedRecipientEmail) {
    try {
      await emailInquiryLink({ accountId: req.membership.accountId, recipientEmail: normalizedRecipientEmail, recipientName, inquiryUrl });
      await prisma.inquiryLink.update({ where: { id: link.id }, data: { sentAt: new Date() } });
      emailSent = true;
    } catch (err) {
      console.error('Failed to email inquiry link:', err);
      emailError = 'Link was created, but the email could not be sent — copy the link below to share it manually.';
    }
  }

  res.status(201).json({ link: serializeForOwner(link), inquiryLink: inquiryUrl, emailSent, emailError });
}));

async function createReusableLink(accountId, userId) {
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const ownerEmail = normalizeValidEmail(owner?.email);
  if (!ownerEmail) inquiryApplyError(400, 'Your account needs a valid owner email address before inquiry links can be created.');
  const token = generateToken();
  return prisma.inquiryLink.create({
    data: {
      accountId,
      tokenHash: hashToken(token),
      publicToken: token,
      status: 'open',
      isReusable: true,
      expiresAt: null,
      ownerEmail,
    },
  });
}

// The one account-wide "general" link a business can paste on their own
// website — get-or-create so callers never have to check existence first.
// Registered above /:id/regenerate below (both are POST, and Express
// matches in registration order) so "reusable-link" is never swallowed by
// the /:id pattern as if it were an id.
router.get('/reusable-link', asyncHandler(async (req, res) => {
  let link = await prisma.inquiryLink.findFirst({ where: { accountId: req.membership.accountId, isReusable: true } });
  if (!link) link = await createReusableLink(req.membership.accountId, req.session.userId);
  res.json({ link: serializeForOwner(link), inquiryLink: `${frontendUrl()}/inquiry/${link.publicToken}` });
}));

// Rotates the general link's token — old embedded URLs stop working, a
// fresh one is returned. Reuses the same row (unlike per-recipient
// regenerate, there's no 'open' guard needed since a reusable link never
// leaves that status).
router.post('/reusable-link/regenerate', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  let link = await prisma.inquiryLink.findFirst({ where: { accountId: req.membership.accountId, isReusable: true } });
  if (!link) {
    link = await createReusableLink(req.membership.accountId, req.session.userId);
  } else {
    const token = generateToken();
    link = await prisma.inquiryLink.update({ where: { id: link.id }, data: { tokenHash: hashToken(token), publicToken: token } });
  }
  res.json({ link: serializeForOwner(link), inquiryLink: `${frontendUrl()}/inquiry/${link.publicToken}` });
}));

// Issues a fresh token (and a fresh 30-day expiry) for a link that was lost
// before the client used it, or that expired unused — same idea as
// Contract's regenerate-client-link. Only valid while still 'open': once a
// client has submitted, the response is what matters, not the link itself.
router.post('/:id/regenerate', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
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

function inquiryEventName(response) {
  if (response.eventName?.trim()) return response.eventName.trim();
  const lastWord = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).at(-1) || '';
  return [[lastWord(response.groomName), lastWord(response.brideName)].filter(Boolean).join(' & '), response.eventType].filter(Boolean).join(' — ');
}

function mergeInquiryNotes(existing, details) {
  if (!details?.trim()) return existing || null;
  const next = `From inquiry form: ${details.trim()}`;
  return existing ? `${existing}\n\n${next}` : next;
}

function inquiryVenue(response, existing = {}, saved = null) {
  const pick = (...values) => values.find((value) => value) || '';
  return {
    name: pick(existing.name, saved?.name, response.venueName),
    address1: pick(existing.address1, saved?.address1, response.address1),
    address2: pick(existing.address2, saved?.address2, response.address2),
    city: pick(existing.city, saved?.city, response.city),
    state: pick(existing.state, saved?.state, response.state),
    zip: pick(existing.zip, saved?.zip, response.zip),
    contactName: pick(existing.contactName, saved?.contactName, response.venueContactName),
    contactPhone: pick(existing.contactPhone, saved?.contactPhone),
    contactPhoneExt: pick(existing.contactPhoneExt, saved?.contactPhoneExt),
    contactEmail: pick(existing.contactEmail, saved?.contactEmail, response.venueContactEmail),
    locationNote: pick(existing.locationNote, saved?.locationNote),
    loadInInfo: pick(existing.loadInInfo, saved?.loadInInfo),
  };
}

function inquiryApplyError(status, message) {
  throw Object.assign(new Error(message), { status, expose: true });
}

// Claims, converts, and marks an inquiry applied in one transaction. A
// retry after success returns the original result; concurrent attempts can
// never create a second Client/Booking.
router.post('/:id/apply', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const selectedClientId = req.body?.selectedClientId || null;
  const createNewClient = req.body?.createNewClient === true;
  const requestedCustomerEmail = req.body?.customerEmail;
  const result = await withSerializableTransaction(prisma, async (tx) => {
    let link = await tx.inquiryLink.findUnique({ where: { id: req.params.id } });
    if (!link || link.accountId !== req.membership.accountId) return { status: 404, error: 'Inquiry link not found.' };
    if (link.status === 'applied' && link.appliedBookingId && link.appliedClientId) {
      return { link, bookingId: link.appliedBookingId, clientId: link.appliedClientId, repeated: true };
    }
    const claimed = await tx.inquiryLink.updateMany({ where: { id: link.id, status: 'submitted' }, data: { status: 'applying' } });
    if (claimed.count !== 1) return { status: 409, error: 'This inquiry is already being applied. Refresh to see the completed booking.' };

    const response = { ...(link.response || {}), ...(requestedCustomerEmail !== undefined ? { email: requestedCustomerEmail } : {}) };
    const normalizedEmail = normalizeValidEmail(response.email);
    if (!normalizedEmail) inquiryApplyError(400, 'The inquiry needs a valid customer email before it can become a booking.');

    let booking = null;
    if (link.bookingId) {
      booking = await tx.booking.findFirst({ where: { id: link.bookingId, accountId: link.accountId, deletedAt: null } });
      if (!booking) inquiryApplyError(404, 'The booking this inquiry belongs to no longer exists.');
    }

    let clientId = booking?.clientId || selectedClientId;
    let resolvedClient = null;
    if (clientId) {
      resolvedClient = await tx.client.findFirst({ where: { id: clientId, accountId: link.accountId } });
      if (!resolvedClient) inquiryApplyError(400, 'The selected client is no longer available.');
    } else {
      const phoneNormalized = String(response.phone || '').replace(/\D/g, '') || null;
      const exact = createNewClient ? null : await tx.client.findFirst({ where: { accountId: link.accountId, OR: [
        { emailNormalized: normalizedEmail },
        ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] }, orderBy: { updatedAt: 'desc' } });
      if (exact) {
        resolvedClient = exact;
        clientId = exact.id;
      } else {
        const firstName = String(response.firstName || '').trim();
        const lastName = String(response.lastName || '').trim();
        resolvedClient = await tx.client.create({ data: {
          id: randomUUID(), accountId: link.accountId, firstName, lastName,
          email: normalizedEmail, emailNormalized: normalizedEmail,
          phone: response.phone?.trim() || null, phoneNormalized,
          nameNormalized: `${firstName} ${lastName}`.trim().toLowerCase(),
        } });
        clientId = resolvedClient.id;
      }
    }
    if (!normalizeValidEmail(resolvedClient.email)) {
      resolvedClient = await tx.client.update({ where: { id: resolvedClient.id }, data: { email: normalizedEmail, emailNormalized: normalizedEmail } });
    }

    const savedVenue = response.venueName ? await tx.venue.findFirst({ where: { accountId: link.accountId, name: { equals: response.venueName.trim(), mode: 'insensitive' } } }) : null;
    if (booking) {
      booking = await tx.booking.update({ where: { id: booking.id }, data: {
        clientId,
        eventDate: response.eventDate || booking.eventDate,
        eventType: response.eventType || booking.eventType,
        brideName: response.brideName || booking.brideName,
        groomName: response.groomName || booking.groomName,
        eventName: booking.eventName || inquiryEventName(response),
        notes: mergeInquiryNotes(booking.notes, response.details),
        venue: inquiryVenue(response, booking.venue || {}, savedVenue),
      } });
    } else {
      booking = await tx.booking.create({ data: {
        id: randomUUID(), accountId: link.accountId, clientId,
        eventName: inquiryEventName(response), eventDate: response.eventDate || null,
        eventType: response.eventType || null, brideName: response.brideName || null,
        groomName: response.groomName || null, notes: mergeInquiryNotes(null, response.details),
        bookingStatus: 'active', venue: inquiryVenue(response, {}, savedVenue),
      } });
    }

    link = await tx.inquiryLink.update({ where: { id: link.id }, data: {
      status: 'applied', appliedAt: new Date(), appliedBookingId: booking.id, appliedClientId: clientId, response: { ...response, email: normalizedEmail },
    } });
    return { link, bookingId: booking.id, clientId, repeated: false };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ link: serializeForOwner(result.link), bookingId: result.bookingId, clientId: result.clientId, repeated: result.repeated });
}));

// Hard delete, not soft — an inquiry link is a lightweight invite/response
// record, not a business record like Booking/Event, so there's no 30-day
// recoverability window here. The reusable "paste on your website" link is
// excluded: deleting it would break a URL the business has published
// externally, so that one only ever gets its token swapped via Regenerate.
// See inquiryLinkPurger.js for the automatic 48-hour equivalent (unused
// links only — this manual route allows deleting a submitted/applied one
// too, since that's a deliberate choice the owner is making).
router.delete('/:id', asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const link = await prisma.inquiryLink.findUnique({ where: { id: req.params.id } });
  if (!link || link.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Inquiry link not found.' });
  }
  if (link.isReusable) {
    return res.status(400).json({ error: "The reusable inquiry link can't be deleted — use Regenerate instead." });
  }
  await prisma.inquiryLink.delete({ where: { id: link.id } });
  res.json({ ok: true });
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
// which reads differently than "someone already submitted this." Reusable
// links skip both checks — they never change status and never expire (see
// the InquiryLink.isReusable model comment).
function publicAccessError(link) {
  if (link.isReusable) return null;
  if (link.status !== 'open') return { status: 410, error: 'This inquiry link has already been used.' };
  if (link.expiresAt && link.expiresAt < new Date()) return { status: 410, error: 'This inquiry link has expired. Please ask for a new one.' };
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
    brideName, groomName, eventName,
    venueName, address1, address2, city, state, zip, venueContactName, venueContactEmail,
    details,
  } = req.body || {};

  const normalizedEmail = normalizeValidEmail(email);
  if (!firstName?.trim() || !lastName?.trim() || !normalizedEmail || !eventDate) {
    return res.status(400).json({ error: 'First name, last name, a valid email address, and event date are required.' });
  }
  if (zip?.trim() && !/^\d{5}$/.test(zip.trim())) {
    return res.status(400).json({ error: 'Zip code must be 5 digits.' });
  }

  const response = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone?.trim() || '',
    email: normalizedEmail,
    eventDate,
    eventType: eventType || '',
    brideName: brideName?.trim() || '',
    groomName: groomName?.trim() || '',
    eventName: eventName?.trim() || '',
    venueName: venueName?.trim() || '',
    address1: address1?.trim() || '',
    address2: address2?.trim() || '',
    city: city?.trim() || '',
    state: state?.trim() || '',
    zip: zip?.trim() || '',
    venueContactName: venueContactName?.trim() || '',
    venueContactEmail: venueContactEmail?.trim() || '',
    details: details?.trim() || '',
  };

  // A reusable (general/website) link must keep working for the next
  // visitor, so its own row never becomes 'submitted' — instead each
  // submission spawns an ordinary one-off InquiryLink row that flows
  // through the normal owner review/apply path (see the isReusable model
  // comment). A regular per-recipient link just updates itself in place, as
  // before.
  let updated;
  if (link.isReusable) {
    updated = await prisma.inquiryLink.create({
      data: {
        accountId: link.accountId,
        tokenHash: hashToken(generateToken()),
        status: 'submitted',
        isReusable: false,
        expiresAt: null,
        ownerEmail: link.ownerEmail,
        recipientEmail: response.email || null,
        recipientName: `${response.firstName} ${response.lastName}`.trim(),
        submittedAt: new Date(),
        response,
      },
    });
  } else {
    const claimed = await prisma.inquiryLink.updateMany({
      where: { id: link.id, status: 'open' },
      data: { status: 'submitted', submittedAt: new Date(), response },
    });
    if (claimed.count !== 1) {
      return res.status(409).json({ error: 'This inquiry link has already been submitted.' });
    }
    updated = await prisma.inquiryLink.findUniqueOrThrow({ where: { id: link.id } });
  }

  // Best-effort nudge to the owner — the in-app "new inquiry response"
  // indicator on the Bookings page is the real notification, this is just
  // a heads-up if they're not looking at the app right now.
  const accountData = await prisma.accountData.findUnique({ where: { accountId: link.accountId } });
  const businessInfo = accountData?.data?.businessInfo || {};
  const fromName = businessInfo.name || 'GigWorks';
  try {
    await sendMail({
      from: await resolveFromHeader({ accountId: link.accountId, fromName, localPart: 'inquiries' }),
      to: updated.ownerEmail,
      subject: `New inquiry response — ${firstName.trim()} ${lastName.trim()}`,
      html: buildActionEmailHtml({
        businessInfo,
        heading: 'New inquiry response',
        bodyHtml: `<p>${escapeHtml(firstName.trim())} ${escapeHtml(lastName.trim())} just filled out an inquiry form. Review it and apply it to create the booking.</p>`,
        buttonText: 'Click here to review it in GigWorks',
        buttonUrl: `${frontendUrl()}/bookings`,
      }),
    });
  } catch (err) {
    // best effort — the in-app indicator is the real notification
    console.error(`Failed to email inquiry-response notification for link ${link.id}:`, err);
  }

  res.json({ ok: true });
}));

export default router;
