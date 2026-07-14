import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { resend } from '../lib/resend.js';

const router = Router();
router.use(requireAuth);

router.post('/send', asyncHandler(async (req, res) => {
  const { to, subject, body, fromName, replyTo } = req.body || {};
  if (!to?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
  }

  const from = `${(fromName || 'GigWorks').trim()} <${process.env.RESEND_FROM_EMAIL}>`;
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html: body,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  if (error) return res.status(502).json({ error: error.message || 'Failed to send email.' });
  res.json({ ok: true, id: data?.id });
}));

export default router;
