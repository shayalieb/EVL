// For upstream SDKs (Resend) that don't expose a way to pass an
// AbortSignal through their own fetch call — this can't cancel the
// in-flight network request the way Stripe's own `timeout` config or a
// custom-fetch injection (see fileStorage.js's Supabase client) can, but it
// does stop the calling request handler from holding its DB connection open
// indefinitely waiting on a hung upstream. The abandoned call still runs to
// completion in the background; its result is just no longer awaited.
export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
