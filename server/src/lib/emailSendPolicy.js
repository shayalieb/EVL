import { createRateLimiter } from './rateLimiter.js';
import { effectivePermissions } from './membership.js';

// One shared limiter for every route that sends account-authored external
// email. Keeping a single store means callers cannot multiply their quota by
// alternating between the ad-hoc and threaded-email endpoints.
export const emailSendLimiter = createRateLimiter('email-send', {
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.membership?.accountId || req.ip,
  message: { error: 'Too many emails sent. Please try again later.' },
});

export function requireEmailSendPermission(req, res, next) {
  if (!effectivePermissions(req.membership).manageBookings) {
    return res.status(403).json({ error: 'Not authorized.' });
  }
  next();
}
