import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createRateLimiter } from '../lib/rateLimiter.js';
import {
  answerAssistantQuestion,
  draftProposalFromInquiry,
  createReminderAction,
  addClientAction,
  createBookingAction,
  updateBookingAction,
} from '../lib/gigworksAssistant.js';

const router = Router();
router.use(requireAuth, asyncHandler(attachMembership));

// Per-account, not per-IP — several people on one account sharing an
// office IP shouldn't share a budget, and one account script-looping
// requests shouldn't burn through everyone else's.
const assistantLimiter = createRateLimiter('assistant-query', {
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => req.membership.accountId,
  message: { error: 'Too many assistant requests — please wait a moment and try again.' },
});

function requireBookingsPermission(req, res) {
  if (!effectivePermissions(req.membership).manageBookings) {
    res.status(403).json({ error: 'Not authorized.' });
    return false;
  }
  return true;
}

// How much prior conversation to feed back into the tool loop as context —
// bounds both token cost and how far back "it"/"that" can sensibly refer,
// independent of the 7-day *display* window (a very chatty week could
// still exceed this before it exceeds 7 days).
const HISTORY_CONTEXT_TURNS = 20;
const HISTORY_RETENTION_DAYS = 7;

router.post('/ask', assistantLimiter, asyncHandler(async (req, res) => {
  if (!requireBookingsPermission(req, res)) return;
  const { question } = req.body || {};
  const trimmedQuestion = question?.trim();
  if (!trimmedQuestion) return res.status(400).json({ error: 'A question is required.' });

  // History now lives server-side (AssistantMessage), not sent by the
  // client — one source of truth, and it's what makes a reloaded chat able
  // to continue with real context instead of starting cold.
  const recent = await prisma.assistantMessage.findMany({
    where: { accountId: req.membership.accountId, userId: req.session.userId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_CONTEXT_TURNS,
    select: { role: true, content: true },
  });
  const history = recent.reverse();

  try {
    const result = await answerAssistantQuestion(req.membership.accountId, trimmedQuestion, history);
    // A proposed action can come back with no accompanying text (e.g. the
    // model went straight to propose_update_booking) — pendingAction/link
    // themselves are never persisted (a stale re-confirmable card for a
    // days-old proposal would be actively wrong to show), but falling back
    // to its description at least avoids a reloaded chat showing the
    // user's question with no reply at all.
    const persistedAnswer = result.answer || (result.pendingAction ? `Proposed: ${result.pendingAction.description}` : null) || (result.link ? `Linked to: ${result.link.label}` : null);
    // Best-effort, same reasoning as the activity log below — persisting
    // history should never block the answer the user is already waiting on.
    Promise.all([
      prisma.assistantMessage.create({ data: { accountId: req.membership.accountId, userId: req.session.userId, role: 'user', content: trimmedQuestion } }),
      persistedAnswer && prisma.assistantMessage.create({ data: { accountId: req.membership.accountId, userId: req.session.userId, role: 'assistant', content: persistedAnswer } }),
    ]).then(() => {
      const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return prisma.assistantMessage.deleteMany({ where: { accountId: req.membership.accountId, userId: req.session.userId, createdAt: { lt: cutoff } } });
    }).catch((err) => console.error('Failed to persist assistant chat history:', err));
    res.json(result);
  } catch (err) {
    console.error('GigWorks Assistant /ask failed:', err);
    res.status(502).json({ error: err.message || 'The assistant is unavailable right now.' });
  }
}));

// Last 7 days only — older messages are opportunistically purged above
// each time this user sends a new question, so this filter is mostly a
// backstop for a user who hasn't asked anything in a while.
router.get('/messages', asyncHandler(async (req, res) => {
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const messages = await prisma.assistantMessage.findMany({
    where: { accountId: req.membership.accountId, userId: req.session.userId, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ messages });
}));

// Only ever clears the caller's own chat — never another team member's,
// even though everyone on the account shares the same Activity log above.
router.delete('/messages', asyncHandler(async (req, res) => {
  await prisma.assistantMessage.deleteMany({ where: { accountId: req.membership.accountId, userId: req.session.userId } });
  res.json({ ok: true });
}));

// Every action type re-checks permissions from scratch here — never trusts
// that a client-echoed pendingAction payload is safe just because it
// originated from a prior /ask response. `targetType` matches
// Reminder.relatedType's vocabulary — used to build a "View" link the same
// way relatedRecordPath already does for reminders.
const ACTION_HANDLERS = {
  create_reminder: { handler: (req, fields) => createReminderAction(req.membership.accountId, req.session.userId, fields), targetType: null },
  add_client: { handler: (req, fields) => addClientAction(req.membership.accountId, fields), requirePermission: 'manageClients', targetType: 'client' },
  create_booking: { handler: (req, fields) => createBookingAction(req.membership.accountId, fields), requirePermission: 'manageBookings', targetType: 'booking' },
  update_booking: { handler: (req, fields) => updateBookingAction(req.membership.accountId, fields), requirePermission: 'manageBookings', targetType: 'booking' },
};

router.post('/confirm-action', assistantLimiter, asyncHandler(async (req, res) => {
  const { type, fields, description } = req.body || {};
  const action = ACTION_HANDLERS[type];
  if (!action) return res.status(400).json({ error: 'Unknown action type.' });
  if (action.requirePermission && !effectivePermissions(req.membership)[action.requirePermission]) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  try {
    const result = await action.handler(req, fields);
    // Best-effort — logging the action for the Activity view should never
    // block or fail the write itself, which has already succeeded by now.
    prisma.assistantAction.create({
      data: {
        accountId: req.membership.accountId,
        userId: req.session.userId,
        type,
        description: description || type,
        targetType: action.targetType,
        targetId: action.targetType ? result?.id || null : null,
      },
    }).catch((err) => console.error('Failed to log assistant action:', err));
    res.status(201).json({ type, result });
  } catch (err) {
    console.error(`GigWorks Assistant /confirm-action (${type}) failed:`, err);
    res.status(400).json({ error: err.message || 'Failed to complete that action.' });
  }
}));

router.get('/activity', asyncHandler(async (req, res) => {
  const actions = await prisma.assistantAction.findMany({
    where: { accountId: req.membership.accountId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ actions });
}));

router.post('/draft-proposal', assistantLimiter, asyncHandler(async (req, res) => {
  if (!requireBookingsPermission(req, res)) return;
  const { bookingId, inquiryText } = req.body || {};
  if (!inquiryText?.trim()) return res.status(400).json({ error: 'Inquiry text is required.' });
  try {
    const draft = await draftProposalFromInquiry(req.membership.accountId, { bookingId, inquiryText: inquiryText.trim() });
    res.json({ draft });
  } catch (err) {
    console.error('GigWorks Assistant /draft-proposal failed:', err);
    res.status(502).json({ error: err.message || 'The assistant is unavailable right now.' });
  }
}));

export default router;
