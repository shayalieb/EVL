import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachUser, requirePlatformAdmin, requireAdminPermission, allPermissions } from '../lib/membership.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { sendMail, buildFromHeader, escapeHtml } from '../lib/mailer.js';
import { uploadFile, getSignedDownloadUrl } from '../lib/fileStorage.js';
import { VERTICALS } from '../lib/verticals.js';

const router = Router();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 3;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES } });

function uploadFiles(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'One or more files are too large (10MB max).' });
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `You can attach at most ${MAX_FILES} files.` });
    }
    if (err) return next(err);
    next();
  });
}

async function attachmentsData(accountId, files) {
  return Promise.all((files || []).map(async (f) => {
    const contentType = f.mimetype || 'application/octet-stream';
    const storageKey = await uploadFile({ accountId, buffer: f.buffer, contentType });
    return { filename: f.originalname, contentType, size: f.size, storageKey };
  }));
}

router.use(requireAuth, asyncHandler(attachUser), requirePlatformAdmin);
router.use('/accounts', requireAdminPermission('manageAccounts'));
router.use('/support', requireAdminPermission('manageSupport'));
router.use('/platform-admins', requireAdminPermission('manageAdmins'));

function ownerOf(account) {
  const owner = account.memberships.find((m) => m.role === 'owner');
  return owner
    ? { firstName: owner.user.firstName, lastName: owner.user.lastName, email: owner.user.email, hasPassword: !!owner.user.passwordHash }
    : null;
}

const emptyDataSummary = { contractors: 0, clients: 0, events: 0, bookings: 0 };

// Contractor/Client/Booking/Event are all real tables now (see each
// model's schema comment) — a per-model groupBy count is the direct
// equivalent of the jsonb_array_length query this replaced, and stays
// correct as more of AccountData.data gets graduated out of the blob.
// (This replaced a raw-SQL version that counted `data->'contractors'` etc.
// directly in the blob — silently wrong, always 0, ever since Contractor/
// Client moved to their own tables, since neither key exists in the blob
// anymore. Booking/Event would have hit the exact same bug if left as-is.)
// GROUP BY accountId can't use any single-tenant index, so this always scans
// every row on all four tables platform-wide — cost scales with total
// platform volume, not per-account. A short TTL cache keeps repeated admin
// page loads cheap without needing to invalidate on every write elsewhere;
// counts being up to a minute stale is fine for an internal dashboard.
const DATA_SUMMARY_CACHE_TTL_MS = 60 * 1000;
let dataSummaryCache = null; // { byAccountId, expiresAt }

async function fetchDataSummaries() {
  if (dataSummaryCache && dataSummaryCache.expiresAt > Date.now()) {
    return dataSummaryCache.byAccountId;
  }
  const [contractorCounts, clientCounts, bookingCounts, eventCounts] = await Promise.all([
    prisma.contractor.groupBy({ by: ['accountId'], _count: { _all: true } }),
    prisma.client.groupBy({ by: ['accountId'], _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['accountId'], _count: { _all: true }, where: { deletedAt: null } }),
    prisma.event.groupBy({ by: ['accountId'], _count: { _all: true }, where: { deletedAt: null } }),
  ]);
  const byAccountId = new Map();
  const apply = (rows, key) => {
    for (const row of rows) {
      const existing = byAccountId.get(row.accountId) || { ...emptyDataSummary };
      existing[key] = row._count._all;
      byAccountId.set(row.accountId, existing);
    }
  };
  apply(contractorCounts, 'contractors');
  apply(clientCounts, 'clients');
  apply(bookingCounts, 'bookings');
  apply(eventCounts, 'events');
  dataSummaryCache = { byAccountId, expiresAt: Date.now() + DATA_SUMMARY_CACHE_TTL_MS };
  return byAccountId;
}

router.get('/accounts', asyncHandler(async (req, res) => {
  const [accounts, dataSummaries] = await Promise.all([
    prisma.account.findMany({
      include: { memberships: { include: { user: true } }, disabledBy: true, approvedBy: true },
      orderBy: { createdAt: 'desc' },
    }),
    fetchDataSummaries(),
  ]);
  res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      disabledAt: a.disabledAt,
      disabledReason: a.disabledReason,
      disabledBy: a.disabledBy ? { firstName: a.disabledBy.firstName, lastName: a.disabledBy.lastName } : null,
      approvedAt: a.approvedAt,
      approvedBy: a.approvedBy ? { firstName: a.approvedBy.firstName, lastName: a.approvedBy.lastName } : null,
      vertical: a.vertical,
      allVerticalsEnabled: a.allVerticalsEnabled,
      owner: ownerOf(a),
      memberCount: a.memberships.length,
      dataSummary: dataSummaries.get(a.id) || emptyDataSummary,
    })),
  });
}));

// Shared by POST /accounts and POST /platform-admins/invite — both create a
// brand-new User (+ their own Account/Membership, so they're never stuck on
// NoAccountAccessPage) with no password, then email a set-your-password
// link reusing the exact forgot-password reset mechanism.
const ADMIN_PERMISSION_KEYS = ['manageAccounts', 'manageAccountStatus', 'manageSupport', 'manageAdmins'];

// Defensive allowlist — only known keys, coerced to plain booleans, so a
// malformed/extra request-body field can never end up stored as-is.
function sanitizeAdminPermissions(input) {
  const result = {};
  for (const key of ADMIN_PERMISSION_KEYS) result[key] = !!input?.[key];
  return result;
}

async function createInvitedUser({ firstName, lastName, email }, { grantAdmin = false, permissions, approvedById } = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          passwordHash: null,
          isPlatformAdmin: grantAdmin,
          adminPermissions: grantAdmin ? sanitizeAdminPermissions(permissions) : {},
        },
      });
      // approvedAt set immediately — an admin created this account directly,
      // so it was never really "unreviewed" the way a cold public self-signup
      // is (see schema.prisma's Account.approvedAt).
      const account = await tx.account.create({ data: { approvedAt: new Date(), approvedById } });
      await tx.membership.create({
        data: { userId: newUser.id, accountId: account.id, role: 'owner', permissions: allPermissions() },
      });
      return newUser;
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
    }
    throw err;
  }

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  const setupUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  try {
    await sendMail({
      from: buildFromHeader(),
      to: normalizedEmail,
      subject: grantAdmin ? "You've been invited to GigWorks as an admin" : "You've been invited to GigWorks",
      html: `<p>An account has been created for you${grantAdmin ? ' with admin access' : ''}. Click below to set your password and get started. This link expires in 1 hour.</p><p><a href="${setupUrl}">${setupUrl}</a></p>`,
    });
  } catch {
    // best effort — the account still exists even if the invite email fails to send
  }

  return user;
}

router.post('/accounts', asyncHandler(async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }
  try {
    await createInvitedUser({ firstName, lastName, email }, { approvedById: req.user.id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  res.status(201).json({ ok: true });
}));

// Disabling/enabling is a materially more consequential action than plain
// account viewing/creation, so it needs its own stricter permission on top
// of the blanket 'manageAccounts' gate this route already sits behind.
function requireManageAccountStatus(req, res) {
  if (req.user?.isPlatformOwner || req.user?.adminPermissions?.manageAccountStatus) return true;
  res.status(403).json({ error: 'Not authorized.' });
  return false;
}

router.patch('/accounts/:id', asyncHandler(async (req, res) => {
  if (!requireManageAccountStatus(req, res)) return;
  const { disabled, reason, allVerticalsEnabled, vertical, approved } = req.body || {};
  const data = {};
  // One-way — there's no "un-approve" here, revoking access after the fact
  // is what disable is for. approved: false is accepted as a no-op rather
  // than rejected, so a caller that always sends the field doesn't need to
  // special-case the true/false split.
  if (approved === true) {
    data.approvedAt = new Date();
    data.approvedById = req.user.id;
  }
  if (disabled !== undefined) {
    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ error: 'disabled must be a boolean.' });
    }
    if (disabled && !reason?.trim()) {
      return res.status(400).json({ error: 'A reason is required to disable an account.' });
    }
    Object.assign(data, disabled
      ? { disabledAt: new Date(), disabledReason: reason.trim(), disabledById: req.user.id }
      : { disabledAt: null, disabledReason: null, disabledById: null });
  }
  // Manual multi-vertical unlock — no billing gate yet, see verticals.js.
  if (allVerticalsEnabled !== undefined) {
    if (typeof allVerticalsEnabled !== 'boolean') {
      return res.status(400).json({ error: 'allVerticalsEnabled must be a boolean.' });
    }
    data.allVerticalsEnabled = allVerticalsEnabled;
  }
  if (vertical !== undefined) {
    if (!VERTICALS.includes(vertical)) {
      return res.status(400).json({ error: 'Invalid vertical.' });
    }
    data.vertical = vertical;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }
  const account = await prisma.account.update({ where: { id: req.params.id }, data, include: { disabledBy: true, approvedBy: true } });
  res.json({
    ok: true,
    disabledAt: account.disabledAt,
    disabledReason: account.disabledReason,
    disabledBy: account.disabledBy ? { firstName: account.disabledBy.firstName, lastName: account.disabledBy.lastName } : null,
    approvedAt: account.approvedAt,
    approvedBy: account.approvedBy ? { firstName: account.approvedBy.firstName, lastName: account.approvedBy.lastName } : null,
    allVerticalsEnabled: account.allVerticalsEnabled,
    vertical: account.vertical,
  });
}));

router.delete('/accounts/:id', asyncHandler(async (req, res) => {
  if (!requireManageAccountStatus(req, res)) return;
  // Deleting just the Account would cascade-remove its Memberships but leave
  // the member Users behind — since User.email is unique, that silently
  // blocks re-inviting the same email later. Delete the users first so their
  // email frees up.
  const memberships = await prisma.membership.findMany({
    where: { accountId: req.params.id },
    select: { userId: true },
  });
  await prisma.$transaction([
    prisma.user.deleteMany({ where: { id: { in: memberships.map((m) => m.userId) } } }),
    prisma.account.delete({ where: { id: req.params.id } }),
  ]);
  res.json({ ok: true });
}));

function serializeThread(thread) {
  const unreadFromUser = thread.messages.filter((m) => m.direction === 'user' && !m.readAt).length;
  // Last message overall (regardless of read state) — if the customer spoke last on
  // an open thread, nobody has answered them yet, which is a different signal than
  // "unread" (viewing the thread marks messages read without necessarily replying).
  const lastMessage = thread.messages.reduce((latest, m) => (!latest || m.createdAt > latest.createdAt ? m : latest), null);
  const awaitingReply = thread.status === 'open' && lastMessage?.direction === 'user';
  return {
    id: thread.id,
    ticketNumber: thread.ticketNumber,
    subject: thread.subject,
    status: thread.status,
    priority: thread.priority,
    closedReason: thread.closedReason,
    closedReasonDetail: thread.closedReasonDetail,
    satisfactionRating: thread.satisfactionRating,
    satisfactionComment: thread.satisfactionComment,
    assignedAdminId: thread.assignedAdminId,
    assignedAdmin: thread.assignedAdmin ? { firstName: thread.assignedAdmin.firstName, lastName: thread.assignedAdmin.lastName } : null,
    lastMessageAt: thread.lastMessageAt,
    createdAt: thread.createdAt,
    unreadFromUser,
    awaitingReply,
    waitingSince: awaitingReply ? lastMessage.createdAt : null,
    account: { id: thread.account.id, owner: ownerOf(thread.account) },
  };
}

const attachmentSelect = { select: { id: true, filename: true, contentType: true, size: true } };
const CLOSE_REASON_LABELS = { completed: 'Completed', not_completed: 'Not Completed', other: 'Other' };

router.get('/support/threads', asyncHandler(async (req, res) => {
  const threads = await prisma.supportThread.findMany({
    include: {
      messages: { include: { attachments: attachmentSelect } },
      account: { include: { memberships: { include: { user: true } } } },
      assignedAdmin: true,
    },
    orderBy: { lastMessageAt: 'desc' },
  });
  res.json({ threads: threads.map(serializeThread) });
}));

// Assignee-picker options — deliberately its own route rather than reusing
// GET /platform-admins, which requires 'manageAdmins' and would 403 for a
// support-scoped admin populating their own ticket's assignee dropdown.
router.get('/support/assignable-admins', asyncHandler(async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { OR: [{ isPlatformOwner: true }, { isPlatformAdmin: true }] },
    orderBy: { firstName: 'asc' },
  });
  const assignable = admins.filter((a) => a.isPlatformOwner || a.adminPermissions?.manageSupport);
  res.json({ admins: assignable.map((a) => ({ id: a.id, firstName: a.firstName, lastName: a.lastName })) });
}));

function serializeNote(note) {
  return { id: note.id, body: note.body, createdAt: note.createdAt, author: { firstName: note.author.firstName, lastName: note.author.lastName } };
}

router.get('/support/threads/:id', asyncHandler(async (req, res) => {
  const thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, include: { attachments: attachmentSelect } },
      notes: { orderBy: { createdAt: 'asc' }, include: { author: true } },
      account: { include: { memberships: { include: { user: true } } } },
      assignedAdmin: true,
    },
  });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });
  res.json({ thread: { ...serializeThread(thread), messages: thread.messages, notes: thread.notes.map(serializeNote) } });
}));

router.patch('/support/threads/:id/read', asyncHandler(async (req, res) => {
  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });
  await prisma.supportMessage.updateMany({
    where: { threadId: thread.id, direction: 'user', readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

router.post('/support/threads/:id/notes', asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Note body is required.' });

  const thread = await prisma.supportThread.findUnique({ where: { id: req.params.id } });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });

  const note = await prisma.supportNote.create({
    data: { threadId: thread.id, authorUserId: req.session.userId, body: body.trim() },
    include: { author: true },
  });
  res.status(201).json({ note: serializeNote(note) });
}));

router.post('/support/threads/:id/messages', uploadFiles, asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });

  let thread = await prisma.supportThread.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { memberships: { include: { user: true } } } } },
  });
  if (!thread) return res.status(404).json({ error: 'Thread not found.' });

  if (!thread.replyToAlias && process.env.RESEND_INBOUND_DOMAIN) {
    thread = await prisma.supportThread.update({
      where: { id: thread.id },
      data: { replyToAlias: `reply+support-${thread.id}@${process.env.RESEND_INBOUND_DOMAIN}` },
      include: { account: { include: { memberships: { include: { user: true } } } } },
    });
  }

  const dbAttachments = await attachmentsData(thread.accountId, req.files);
  const message = await prisma.supportMessage.create({
    data: {
      threadId: thread.id,
      direction: 'admin',
      senderUserId: req.session.userId,
      body: body.trim(),
      attachments: { create: dbAttachments },
    },
    include: { attachments: attachmentSelect },
  });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

  const owner = thread.account.memberships.find((m) => m.role === 'owner');
  if (owner) {
    const lastOutbound = await prisma.supportMessage.findFirst({
      where: { threadId: thread.id, direction: 'admin', resendMessageId: { not: null }, id: { not: message.id } },
      orderBy: { createdAt: 'desc' },
    });
    const headers = lastOutbound?.resendMessageId
      ? { 'In-Reply-To': lastOutbound.resendMessageId, References: lastOutbound.resendMessageId }
      : undefined;
    const attachments = (req.files || []).map((f) => ({
      content: f.buffer.toString('base64'),
      filename: f.originalname,
      contentType: f.mimetype || 'application/octet-stream',
    }));

    try {
      const sent = await sendMail({
        from: buildFromHeader(),
        to: owner.user.email,
        subject: `Re: ${thread.subject}`,
        html: `<p>You have a new reply to your support request "${escapeHtml(thread.subject)}":</p><p>${escapeHtml(body.trim())}</p><p>Reply to this email to continue the conversation, or sign in to GigWorks.</p>`,
        replyTo: thread.replyToAlias || undefined,
        headers,
        attachments: attachments.length ? attachments : undefined,
      });
      if (sent?.data?.id) {
        await prisma.supportMessage.update({ where: { id: message.id }, data: { resendMessageId: sent.data.id } });
      }
    } catch (err) {
      // best effort — the reply is already saved regardless of whether this notification sends
      console.error(`Failed to email support reply notification for thread ${thread.id}:`, err);
    }
  }

  res.status(201).json({ message });
}));

router.patch('/support/threads/:id', asyncHandler(async (req, res) => {
  const { status, priority, assignedAdminId, closedReason, closedReasonDetail } = req.body || {};
  const data = {};
  if (status !== undefined) {
    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'status must be "open" or "closed".' });
    }
    if (status === 'closed') {
      if (!['completed', 'not_completed', 'other'].includes(closedReason)) {
        return res.status(400).json({ error: 'closedReason must be one of completed, not_completed, other.' });
      }
      if (!closedReasonDetail?.trim()) {
        return res.status(400).json({ error: 'A reason is required to close a ticket.' });
      }
      data.closedReason = closedReason;
      data.closedReasonDetail = closedReasonDetail.trim();
    } else {
      // Reopening — the closure record no longer describes the ticket's current state.
      data.closedReason = null;
      data.closedReasonDetail = null;
    }
    data.status = status;
  }
  if (priority !== undefined) {
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({ error: 'priority must be one of low, normal, high, urgent.' });
    }
    data.priority = priority;
  }
  if (assignedAdminId !== undefined) {
    data.assignedAdminId = assignedAdminId || null;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }
  const thread = await prisma.supportThread.update({
    where: { id: req.params.id },
    data,
    include: { assignedAdmin: true, account: { include: { memberships: { include: { user: true } } } } },
  });

  if (data.status === 'closed') {
    const owner = thread.account.memberships.find((m) => m.role === 'owner');
    if (owner) {
      try {
        await sendMail({
          from: buildFromHeader(),
          to: owner.user.email,
          subject: `Ticket #${thread.ticketNumber} closed: ${thread.subject}`,
          html: `<p>Your support ticket #${thread.ticketNumber} — "${escapeHtml(thread.subject)}" — has been closed as <strong>${escapeHtml(CLOSE_REASON_LABELS[thread.closedReason] || thread.closedReason)}</strong>.</p><p>${escapeHtml(thread.closedReasonDetail)}</p><p>If this isn't resolved, just reply to this email or sign in to GigWorks and reply to reopen it.</p>`,
        });
      } catch (err) {
        // best effort — the ticket is already closed regardless of whether this notification sends
        console.error(`Failed to email ticket-closed notification for thread ${thread.id}:`, err);
      }
    }
  }

  res.json({
    ok: true,
    status: thread.status,
    priority: thread.priority,
    closedReason: thread.closedReason,
    closedReasonDetail: thread.closedReasonDetail,
    assignedAdminId: thread.assignedAdminId,
    assignedAdmin: thread.assignedAdmin ? { firstName: thread.assignedAdmin.firstName, lastName: thread.assignedAdmin.lastName } : null,
  });
}));

router.get('/support/attachments/:id/download', asyncHandler(async (req, res) => {
  const attachment = await prisma.supportAttachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
  if (attachment.storageKey) {
    return res.redirect(302, await getSignedDownloadUrl(attachment.storageKey, attachment.filename));
  }
  res.setHeader('Content-Type', attachment.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
  res.send(attachment.data);
}));

function serializeAdmin(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isPlatformOwner: user.isPlatformOwner,
    adminPermissions: user.adminPermissions,
    createdAt: user.createdAt,
  };
}

router.get('/platform-admins', asyncHandler(async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    orderBy: { isPlatformOwner: 'desc' },
  });
  res.json({ admins: admins.map(serializeAdmin) });
}));

// Grants access to an email that already has an account — the account
// itself still isn't self-serve creatable through this route.
router.post('/platform-admins', asyncHandler(async (req, res) => {
  const { email, permissions } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return res.status(404).json({ error: 'No account exists with that email yet. Use "Invite New Admin" instead.' });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isPlatformAdmin: true, adminPermissions: sanitizeAdminPermissions(permissions) },
  });
  res.status(201).json({ admin: serializeAdmin(updated) });
}));

// Combines account creation + admin grant in one step, for someone who
// doesn't have an account yet.
router.post('/platform-admins/invite', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, permissions } = req.body || {};
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }
  let user;
  try {
    user = await createInvitedUser({ firstName, lastName, email }, { grantAdmin: true, permissions, approvedById: req.user.id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  res.status(201).json({ admin: serializeAdmin(user) });
}));

// Adjust an existing admin's permissions without a revoke-then-regrant
// round trip. The owner's access is implicit/always-full and isn't stored
// as permissions, so there's nothing meaningful to edit for them.
router.patch('/platform-admins/:id', asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.isPlatformOwner) {
    return res.status(400).json({ error: "The owner's access is always full and can't be edited." });
  }
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { adminPermissions: sanitizeAdminPermissions(req.body?.permissions) },
  });
  res.json({ admin: serializeAdmin(updated) });
}));

router.delete('/platform-admins/:id', asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  // The owner is permanently protected — checked on the target, not the
  // caller, so this holds no matter who's attempting the revoke.
  if (target.isPlatformOwner) {
    return res.status(403).json({ error: "The owner's access can't be removed." });
  }

  await prisma.user.update({ where: { id: target.id }, data: { isPlatformAdmin: false, adminPermissions: {} } });
  res.json({ ok: true });
}));

export default router;
