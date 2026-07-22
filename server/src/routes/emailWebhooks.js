import { Router } from 'express';
import { Webhook } from 'svix';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getResendClient } from '../lib/resend.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';

const router = Router();

function extractThreadId(addresses) {
  for (const addr of addresses || []) {
    const match = /^reply\+([^@]+)@/.exec(addr);
    if (match) return match[1];
  }
  return null;
}

async function fetchFullEmail(emailId) {
  const resend = getResendClient();
  const { data } = await resend.get(`/emails/receiving/${emailId}`);
  return data;
}

// Handles a reply to the "reply+support-<id>@..." alias sent to an account
// owner when an admin replies in Settings > Support. Any reply landing on
// that alias is assumed to be from that thread's account — the alias is
// never shared beyond the one notification email it was generated for.
async function handleSupportReply(res, rawId, event) {
  const thread = await prisma.supportThread.findUnique({
    where: { id: rawId },
    include: { account: { include: { memberships: true } } },
  });
  if (!thread) {
    console.warn(`Resend inbound webhook: no support thread found for id ${rawId}`);
    return res.json({ ok: true });
  }
  // No session on an inbound email — attribute the message to the account
  // owner, since the reply alias is only ever handed to them.
  const owner = thread.account.memberships.find((m) => m.role === 'owner');

  let full;
  try {
    full = await fetchFullEmail(event.data.email_id);
  } catch (err) {
    console.error('Failed to fetch received email body:', err);
    return res.json({ ok: true });
  }

  try {
    await prisma.supportMessage.create({
      data: {
        threadId: thread.id,
        direction: 'user',
        senderUserId: owner?.userId || thread.accountId,
        body: full?.html || full?.text || '',
        resendMessageId: event.data.email_id,
      },
    });
    // Mirrors the in-app reply behavior in support.js: a reply means the
    // issue isn't resolved, so reopen it if it had been closed.
    await prisma.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), status: 'open' } });
  } catch (err) {
    if (err.code !== 'P2002') throw err; // duplicate webhook delivery — idempotent no-op
    return res.json({ ok: true });
  }

  try {
    await sendMail({
      from: buildFromHeader(),
      to: process.env.SUPPORT_NOTIFICATION_EMAIL || 'shayalieberman@gmail.com',
      subject: `[Support] ${thread.subject}`,
      html: `<p>New reply by email:</p><p>${full?.html || full?.text || ''}</p>`,
    });
  } catch {
    // best effort — the message is already saved regardless of whether this send succeeds
  }

  res.json({ ok: true });
}

// Unauthenticated (no session) — verified via Svix signature instead. Body
// must be the exact raw bytes Resend sent, so this route is mounted with
// express.raw() ahead of the app's global express.json() in index.js.
router.post('/resend', asyncHandler(async (req, res) => {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Inbound email is not configured yet.' });
  }

  let event;
  try {
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
    event = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  if (event.type !== 'email.received') return res.json({ ok: true });

  const threadId = extractThreadId([...(event.data.to || []), ...(event.data.received_for || [])]);
  if (!threadId) {
    console.warn('Resend inbound webhook: no reply alias found in', event.data.to, event.data.received_for);
    return res.json({ ok: true });
  }

  if (threadId.startsWith('support-')) {
    return handleSupportReply(res, threadId.slice('support-'.length), event);
  }

  const thread = await prisma.emailThread.findUnique({ where: { id: threadId } });
  if (!thread) {
    console.warn(`Resend inbound webhook: no thread found for id ${threadId}`);
    return res.json({ ok: true });
  }

  let full;
  try {
    full = await fetchFullEmail(event.data.email_id);
  } catch (err) {
    console.error('Failed to fetch received email body:', err);
    return res.json({ ok: true });
  }

  try {
    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: 'inbound',
        fromAddress: full?.from || event.data.from,
        toAddress: thread.contractorEmail,
        subject: full?.subject || event.data.subject || '',
        body: full?.html || full?.text || '',
        resendMessageId: event.data.email_id,
        inReplyTo: full?.headers?.['in-reply-to'] || null,
      },
    });
    await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  } catch (err) {
    if (err.code !== 'P2002') throw err; // duplicate webhook delivery — idempotent no-op
  }

  res.json({ ok: true });
}));

export default router;
