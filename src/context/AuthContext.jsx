import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadUserData } from '../lib/storage';
import { buildSeedUserData, buildDefaultBookingStatuses } from '../lib/seed';
import { createContractor } from '../lib/contractors';

// Relative in production (e.g. `/api`) — vercel.json proxies /api/* to the
// Railway backend so the browser only ever talks to the frontend's own
// domain, keeping the session cookie first-party. See .env.example.
export const API_BASE = import.meta.env.VITE_API_BASE;
const AuthContext = createContext(null);

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // empty body, fine
  }
  if (!res.ok) {
    const err = new Error(body?.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function seedBlob(profile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone || '',
    businessInfo: { name: profile.businessName || '', address: '', phone: profile.phone || '', email: '', logo: '', accentColor: '#6366f1', documentLayout: 'classic', documentTextScale: 1 },
    contractTemplate: { title: 'Event Contract', sections: [] },
    // proposalTemplate comes from buildSeedUserData below (vertical-specific
    // section defaults for party_planning; empty for the others).
    ...buildSeedUserData(profile.vertical),
  };
}

// One-time migration for a blob that still has contractors embedded —
// either a brand-new seed blob (buildSeedUserData still returns them,
// since it's also the definition of what to seed) or an existing account
// saved before Contractors moved to a real table (see
// server/prisma/schema.prisma's Contractor model comment). Self-healing:
// only ever finds work once per account, since afterward blob.contractors
// is simply absent. Failures are left in place for the next hydrate to
// retry rather than silently dropped.
async function migrateContractorsOutOfBlob(blob) {
  const results = await Promise.allSettled(blob.contractors.map((c) => createContractor(c)));
  const stillEmbedded = blob.contractors.filter((_, i) => results[i].status === 'rejected');
  const next = { ...blob };
  if (stillEmbedded.length) next.contractors = stillEmbedded;
  else delete next.contractors;
  return next;
}

export function AuthProvider({ children }) {
  const [serverUser, setServerUser] = useState(null);
  const [localBlob, setLocalBlob] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  // The version this browser last read from the server — read/written
  // outside React state since saveAccountData's retry loop (below) needs
  // the current value mid-flight, not a snapshot from whenever it was
  // scheduled.
  const versionRef = useRef(null);
  // Set whenever the server flags the account-data blob as approaching its
  // hard save-size limit — see accountData.js's sizeWarningFor. Shown as a
  // dismissible banner (AppLayout) rather than a toast, since it'd otherwise
  // refire on every autosave once an account crosses the threshold.
  const [sizeWarning, setSizeWarning] = useState(null);

  const hydrate = useCallback(async (user) => {
    let blob;
    const { data: remoteBlob, version: remoteVersion, sizeWarning: remoteSizeWarning } = await apiFetch('/account-data');
    if (remoteBlob) {
      blob = remoteBlob;
      versionRef.current = remoteVersion;
      setSizeWarning(remoteSizeWarning || null);

      if (blob.contractors?.length) {
        blob = await migrateContractorsOutOfBlob(blob);
        const saved = await apiFetch('/account-data', { method: 'PUT', body: JSON.stringify({ data: blob, version: versionRef.current }) });
        versionRef.current = saved.version;
        setSizeWarning(saved.sizeWarning || null);
      }
    } else {
      // No account-wide record yet — either a brand-new signup, or the
      // first login since business data moved from this browser's
      // localStorage into the shared account backend. In the latter case,
      // reuse whatever was already entered here so it isn't lost.
      blob = loadUserData(user.id) || seedBlob(user);
      if (blob.contractors?.length) blob = await migrateContractorsOutOfBlob(blob);
      const created = await apiFetch('/account-data', { method: 'PUT', body: JSON.stringify({ data: blob }) });
      versionRef.current = created.version;
      setSizeWarning(created.sizeWarning || null);
    }
    if (!blob.bookingStatuses) {
      // Backfill accounts created before Bookings existed so the status
      // picker/pipeline isn't empty on first visit.
      blob = { ...blob, bookingStatuses: buildDefaultBookingStatuses(), bookings: blob.bookings || [] };
    }
    if (!blob.setListLibrary) {
      // Backfill accounts created before the Set List library existed.
      blob = { ...blob, setListLibrary: [] };
    }
    setServerUser(user);
    setLocalBlob(blob);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/auth/me');
        await hydrate(data.user);
      } catch {
        setServerUser(null);
        setLocalBlob(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [hydrate]);

  // Teammates' changes only land here on next fetch — cheapest way to
  // approximate shared state across the account without real-time sync.
  useEffect(() => {
    if (!serverUser) return;
    const onFocus = () => {
      apiFetch('/account-data')
        .then(({ data, version, sizeWarning: remoteSizeWarning }) => {
          if (data) { setLocalBlob(data); versionRef.current = version; setSizeWarning(remoteSizeWarning || null); }
        })
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [serverUser]);

  const currentUser = serverUser && localBlob
    ? {
        ...localBlob,
        id: serverUser.id,
        email: serverUser.email,
        accountId: serverUser.accountId,
        role: serverUser.role,
        permissions: serverUser.permissions,
        isPlatformAdmin: serverUser.isPlatformAdmin,
        isPlatformOwner: serverUser.isPlatformOwner,
        adminPermissions: serverUser.adminPermissions,
        vertical: serverUser.vertical,
        allVerticalsEnabled: serverUser.allVerticalsEnabled,
        activeVerticals: serverUser.activeVerticals,
      }
    : null;

  const signUp = useCallback(async ({ firstName, lastName, businessName, email, phone, password, vertical }) => {
    setAuthError('');
    try {
      const data = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email: email.trim().toLowerCase(), phone, password, vertical }),
      });
      await hydrate({ ...data.user, businessName });
      return true;
    } catch (err) {
      setAuthError(err.message);
      return false;
    }
  }, [hydrate]);

  const signIn = useCallback(async ({ email, password }) => {
    setAuthError('');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      await hydrate(data.user);
      return true;
    } catch (err) {
      setAuthError(err.message);
      return false;
    }
  }, [hydrate]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // best effort — clear local state regardless
    }
    setServerUser(null);
    setLocalBlob(null);
  }, []);

  // On a version conflict (another tab, or a teammate elsewhere, saved in
  // between), reapply this same patch on top of the server's actual latest
  // data instead of the stale copy we started from, then retry — see
  // AccountData.version's doc comment in schema.prisma for why this exists.
  // Bounded so a persistent server-side issue fails loud instead of looping.
  const saveAccountData = useCallback(async (safePatch, blobToSave, attempt = 0) => {
    try {
      const res = await apiFetch('/account-data', {
        method: 'PUT',
        body: JSON.stringify({ data: blobToSave, version: versionRef.current }),
      });
      versionRef.current = res.version;
      setSizeWarning(res.sizeWarning || null);
    } catch (err) {
      if (err.status === 409 && attempt < 3) {
        const fresh = { ...(err.body?.data || {}), ...safePatch };
        versionRef.current = err.body?.version ?? null;
        setLocalBlob(fresh);
        await saveAccountData(safePatch, fresh, attempt + 1);
        return;
      }
      console.error('Failed to save account data', err);
    }
  }, []);

  const updateCurrentUser = useCallback((patch) => {
    if (!serverUser) return;
    // id/email/accountId/role/permissions are server-authoritative and not locally patchable.
    const { id: _id, email: _email, accountId: _accountId, role: _role, permissions: _permissions, ...safePatch } = patch;
    // Functional form so back-to-back calls in the same handler (e.g.
    // convertBookingToEvent's addEvent + updateBooking) each build on the
    // latest state instead of a stale `localBlob` closure clobbering
    // whichever call landed first.
    setLocalBlob((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...safePatch };
      saveAccountData(safePatch, updated);
      return updated;
    });
  }, [serverUser, saveAccountData]);

  const can = useCallback((key) => {
    if (!serverUser) return false;
    if (serverUser.role === 'owner' || serverUser.role === 'admin') return true;
    return !!serverUser.permissions?.[key];
  }, [serverUser]);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    if (!serverUser) return { ok: false, error: 'Not signed in.' };
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [serverUser]);

  const requestPasswordReset = useCallback(async (email) => {
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, []);

  const resetPassword = useCallback(async ({ token, newPassword }) => {
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(''), []);

  const value = {
    currentUser,
    role: serverUser?.role ?? null,
    can,
    authError,
    clearAuthError,
    authLoading,
    signUp,
    signIn,
    logout,
    updateCurrentUser,
    changePassword,
    requestPasswordReset,
    resetPassword,
    sizeWarning,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
