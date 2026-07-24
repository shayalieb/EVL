// A brand-new booking/event only lives in memory until it's saved — nothing
// to auto-save to the server yet, but the tab can still be discarded by the
// browser or reloaded, wiping that in-progress state outright. Mirroring the
// draft into sessionStorage means a reload picks up right where the user
// left off. An abandoned draft (never submitted or explicitly cancelled)
// would otherwise sit in sessionStorage — holding whatever PII was typed so
// far — for as long as the tab stays open, so loads past this age are
// treated as stale and dropped rather than kept indefinitely.
const MAX_DRAFT_AGE_MS = 60 * 60 * 1000; // 1 hour

export function loadDraft(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { form, savedAt } = JSON.parse(raw);
    if (!savedAt || Date.now() - savedAt > MAX_DRAFT_AGE_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return form;
  } catch {
    return null;
  }
}

export function saveDraft(key, form) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ form, savedAt: Date.now() }));
  } catch {
    // storage full/unavailable — draft recovery just won't work this time
  }
}

export function clearDraft(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
