import { Router } from 'express';
import { Webhook } from 'svix';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getResendClient } from '../lib/resend.js';
import { sendMail, buildFromHeader, escapeHtml } from '../lib/mailer.js';
import { stripQuotedText, stripQuotedHtml } from '../lib/emailQuoteStrip.js';
import { classifyContractorReply } from '../lib/emailReplyClassifier.js';
import { applyAiReplyClassification } from '../lib/contractorAiStatusUpdate.js';

const router = Router();

// A reply's `full.html` is a whole inbound email — from whoever's on the
// thread, not just the account owner — so it goes through a strict allowlist
// (no script/style/img/iframe/on*-handlers/javascript: URLs) before it's
// forwarded into the admin notification below, rather than trusted as-is
// the way a self-authored template body is elsewhere in this app.
const REPLY_HTML_SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'div', 'span'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

function safeReplyHtml(full) {
  if (full?.html) return sanitizeHtml(full.html, REPLY_HTML_SANITIZE_OPTIONS);
  return escapeHtml(full?.text || '');
}

// For SupportMessage.body, which is rendered as plain JSX text elsewhere in
// the app (not dangerouslySetInnerHTML) — storing HTML tags here would just
// show up as literal, unreadable markup, so this strips to plain text
// instead of preserving any formatting.
function safeReplyText(full) {
  if (full?.text) return full.text;
  if (full?.html) return sanitizeHtml(full.html, { allowedTags: [], allowedAttributes: {} });
  return '';
}

function toPlainText(html) {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} });
}

// Strips the quoted thread history out of an inbound contractor reply so
// only their new words are stored/shown/classified — see
// emailQuoteStrip.js. Returns the HTML to store as EmailMessage.body (same
// permissive-tags trust boundary as before quote-stripping was added —
// EmailThreadModal.jsx sanitizes with DOMPurify at render time) and the
// plain text to feed the AI classifier.
function cleanReplyContent(full) {
  const plainReply = full?.text
    ? stripQuotedText(full.text)
    : stripQuotedText(toPlainText(full?.html));

  let storedBody = full?.html
    ? stripQuotedHtml(full.html, { allowedTags: false, allowedAttributes: false, allowVulnerableTags: true })
    : escapeHtml(plainReply);

  // Stripping can occasionally consume the whole message (e.g. a bottom-post
  // reply, or a client that doesn't mark quotes in a way we recognize) — an
  // empty bubble is worse than an unstripped one, so fall back to the raw
  // body rather than show nothing.
  if (!toPlainText(storedBody).trim() && full?.html) {
    storedBody = full.html;
  }

  return { storedBody, plainReply };
}

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
        body: safeReplyText(full),
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
      html: `<p>New reply by email:</p><p>${safeReplyHtml(full)}</p>`,
    });
  } catch (err) {
    // best effort — the message is already saved regardless of whether this send succeeds
    console.error(`Failed to email support-reply forward for thread ${thread.id}:`, err);
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

  const { storedBody, plainReply } = cleanReplyContent(full);

  const [contractor, eventRecord] = await Promise.all([
    prisma.contractor.findUnique({ where: { id: thread.contractorId } }),
    prisma.event.findUnique({ where: { id: thread.eventId } }),
  ]);
  const contractorName = contractor ? [contractor.firstName, contractor.lastName].filter(Boolean).join(' ') : null;

  // Best-effort — a classifier failure (no API key yet, no credits, rate
  // limit, network error) should never block storing the reply itself.
  let aiClassification = null;
  try {
    aiClassification = await classifyContractorReply({
      replyText: plainReply,
      contractorName,
      eventName: eventRecord?.name,
      eventDate: eventRecord?.eventDate,
    });
  } catch (err) {
    console.error(`AI reply classification failed for thread ${thread.id}:`, err);
  }

  try {
    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: 'inbound',
        fromAddress: full?.from || event.data.from,
        toAddress: thread.contractorEmail,
        subject: full?.subject || event.data.subject || '',
        body: storedBody,
        resendMessageId: event.data.email_id,
        inReplyTo: full?.headers?.['in-reply-to'] || null,
        aiClassification,
      },
    });
    await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  } catch (err) {
    if (err.code !== 'P2002') throw err; // duplicate webhook delivery — idempotent no-op
    return res.json({ ok: true });
  }

  // Confident (non-ambiguous) classification — try to auto-update the
  // contractor's booking status. Also best-effort: this is a bonus on top of
  // the message already being safely stored above, not a requirement for
  // this webhook to succeed.
  if (eventRecord && (aiClassification === 'confirmed' || aiClassification === 'declined')) {
    try {
      const accountData = await prisma.accountData.findUnique({ where: { accountId: thread.accountId } });
      const inquiryStatuses = accountData?.data?.inquiryStatuses || [];
      const update = applyAiReplyClassification({
        event: eventRecord,
        inquiryStatuses,
        contractorId: thread.contractorId,
        classification: aiClassification,
        contractorName,
      });
      if (update) {
        await prisma.event.update({ where: { id: eventRecord.id }, data: update });
      }
    } catch (err) {
      console.error(`Failed to apply AI status update for thread ${thread.id}:`, err);
    }
  }

  res.json({ ok: true });
}));

export default router;
