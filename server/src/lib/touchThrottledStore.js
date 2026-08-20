// express-session calls store.touch(sid, session, cb) on every request that
// has an existing session, to keep its sliding expiry alive — and
// PrismaSessionStore's touch() does a real findUnique + update against the
// Session table every time, with no throttling of its own. That's 2 extra
// DB round trips on every single authenticated request across the whole
// app, the single biggest per-request cost multiplier under heavy traffic.
//
// A 7-day sliding window doesn't need millisecond-accurate refreshing —
// only touching the DB at most once per THROTTLE_MS per session keeps the
// recorded expiry close enough to "last actually active" while cutting
// touch volume by orders of magnitude for anyone using the app steadily
// (autosave, polling, normal clicking around all land inside the same
// throttle window and cost nothing beyond the first touch in it).
//
// Wraps the store with a Proxy rather than subclassing — PrismaSessionStore
// holds private state closed over its own methods, so calling them detached
// from the real instance (which a subclass override would do) breaks it;
// forwarding everything except touch()/set() through Reflect keeps every
// other Store method exactly as the real instance implements it.
const THROTTLE_MS = 5 * 60 * 1000;
// Bounds the tracking Map's growth for sessions that are abandoned rather
// than explicitly destroyed (browser closed without logging out) — anything
// this stale is long past any real throttling value.
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function withTouchThrottle(store) {
  const lastTouchedAt = new Map();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - STALE_AFTER_MS;
    for (const [sid, at] of lastTouchedAt) {
      if (at < cutoff) lastTouchedAt.delete(sid);
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'touch') {
        return function throttledTouch(sid, session, callback) {
          const now = Date.now();
          const last = lastTouchedAt.get(sid);
          if (last && now - last < THROTTLE_MS) {
            if (callback) process.nextTick(callback);
            return undefined;
          }
          lastTouchedAt.set(sid, now);
          return target.touch(sid, session, callback);
        };
      }
      if (prop === 'set') {
        return function passthroughSet(sid, session, callback) {
          // Already just wrote fresh expiry/data for this sid — a touch()
          // landing right after would be redundant regardless of the timer.
          lastTouchedAt.set(sid, Date.now());
          return target.set(sid, session, callback);
        };
      }
      if (prop === 'destroy') {
        return function passthroughDestroy(sid, callback) {
          lastTouchedAt.delete(sid);
          return target.destroy(sid, callback);
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
