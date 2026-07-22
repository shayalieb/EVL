import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { buildFromHeader, sendMail } from '../lib/mailer.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

// This sends real external email from the platform's own domain, so it's
// gated on manageBookings (proposal/contract sends are the only current
// caller) rather than just being logged in, plus a rate limit — bare
// requireAuth would let any self-signed-up account use it as an open relay.
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many emails sent. Please try again later.' },
});

router.post('/send', sendLimiter, asyncHandler(async (req, res) => {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  const { to, subject, body, fromName, replyTo, pdfAttachment } = req.body || {};
  if (!to?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
  }

  // Ad hoc attachment (e.g. a freshly generated proposal PDF) sent as base64
  // straight from the client — same shape as emailThreads.js's pdfAttachment.
  const attachments = pdfAttachment?.base64 ? [{
    content: pdfAttachment.base64,
    filename: pdfAttachment.filename || 'attachment.pdf',
    contentType: pdfAttachment.contentType || 'application/pdf',
  }] : undefined;

  let data, error;
  try {
    ({ data, error } = await sendMail({ from: buildFromHeader(fromName), to, subject, html: body, replyTo, attachments }));
  } catch {
    return res.status(503).json({ error: 'Email sending is not configured yet.' });
  }

  if (error) return res.status(502).json({ error: error.message || 'Failed to send email.' });
  res.json({ ok: true, id: data?.id });
}));

export default router;
