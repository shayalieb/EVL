import { Router } from 'express';
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

router.post('/ask', assistantLimiter, asyncHandler(async (req, res) => {
  if (!requireBookingsPermission(req, res)) return;
  const { question, history } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: 'A question is required.' });
  try {
    const result = await answerAssistantQuestion(req.membership.accountId, question.trim(), Array.isArray(history) ? history : []);
    res.json(result);
  } catch (err) {
    console.error('GigWorks Assistant /ask failed:', err);
    res.status(502).json({ error: err.message || 'The assistant is unavailable right now.' });
  }
}));

// Every action type re-checks permissions from scratch here — never trusts
// that a client-echoed pendingAction payload is safe just because it
// originated from a prior /ask response.
const ACTION_HANDLERS = {
  create_reminder: { handler: (req, fields) => createReminderAction(req.membership.accountId, req.session.userId, fields) },
  add_client: { handler: (req, fields) => addClientAction(req.membership.accountId, fields), requirePermission: 'manageClients' },
  create_booking: { handler: (req, fields) => createBookingAction(req.membership.accountId, fields), requirePermission: 'manageBookings' },
  update_booking: { handler: (req, fields) => updateBookingAction(req.membership.accountId, fields), requirePermission: 'manageBookings' },
};

router.post('/confirm-action', assistantLimiter, asyncHandler(async (req, res) => {
  const { type, fields } = req.body || {};
  const action = ACTION_HANDLERS[type];
  if (!action) return res.status(400).json({ error: 'Unknown action type.' });
  if (action.requirePermission && !effectivePermissions(req.membership)[action.requirePermission]) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  try {
    const result = await action.handler(req, fields);
    res.status(201).json({ type, result });
  } catch (err) {
    console.error(`GigWorks Assistant /confirm-action (${type}) failed:`, err);
    res.status(400).json({ error: err.message || 'Failed to complete that action.' });
  }
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
