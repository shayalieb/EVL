const DB_KEY = 'evl_db_v1';
const SESSION_KEY = 'evl_session_v1';

export function loadDB() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || { users: {} };
  } catch {
    return { users: {} };
  }
}

export function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
