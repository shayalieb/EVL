const USERDATA_KEY = 'evl_userdata_v1';

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(USERDATA_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(USERDATA_KEY, JSON.stringify(store));
}

export function loadUserData(userId) {
  return loadStore()[userId] || null;
}

export function saveUserData(userId, data) {
  const store = loadStore();
  store[userId] = data;
  saveStore(store);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
