import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership, effectivePermissions } from '../lib/membership.js';
import { createRateLimiter } from '../lib/rateLimiter.js';
import { answerAssistantQuestion, draftProposalFromInquiry } from '../lib/gigworksAssistant.js';

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
    const answer = await answerAssistantQuestion(req.membership.accountId, question.trim(), Array.isArray(history) ? history : []);
    res.json({ answer });
  } catch (err) {
    console.error('GigWorks Assistant /ask failed:', err);
    res.status(502).json({ error: err.message || 'The assistant is unavailable right now.' });
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
