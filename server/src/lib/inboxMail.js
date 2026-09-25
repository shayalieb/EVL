import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { resolveReplyDomain } from './mailer.js';
import { mailbox, inboxHtml, outboundHistoryHtml } from './inboxContent.js';

export async function matchInboxContact(accountId, email, db = prisma) {
  const [clients, contractors] = await Promise.all([
    db.client.findMany({ where: { accountId, email: { equals: email, mode: 'insensitive' } }, take: 2, select: { id: true } }),
    db.contractor.findMany({ where: { accountId, email: { equals: email, mode: 'insensitive' } }, take: 2, select: { id: true } }),
  ]);
  const clientId = clients.length === 1 ? clients[0].id : null;
  const bookings = clientId ? await db.booking.findMany({ where: { accountId, clientId, deletedAt: null, completedAt: null, bookingStatus: 'active' }, take: 2, select: { id: true } }) : [];
  return { clientId, contractorId: contractors.length === 1 ? contractors[0].id : null, bookingId: bookings.length === 1 ? bookings[0].id : null };
}

export async function prepareInboxMail({ tracking, from, to, subject, html }, db = prisma, replyDomainResolver = resolveReplyDomain) {
  const email = mailbox(to);
  if (!email) throw new Error('A valid recipient is required for tracked email.');
  const accountId = tracking.accountId;
  const domain = await replyDomainResolver(accountId);
  let thread;
  if (tracking.threadId) {
    thread = await db.inboxThread.findFirst({ where: { id: tracking.threadId, accountId } });
    if (!thread || thread.contactEmail !== email) throw new Error('Inbox conversation not found.');
  } else if (tracking.bookingId) {
    thread = await db.inboxThread.findFirst({ where: { accountId, bookingId: tracking.bookingId, contactEmail: email }, orderBy: { lastMessageAt: 'desc' } });
  }
  if (!thread) {
    const contact = await matchInboxContact(accountId, email, db);
    const id = randomUUID();
    thread = await db.inboxThread.create({ data: {
      id, accountId, contactEmail: email, subject: subject.slice(0, 500), ...contact,
      bookingId: tracking.bookingId || contact.bookingId || null, eventId: tracking.eventId || null,
      replyAlias: domain ? `inbox+${id}@${domain}` : null,
      replyAliases: domain ? [`inbox+${id}@${domain}`] : [],
    } });
  } else {
    if (domain && thread.replyAlias !== `inbox+${thread.id}@${domain}`) {
      thread = await db.inboxThread.update({ where: { id: thread.id }, data: { replyAlias: `inbox+${thread.id}@${domain}`, replyAliases: [...new Set([...(thread.replyAliases || []), thread.replyAlias, `inbox+${thread.id}@${domain}`].filter(Boolean))] } });
    }
  }
  // Transactional messages contain bearer sign/pay tokens. Preserve the
  // readable content without retaining those secure links in shared history.
  const message = await db.inboxMessage.create({ data: {
    threadId: thread.id, direction: 'outbound', fromAddress: from, toAddress: email, subject: subject.slice(0, 500),
    body: tracking.body ? inboxHtml(tracking.body) : outboundHistoryHtml(html),
    attachments: tracking.storedAttachments?.length ? { create: tracking.storedAttachments } : undefined,
  } });
  const previous = await db.inboxMessage.findFirst({ where: { threadId: thread.id, direction: 'inbound', internetMessageId: { not: null } }, orderBy: { createdAt: 'desc' } });
  return { threadId: thread.id, messageId: message.id, replyTo: domain ? thread.replyAlias : null, headers: previous?.internetMessageId ? { 'In-Reply-To': previous.internetMessageId, References: previous.internetMessageId } : undefined };
}

export async function finishInboxMail(prepared, result, db = prisma) {
  await db.$transaction([
    db.inboxMessage.update({ where: { id: prepared.messageId }, data: { providerMessageId: result.data?.id || null, deliveryStatus: 'sent' } }),
    db.inboxThread.update({ where: { id: prepared.threadId }, data: { lastMessageAt: new Date(), archivedAt: null } }),
  ]);
}

export async function failInboxMail(prepared, db = prisma) {
  await db.inboxMessage.update({ where: { id: prepared.messageId }, data: { deliveryStatus: 'failed' } });
}
