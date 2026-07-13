import { createContext, useCallback, useContext, useState } from 'react';
import { loadDB, saveDB, getSession, setSession, clearSession, uid } from '../lib/storage';
import { buildSeedUserData } from '../lib/seed';

const AuthContext = createContext(null);

// Prototype-only obfuscation, not real cryptography.
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function newUserRecord({ firstName, lastName, email, phone, passwordHash, authProvider, googleId }) {
  return {
    id: uid('user'),
    firstName,
    lastName,
    email,
    phone: phone || '',
    passwordHash: passwordHash || null,
    authProvider,
    googleId: googleId || null,
    businessInfo: { name: '', address: '', phone: '', email: '' },
    emailConnection: { connected: false, email: '' },
    createdAt: new Date().toISOString(),
    ...buildSeedUserData(),
  };
}

export function AuthProvider({ children }) {
  const [db, setDb] = useState(() => loadDB());
  const [session, setSessionState] = useState(() => getSession());
  // Holds a fake Google profile between "Continue with Google" and the
  // complete-profile step, so we don't create the user until that's filled in.
  const [pendingGoogleProfile, setPendingGoogleProfile] = useState(null);
  const [authError, setAuthError] = useState('');

  const persist = useCallback((nextDb) => {
    setDb(nextDb);
    saveDB(nextDb);
  }, []);

  const currentUser = session ? db.users[session.userId] : null;

  const signUp = useCallback(({ firstName, lastName, email, phone, password }) => {
    setAuthError('');
    const normalizedEmail = email.trim().toLowerCase();
    const exists = Object.values(db.users).some((u) => u.email === normalizedEmail);
    if (exists) {
      setAuthError('An account with that email already exists.');
      return false;
    }
    const user = newUserRecord({
      firstName,
      lastName,
      email: normalizedEmail,
      phone,
      passwordHash: simpleHash(password),
      authProvider: 'password',
    });
    const nextDb = { ...db, users: { ...db.users, [user.id]: user } };
    persist(nextDb);
    setSession(user.id);
    setSessionState({ userId: user.id });
    return true;
  }, [db, persist]);

  const signIn = useCallback(({ email, password }) => {
    setAuthError('');
    const normalizedEmail = email.trim().toLowerCase();
    const user = Object.values(db.users).find((u) => u.email === normalizedEmail);
    if (!user || user.passwordHash !== simpleHash(password)) {
      setAuthError('Incorrect email or password.');
      return false;
    }
    setSession(user.id);
    setSessionState({ userId: user.id });
    return true;
  }, [db]);

  // Simulates the Google OAuth round trip: no real network/auth call, just a
  // short delay returning a fake profile. Existing accounts sign straight in;
  // new ones go to the complete-profile step to collect a phone number.
  const startSimulatedGoogleSignIn = useCallback(() => {
    setAuthError('');
    return new Promise((resolve) => {
      setTimeout(() => {
        const fakeProfile = {
          googleId: 'google-sim-user',
          firstName: 'Taylor',
          lastName: 'Morgan',
          email: 'taylor.morgan@gmail.com',
        };
        const existing = Object.values(db.users).find((u) => u.email === fakeProfile.email);
        if (existing) {
          setSession(existing.id);
          setSessionState({ userId: existing.id });
          resolve({ status: 'signed_in' });
        } else {
          setPendingGoogleProfile(fakeProfile);
          resolve({ status: 'needs_profile', profile: fakeProfile });
        }
      }, 700);
    });
  }, [db]);

  const completeGoogleProfile = useCallback(({ phone }) => {
    if (!pendingGoogleProfile) return false;
    const user = newUserRecord({
      firstName: pendingGoogleProfile.firstName,
      lastName: pendingGoogleProfile.lastName,
      email: pendingGoogleProfile.email,
      phone,
      passwordHash: null,
      authProvider: 'google',
      googleId: pendingGoogleProfile.googleId,
    });
    const nextDb = { ...db, users: { ...db.users, [user.id]: user } };
    persist(nextDb);
    setSession(user.id);
    setSessionState({ userId: user.id });
    setPendingGoogleProfile(null);
    return true;
  }, [db, persist, pendingGoogleProfile]);

  const logout = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  const updateCurrentUser = useCallback((patch) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...patch };
    persist({ ...db, users: { ...db.users, [currentUser.id]: updated } });
  }, [currentUser, db, persist]);

  const changePassword = useCallback(({ currentPassword, newPassword }) => {
    if (!currentUser) return { ok: false, error: 'Not signed in.' };
    if (currentUser.authProvider === 'password' && currentUser.passwordHash !== simpleHash(currentPassword)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    updateCurrentUser({ passwordHash: simpleHash(newPassword), authProvider: 'password' });
    return { ok: true };
  }, [currentUser, updateCurrentUser]);

  const value = {
    db,
    persist,
    session,
    currentUser,
    authError,
    pendingGoogleProfile,
    signUp,
    signIn,
    startSimulatedGoogleSignIn,
    completeGoogleProfile,
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
