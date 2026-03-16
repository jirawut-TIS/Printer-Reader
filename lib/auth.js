// lib/auth.js — ระบบ Login + Access Log + User Management

const USERS_KEY   = 'printer_users';
const LOG_KEY     = 'printer_access_log';
const SESSION_KEY = 'printer_session';

const DEFAULT_USERS = [
  { username: 'admin',    name: 'ผู้ดูแลระบบ',   role: 'admin',    password: 'admin123' },
  { username: 'printer1', name: 'เจ้าหน้าที่ 1', role: 'operator', password: 'op1234'  },
  { username: 'printer2', name: 'เจ้าหน้าที่ 2', role: 'operator', password: 'op5678'  },
];

// ── User Management ───────────────────────────────────────────────
export function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_USERS;
  } catch { return DEFAULT_USERS; }
}

export function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function addUser(user) {
  const users = getUsers();
  if (users.find(u => u.username === user.username))
    return { ok: false, error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
  users.push(user);
  saveUsers(users);
  return { ok: true };
}

export function updateUser(username, updates) {
  const users = getUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return { ok: false, error: 'ไม่พบผู้ใช้' };
  users[idx] = { ...users[idx], ...updates };
  saveUsers(users);
  return { ok: true };
}

export function deleteUser(username) {
  saveUsers(getUsers().filter(u => u.username !== username));
}

// ── Session ──────────────────────────────────────────────────────
export function saveSession(username) {
  const user = getUsers().find(u => u.username === username);
  if (!user) return null;
  const session = { username, name: user.name, role: user.role, loginAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSession() { localStorage.removeItem(SESSION_KEY); }

// ── Access Log ───────────────────────────────────────────────────
export function getLogs() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addLog(entry) {
  const logs = getLogs();
  logs.unshift({ id: Date.now(), ...entry, time: new Date().toISOString() });
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 200)));
}

export function clearLogs() { localStorage.removeItem(LOG_KEY); }

// ── Auth Actions ─────────────────────────────────────────────────
export function login(username, password) {
  const user = getUsers().find(u => u.username === username);
  if (user && user.password === password) {
    const session = saveSession(username);
    addLog({ username, name: user.name, role: user.role, action: 'login', success: true });
    return { ok: true, session };
  }
  addLog({ username: username || '(ไม่ระบุ)', name: '-', role: '-', action: 'login', success: false });
  return { ok: false };
}

export function logout(session) {
  if (session) addLog({ username: session.username, name: session.name, role: session.role, action: 'logout', success: true });
  clearSession();
}
