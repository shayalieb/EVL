import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loadUserData, saveUserData } from '../lib/storage';
import { buildSeedUserData } from '../lib/seed';

const API_BASE = import.meta.env.VITE_API_BASE;
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
  if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body;
}

function seedBlob(profile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone || '',
    businessInfo: { name: '', address: '', phone: '', email: '' },
    ...buildSeedUserData(),
  };
}

export function AuthProvider({ children }) {
  const [serverUser, setServerUser] = useState(null);
  const [localBlob, setLocalBlob] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  const hydrate = useCallback((user) => {
    let blob = loadUserData(user.id);
    if (!blob) {
      blob = seedBlob(user);
      saveUserData(user.id, blob);
    }
    setServerUser(user);
    setLocalBlob(blob);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/auth/me');
        hydrate(data.user);
      } catch {
        setServerUser(null);
        setLocalBlob(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [hydrate]);

  const currentUser = serverUser && localBlob
    ? {
        ...localBlob,
        id: serverUser.id,
        email: serverUser.email,
        accountId: serverUser.accountId,
        role: serverUser.role,
        permissions: serverUser.permissions,
      }
    : null;

  const signUp = useCallback(async ({ firstName, lastName, email, phone, password }) => {
    setAuthError('');
    try {
      const data = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email: email.trim().toLowerCase(), phone, password }),
      });
      hydrate(data.user);
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
      hydrate(data.user);
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

  const updateCurrentUser = useCallback((patch) => {
    if (!serverUser || !localBlob) return;
    // id/email/accountId/role/permissions are server-authoritative and not locally patchable.
    const { id: _id, email: _email, accountId: _accountId, role: _role, permissions: _permissions, ...safePatch } = patch;
    const updated = { ...localBlob, ...safePatch };
    setLocalBlob(updated);
    saveUserData(serverUser.id, updated);
  }, [serverUser, localBlob]);

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

  const value = {
    currentUser,
    role: serverUser?.role ?? null,
    can,
    authError,
    authLoading,
    signUp,
    signIn,
    logout,
    updateCurrentUser,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
