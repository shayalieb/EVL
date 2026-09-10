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
  updateClientAction,
  addContractorAction,
  updateContractorAction,
  addVenueAction,
  createBookingAction,
  updateBookingAction,
  updateEventAction,
  findHelpArticles,
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
const PROPOSAL_TTL_MS = 30 * 60 * 1000;
const TRAINING_GUIDE_STEP_COUNTS = new Map([['setup-business', 4], ['migrate-data', 5], ['first-booking', 4], ['staff-event', 4], ['invoice-payment', 4], ['pay-contractors', 3], ['day-of', 3]]);

export function fallbackTrainingAnswer(question) {
  const migrationQuestion = /(migrat|import|pandadoc|google calendar|client (?:csv|list)|move (?:my|our) (?:data|records|clients))/i.test(String(question || ''));
  if (migrationQuestion) {
    const source = /pandadoc/i.test(question) ? 'PandaDoc' : /google calendar/i.test(question) ? 'Google Calendar' : /client (?:csv|list)/i.test(question) ? 'client list' : null;
    return {
      answer: source
        ? `## Step 1: Export from ${source}\nOpen the migration guide and follow only the ${source} export instructions. Save an untouched copy of the export; nothing should be deleted from the source system.\n\nTell me when the export is ready, or paste any warning you see.`
        : '## Step 1: Choose your source\nWhich system are you moving data from — PandaDoc, Google Calendar, or a client CSV? I’ll give you one step at a time.',
      pendingAction: null,
      link: { recordType: 'help', recordId: 'migration-center', label: 'Migrate your data into GigWorks' },
      fallback: true,
    };
  }
  if (!/(how (?:do|can|should)|teach|train|training|help|getting started|where (?:is|do)|show me how)/i.test(String(question || ''))) return null;
  const articles = findHelpArticles(question);
  if (!articles.length) return null;
  const article = articles[0];
  const usefulLines = String(article.content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+[.)]\s+/.test(line) || /^(Tip|Note):/.test(line))
    .slice(0, 7);
  const instructions = usefulLines.length ? `\n\n${usefulLines.join('\n')}` : '';
  return {
    answer: `## ${article.title}\n${article.summary}${instructions}\n\nOpen the full guide for screenshots, details, and related guidance.`,
    pendingAction: null,
    link: { recordType: 'help', recordId: article.id, label: article.title },
    fallback: true,
  };
}

router.post('/ask', assistantLimiter, asyncHandler(async (req, res) => {
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
    let result;
    try {
      result = await answerAssistantQuestion(req.membership.accountId, trimmedQuestion, history, effectivePermissions(req.membership));
    } catch (error) {
      result = fallbackTrainingAnswer(trimmedQuestion);
      if (!result) throw error;
    }
    if (result.pendingAction) {
      const action = result.pendingAction;
      const proposal = await prisma.assistantProposal.create({ data: { accountId: req.membership.accountId, userId: req.session.userId, type: action.type, description: action.description, fields: action.fields, candidates: action.candidates || [], expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS) } });
      result.pendingAction = { id: proposal.id, type: proposal.type, description: proposal.description, candidates: proposal.candidates, expiresAt: proposal.expiresAt };
    }
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
    }).then(() => prisma.assistantProposal.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })).catch((err) => console.error('Failed to persist assistant chat history:', err));
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

router.get('/training', asyncHandler(async (req, res) => {
  const progress = await prisma.assistantTrainingProgress.findMany({
    where: { accountId: req.membership.accountId, userId: req.session.userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ progress });
}));

router.put('/training/:guideId', asyncHandler(async (req, res) => {
  const { guideId } = req.params;
  if (!TRAINING_GUIDE_STEP_COUNTS.has(guideId)) return res.status(400).json({ error: 'Unknown training guide.' });
  const hasCompletedSteps = Array.isArray(req.body?.completedSteps);
  const completedSteps = hasCompletedSteps
    ? [...new Set(req.body.completedSteps.map(Number).filter((step) => Number.isInteger(step) && step >= 0 && step < 20))].sort((a, b) => a - b)
    : undefined;
  const completedAt = hasCompletedSteps && completedSteps.length >= TRAINING_GUIDE_STEP_COUNTS.get(guideId) ? new Date() : null;
  if (req.body?.dismissDays !== undefined) {
    const dismissDays = Number(req.body.dismissDays);
    if (!Number.isFinite(dismissDays) || dismissDays < 1 || dismissDays > 30) return res.status(400).json({ error: 'Reminder delay must be between 1 and 30 days.' });
  }
  const hasDismissalUpdate = req.body?.dismissDays !== undefined || req.body?.clearDismissal === true;
  const dismissedUntil = req.body?.clearDismissal === true
    ? null
    : req.body?.dismissDays
      ? new Date(Date.now() + Math.min(30, Math.max(1, Number(req.body.dismissDays))) * 86400000)
      : null;
  const progress = await prisma.assistantTrainingProgress.upsert({
    where: { accountId_userId_guideId: { accountId: req.membership.accountId, userId: req.session.userId, guideId } },
    create: { accountId: req.membership.accountId, userId: req.session.userId, guideId, completedSteps: completedSteps || [], completedAt, dismissedUntil },
    update: { ...(hasCompletedSteps ? { completedSteps, completedAt } : {}), ...(hasDismissalUpdate ? { dismissedUntil } : {}) },
  });
  res.json({ progress });
}));

// Every action type re-checks permissions from scratch here — never trusts
// that a client-echoed pendingAction payload is safe just because it
// originated from a prior /ask response. `targetType` matches
// Reminder.relatedType's vocabulary — used to build a "View" link the same
// way relatedRecordPath already does for reminders.
const ACTION_HANDLERS = {
  create_reminder: { handler: (req, fields, db) => createReminderAction(req.membership.accountId, req.session.userId, fields, db), targetType: null },
  add_client: { handler: (req, fields, db) => addClientAction(req.membership.accountId, fields, db), requirePermission: 'manageClients', targetType: 'client' },
  update_client: { handler: (req, fields, db) => updateClientAction(req.membership.accountId, fields, db), requirePermission: 'manageClients', targetType: 'client' },
  add_contractor: { handler: (req, fields, db) => addContractorAction(req.membership.accountId, fields, db), requirePermission: 'manageContractors', targetType: 'contractor' },
  update_contractor: { handler: (req, fields, db) => updateContractorAction(req.membership.accountId, fields, db), requirePermission: 'manageContractors', targetType: 'contractor' },
  add_venue: { handler: (req, fields, db) => addVenueAction(req.membership.accountId, fields, db), requirePermission: 'manageVenues', targetType: 'venue' },
  create_booking: { handler: (req, fields, db) => createBookingAction(req.membership.accountId, fields, db), requirePermission: 'manageBookings', targetType: 'booking' },
  update_booking: { handler: (req, fields, db) => updateBookingAction(req.membership.accountId, fields, db), requirePermission: 'manageBookings', targetType: 'booking' },
  update_event: { handler: (req, fields, db) => updateEventAction(req.membership.accountId, fields, db), requirePermission: 'manageEvents', targetType: 'event' },
};

router.post('/confirm-action', assistantLimiter, asyncHandler(async (req, res) => {
  const proposalId = String(req.body?.proposalId || '');
  if (!proposalId) return res.status(400).json({ error: 'A valid Assistant proposal is required.' });
  try {
    const completed = await prisma.$transaction(async (tx) => {
      const proposal = await tx.assistantProposal.findFirst({ where: { id: proposalId, accountId: req.membership.accountId, userId: req.session.userId, usedAt: null, expiresAt: { gt: new Date() } } });
      if (!proposal) throw new Error('This Assistant proposal expired or was already used. Ask the Assistant to prepare it again.');
      const action = ACTION_HANDLERS[proposal.type];
      if (!action) throw new Error('Unknown action type.');
      if (action.requirePermission && !effectivePermissions(req.membership)[action.requirePermission]) throw Object.assign(new Error('Not authorized.'), { status: 403 });
      const fields = { ...proposal.fields };
      if (proposal.type === 'add_client' && req.body?.clientChoice && req.body.clientChoice !== 'new') {
        const allowedIds = Array.isArray(proposal.candidates) ? proposal.candidates.map((candidate) => candidate.id) : [];
        if (!allowedIds.includes(req.body.clientChoice)) throw new Error('Choose one of the clients shown in this proposal.');
        fields.useExistingClientId = req.body.clientChoice;
      }
      const claimed = await tx.assistantProposal.updateMany({ where: { id: proposal.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new Error('This Assistant proposal was already used.');
      const result = await action.handler(req, fields, tx);
      await tx.assistantAction.create({ data: { accountId: req.membership.accountId, userId: req.session.userId, type: proposal.type, description: proposal.description, targetType: action.targetType, targetId: action.targetType ? result?.id || null : null } });
      return { type: proposal.type, result };
    });
    res.status(201).json(completed);
  } catch (err) {
    console.error('GigWorks Assistant /confirm-action failed:', err);
    res.status(err.status || 400).json({ error: err.message || 'Failed to complete that action.' });
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
