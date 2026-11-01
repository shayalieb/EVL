import { effectivePermissions } from './membership.js';

// Reads of an area's records need that area's view permission (owners and admins always have it).
// Changes are checked separately, by each route, against the matching manage permission.
export function viewGuard(key) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!effectivePermissions(req.membership)[key]) return res.status(403).json({ error: 'Not authorized.' });
    next();
  };
}
