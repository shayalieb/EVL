import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { buildFromHeader, sendMail } from '../lib/mailer.js';

const router = Router();
router.use(requireAuth);

router.post('/send', asyncHandler(async (req, res) => {
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
