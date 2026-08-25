import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadUserData, uid } from '../lib/storage';
import { buildSeedUserData, buildDefaultBookingStatuses, buildDefaultEventStatuses, buildDefaultInquiryStatuses } from '../lib/seed';
import { createContractor } from '../lib/contractors';
import { createClient } from '../lib/clients';
import { createBooking } from '../lib/bookings';
import { createEvent } from '../lib/events';
import { createVenue } from '../lib/venues';
import { createOffering, updateOfferingApi } from '../lib/offerings';
import { createContractorGroup, updateContractorGroupApi } from '../lib/contractorGroups';

// Relative in production (e.g. `/api`) — vercel.json proxies /api/* to the
// Railway backend so the browser only ever talks to the frontend's own
// domain, keeping the session cookie first-party. See .env.example.
export const API_BASE = import.meta.env.VITE_API_BASE;

// True for both "never approved" and "approved, but billing lapsed since" —
// either way every account-scoped route 403s (see membership.js's
// attachMembership), so hydrate() would throw fetching /account-data. Used
// everywhere the pending-approval-style hydrate skip already happens, so a
// billing lockout gets the same tolerant treatment.
function needsHydrateSkip(user) {
  return !user.accountApproved || !!user.subscriptionBlocked;
}
const AuthContext = createContext(null);

// For the few upload routes that can't go through apiFetch (multipart
// bodies need the browser's own Content-Type, not JSON — see
// lib/documents.js, lib/bookingDocuments.js, lib/support.js) and so must
// send this themselves. Reads the cookie the backend's ensureCsrfCookie
// middleware sets on every response (see server/src/lib/csrf.js) — the
// header just has to echo it back for the double-submit check to pass.
export function csrfHeader() {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? { 'X-CSRF-Token': decodeURIComponent(match[1]) } : {};
}

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
    // Pre-populated but ordinary — SectionsEditor treats it like any other
    // section, so it's fully editable/removable from Settings > Templates
    // or right on a booking's own Contract tab, same as a hand-typed one.
    contractTemplate: {
      title: 'Event Contract',
      sections: [{
        id: uid('section'),
        title: 'Electronic Signature Consent',
        text: 'By signing this document electronically, all parties agree that their electronic signature is the legal equivalent of a handwritten signature, and consent to conduct this transaction electronically. Electronic records of this agreement are as valid, binding, and enforceable as a signed paper original, consistent with the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law.',
        value: '',
      }],
    },
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

// Same idea as migrateContractorsOutOfBlob above, for Client (see
// server/prisma/schema.prisma's Client model comment).
async function migrateClientsOutOfBlob(blob) {
  const results = await Promise.allSettled(blob.clients.map((c) => createClient(c)));
  const stillEmbedded = blob.clients.filter((_, i) => results[i].status === 'rejected');
  const next = { ...blob };
  if (stillEmbedded.length) next.clients = stillEmbedded;
  else delete next.clients;
  return next;
}

// Phase 4C cleanup: every venue is now read from its dedicated table. Copy
// legacy records idempotently, remove successful ones from the account
// blob, and retain only failures so a later hydrate can retry them.
async function migrateVenuesOutOfBlob(blob) {
  const results = await Promise.allSettled(blob.venues.map((venue) => createVenue(venue)));
  const stillEmbedded = blob.venues.filter((_, index) => results[index].status === 'rejected');
  const next = { ...blob };
  if (stillEmbedded.length) next.venues = stillEmbedded;
  else delete next.venues;
  return next;
}

// Phase 5A compatibility copy: seed the new catalog tables without removing
// the legacy arrays yet. The current UI remains entirely on the blob until
// Phase 5B, so rollout or rollback cannot create a mixed-source experience.
async function copyOfferingsOutOfBlob(blob) {
  await Promise.allSettled(blob.offerings.map(async (offering) => {
    await createOffering(offering);
    await updateOfferingApi(offering.id, offering);
  }));
  return blob;
}

async function copyContractorGroupsOutOfBlob(blob) {
  await Promise.allSettled(blob.contractorGroups.map(async (group) => {
    await createContractorGroup(group);
    await updateContractorGroupApi(group.id, group);
  }));
  return blob;
}

// Same idea again, for Booking/Event (see server/prisma/schema.prisma's
// Booking/Event model comments) — the biggest of this whole graduation
// series, since they're the two most actively-edited record types in the
// app. Each blob record already carries its own id (BookingFormPage/
// EventFormPage's emptyForm() generates one up front, before the record is
// ever saved), and createBooking/createEvent's routes require and preserve
// that id rather than minting a new one — critical here, since Contract/
// Invoice/documents/StagePlot/FloorPlan/Guest/EventRsvpLink/InquiryLink all
// reference a booking/event by that same opaque id.
async function migrateBookingsOutOfBlob(blob) {
  const results = await Promise.allSettled(blob.bookings.map((b) => createBooking(b)));
  const stillEmbedded = blob.bookings.filter((_, i) => results[i].status === 'rejected');
  const next = { ...blob };
  if (stillEmbedded.length) next.bookings = stillEmbedded;
  else delete next.bookings;
  return next;
}

async function migrateEventsOutOfBlob(blob) {
  const results = await Promise.allSettled(blob.events.map((e) => createEvent(e)));
  const stillEmbedded = blob.events.filter((_, i) => results[i].status === 'rejected');
  const next = { ...blob };
  if (stillEmbedded.length) next.events = stillEmbedded;
  else delete next.events;
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

      const hadContractors = blob.contractors?.length;
      const hadClients = blob.clients?.length;
      const hadBookings = blob.bookings?.length;
      const hadEvents = blob.events?.length;
      const hadVenues = blob.venues?.length;
      const hadOfferings = blob.offerings?.length;
      const hadContractorGroups = blob.contractorGroups?.length;
      if (hadContractors) blob = await migrateContractorsOutOfBlob(blob);
      if (hadClients) blob = await migrateClientsOutOfBlob(blob);
      if (hadBookings) blob = await migrateBookingsOutOfBlob(blob);
      if (hadEvents) blob = await migrateEventsOutOfBlob(blob);
      if (hadVenues) blob = await migrateVenuesOutOfBlob(blob);
      if (hadOfferings) blob = await copyOfferingsOutOfBlob(blob);
      if (hadContractorGroups) blob = await copyContractorGroupsOutOfBlob(blob);
      if (hadContractors || hadClients || hadBookings || hadEvents || hadVenues) {
        // Non-fatal: two tabs (or two logins close together) hydrating
        // concurrently both see the embedded arrays and both attempt this
        // shrink-and-write-back; the second one loses the optimistic-
        // concurrency `version` check and 409s. Left uncaught, that
        // propagates out of hydrate() and the outer effect below treats any
        // failure as "not authenticated," logging that tab out — instead,
        // just leave the (still-migrated, still self-healing per-record)
        // blob as next hydrate's problem, same tolerance already documented
        // above for individual record migration failures.
        try {
          const saved = await apiFetch('/account-data', { method: 'PUT', body: JSON.stringify({ data: blob, version: versionRef.current }) });
          versionRef.current = saved.version;
          setSizeWarning(saved.sizeWarning || null);
        } catch {
          // swallow — next hydrate re-migrates whatever's still embedded
        }
      }
    } else {
      // No account-wide record yet — either a brand-new signup, or the
      // first login since business data moved from this browser's
      // localStorage into the shared account backend. In the latter case,
      // reuse whatever was already entered here so it isn't lost.
      const candidate = loadUserData(user.id) || seedBlob(user);

      // Claim the account-data row *before* migrating any embedded
      // contractors/clients/bookings/events into their own tables. Those
      // migrations make real, undeduplicated POST /contractors, /events,
      // etc. calls — if two hydrate() calls raced here (two tabs, a fast
      // reload mid-hydrate), both would otherwise seed and migrate their
      // own independent copies of the same sample/local data. PUT
      // /account-data's create path is protected by AccountData.accountId's
      // unique constraint (see accountData.js), so only the winner of this
      // PUT proceeds past it — the loser adopts the winner's real data
      // instead of seeding at all.
      let claimed = true;
      try {
        const created = await apiFetch('/account-data', { method: 'PUT', body: JSON.stringify({ data: candidate }) });
        versionRef.current = created.version;
        setSizeWarning(created.sizeWarning || null);
        blob = candidate;
      } catch (err) {
        if (err.status !== 409 || !err.body) throw err;
        claimed = false;
        blob = err.body.data;
        versionRef.current = err.body.version;
        setSizeWarning(null);
      }

      if (claimed) {
        let migrated = blob;
        if (migrated.contractors?.length) migrated = await migrateContractorsOutOfBlob(migrated);
        if (migrated.clients?.length) migrated = await migrateClientsOutOfBlob(migrated);
        if (migrated.bookings?.length) migrated = await migrateBookingsOutOfBlob(migrated);
        if (migrated.events?.length) migrated = await migrateEventsOutOfBlob(migrated);
        if (migrated.venues?.length) migrated = await migrateVenuesOutOfBlob(migrated);
        if (migrated.offerings?.length) migrated = await copyOfferingsOutOfBlob(migrated);
        if (migrated.contractorGroups?.length) migrated = await copyContractorGroupsOutOfBlob(migrated);
        if (migrated !== blob) {
          const saved = await apiFetch('/account-data', { method: 'PUT', body: JSON.stringify({ data: migrated, version: versionRef.current }) });
          versionRef.current = saved.version;
          setSizeWarning(saved.sizeWarning || null);
        }
        blob = migrated;
      }
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
    if (!blob.eventStatuses || !blob.inquiryStatuses) {
      // Backfill an AccountData row missing these — DataContext.jsx's
      // computeVendorStatus/computeClientEventCounts otherwise crash on
      // undefined.find() the moment anything reads them (this is what a
      // hand-edited/malformed row, e.g. via a direct DB fix, looks like).
      blob = {
        ...blob,
        eventStatuses: blob.eventStatuses || buildDefaultEventStatuses(),
        inquiryStatuses: blob.inquiryStatuses || buildDefaultInquiryStatuses(),
      };
    }
    setServerUser(user);
    setLocalBlob(blob);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/auth/me');
        // A pending (not-yet-approved) account can log in fine, but every
        // account-scoped route including /account-data 403s for it (see
        // server/src/lib/membership.js's attachMembership) — hydrate() would
        // throw on that fetch, and the catch below would then clear
        // serverUser too, making the app think nobody's logged in at all
        // instead of showing the pending-approval screen. Skip straight to
        // setServerUser; currentUser below tolerates localBlob staying null
        // in exactly this one case.
        if (data.user.accountId && needsHydrateSkip(data.user)) {
          setServerUser(data.user);
        } else {
          await hydrate(data.user);
        }
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

  // localBlob is only ever null here in the pending-approval/billing-locked
  // cases above (every other path either hydrates it or clears serverUser
  // too) — so tolerating a null localBlob doesn't mask any other failure
  // mode.
  const currentUser = serverUser && (localBlob || needsHydrateSkip(serverUser))
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
        accountApproved: serverUser.accountApproved,
        // GigWorks' own subscription (lib/subscription.js) — the
        // pending-approval/plan-picker gate and the Plan settings tab both
        // need these.
        subscriptionStatus: serverUser.subscriptionStatus,
        planTier: serverUser.planTier,
        seatLimit: serverUser.seatLimit,
        trialEndsAt: serverUser.trialEndsAt,
        subscriptionBlocked: serverUser.subscriptionBlocked,
      }
    : null;

  const signUp = useCallback(async ({ firstName, lastName, businessName, email, phone, password, vertical }) => {
    setAuthError('');
    try {
      const data = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email: email.trim().toLowerCase(), phone, password, vertical }),
      });
      // Pending/billing-locked accounts can't hydrate the account-data blob
      // (see the session-init effect above for why) — go straight to
      // serverUser so ProtectedArea's gate shows the right screen, instead
      // of hydrate() throwing and this landing in the catch below as if
      // signup itself had failed.
      if (needsHydrateSkip(data.user)) {
        setServerUser({ ...data.user, businessName });
      } else {
        await hydrate({ ...data.user, businessName });
      }
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
      // See signUp above — same reasoning.
      if (needsHydrateSkip(data.user)) {
        setServerUser(data.user);
      } else {
        await hydrate(data.user);
      }
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
