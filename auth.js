// lib/auth.js — Simple auth with localStorage persistence

export const USERS = {
  admin:    { name: 'ผู้ดูแลระบบ', role: 'admin',    password: 'admin123' },
  printer1: { name: 'เจ้าหน้าที่ 1', role: 'operator', password: 'op1234' },
  printer2: { name: 'เจ้าหน้าที่ 2', role: 'operator', password: 'op5678' },
};

const LOG_KEY = 'printer_access_log';
const SESSION_KEY = 'printer_session';

// ── Session ──────────────────────────────────────────────────────
export function saveSession(username) {
  const user = USERS[username];
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

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

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
  const trimmed = logs.slice(0, 200); // keep latest 200
  localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
}

export function clearLogs() {
  localStorage.removeItem(LOG_KEY);
}

// ── Auth Actions ─────────────────────────────────────────────────
export function login(username, password) {
  const user = USERS[username];
  if (user && user.password === password) {
    const session = saveSession(username);
    addLog({ username, name: user.name, role: user.role, action: 'login', success: true });
    return { ok: true, session };
  }
  addLog({ username: username || '(ไม่ระบุ)', name: '-', role: '-', action: 'login', success: false });
  return { ok: false };
}

export function logout(session) {
  if (session) {
    addLog({ username: session.username, name: session.name, role: session.role, action: 'logout', success: true });
  }
  clearSession();
}
