import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { resolveFromHeader, sendMail, buildActionEmailHtml, buildInlineImageAttachments } from '../lib/mailer.js';
import { emailSendLimiter, requireEmailSendPermission } from '../lib/emailSendPolicy.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

// This sends real external email from the platform's own domain, so it's
// gated on manageBookings (proposal/contract sends are the only current
// caller) rather than just being logged in, plus a rate limit — bare
// requireAuth would let any self-signed-up account use it as an open relay.
router.post('/send', requireEmailSendPermission, emailSendLimiter, asyncHandler(async (req, res) => {
  const { to, subject, body, fromName, replyTo, pdfAttachment, inlineImages, wide } = req.body || {};
  if (!to?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
  }

  // Ad hoc attachment (e.g. a freshly generated proposal PDF) sent as base64
  // straight from the client — same shape as emailThreads.js's pdfAttachment.
  let attachments = pdfAttachment?.base64 ? [{
    content: pdfAttachment.base64,
    filename: pdfAttachment.filename || 'attachment.pdf',
    contentType: pdfAttachment.contentType || 'application/pdf',
  }] : [];
  attachments = [...attachments, ...buildInlineImageAttachments(inlineImages)];

  let data, error;
  try {
    const accountData = await prisma.accountData.findUnique({ where: { accountId: req.membership.accountId } });
    const businessInfo = accountData?.data?.businessInfo || {};
    const from = await resolveFromHeader({ accountId: req.membership.accountId, fromName, localPart: 'hello' });
    // bodyHtml, not escapeHtml(body) — this is already-composed HTML from the
    // client (a proposal cover note, etc.), same trust boundary as every
    // other buildActionEmailHtml caller. `wide` is set by callers whose body
    // carries richer content than a plain cover note (StagePlotEmailModal.jsx's
    // ad hoc, non-roster recipients) — see buildActionEmailHtml's own
    // comment for why the default width squeezes that content.
    ({ data, error } = await sendMail({ from, to, subject, html: buildActionEmailHtml({ businessInfo, bodyHtml: body, ...(wide ? { maxWidth: 640 } : {}) }), replyTo, attachments }));
  } catch {
    return res.status(503).json({ error: 'Email sending is not configured yet.' });
  }

  if (error) return res.status(502).json({ error: error.message || 'Failed to send email.' });
  res.json({ ok: true, id: data?.id });
}));

export default router;
