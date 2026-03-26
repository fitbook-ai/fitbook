// API client
const BASE = '';

export async function api(method, path, body, token) {
  const tok = token || localStorage.getItem('fb_token');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const get = (p, t) => api('GET', p, null, t);
export const post = (p, b, t) => api('POST', p, b, t);
export const put = (p, b, t) => api('PUT', p, b, t);
export const del = (p, b, t) => api('DELETE', p, b, t);

// Toast notifications
let toastContainer;
function ensureToast() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}
export function toast(msg, type = 'default', duration = 3500) {
  ensureToast();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${msg}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// Formatting helpers
export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...opts });
}
export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
export function fmtDateTime(iso) { return `${fmtDate(iso)} · ${fmtTime(iso)}`; }
export function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
export function toInputDate(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
}
export function membershipLabel(type) {
  return { unlimited: 'Unlimited', pack: 'Class Pack', dropin: 'Drop-in', none: 'No membership', trial: 'Trial' }[type] || type || 'None';
}
export function membershipBadge(type) {
  const cls = { unlimited: 'badge-green', pack: 'badge-blue', dropin: 'badge-gray', trial: 'badge-amber', none: 'badge-gray' };
  return `<span class="badge ${cls[type]||'badge-gray'}">${membershipLabel(type)}</span>`;
}

// Modal helpers
export function modal(title, bodyHTML, footerHTML = '', wide = false) {
  const existing = document.getElementById('__modal');
  if (existing) existing.remove();
  const m = document.createElement('div');
  m.id = '__modal';
  m.className = 'modal-backdrop';
  m.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" onclick="document.getElementById('__modal').remove()">×</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}
export function closeModal() { document.getElementById('__modal')?.remove(); }

// Auth helpers
export function getUser() {
  try { return JSON.parse(localStorage.getItem('fb_user')); } catch { return null; }
}
export function setAuth(token, user) {
  localStorage.setItem('fb_token', token);
  localStorage.setItem('fb_user', JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem('fb_token');
  localStorage.removeItem('fb_user');
}
export function requireAuth(redirectTo = '/login') {
  if (!localStorage.getItem('fb_token')) {
    window.location.href = redirectTo;
    return null;
  }
  return getUser();
}

// Color palette for classes
export const CLASS_COLORS = [
  '#185FA5','#0F6E56','#993C1D','#854F0B','#534AB7','#993556','#1D9E75','#D85A30','#639922'
];

// Debounce
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Confirm dialog
export function confirm(msg) { return window.confirm(msg); }

// Format spots
export function spotsText(session) {
  const left = session.capacity - (session.booked_count || 0);
  if (left <= 0) return `<span class="sc-spots full">Full</span>`;
  if (left <= 3) return `<span class="sc-spots low">${left} spot${left===1?'':'s'} left</span>`;
  return `<span class="sc-spots">${left} / ${session.capacity} spots</span>`;
}

// Week helpers
export function getWeekDates(anchor) {
  const d = new Date(anchor || Date.now());
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}
export function isoDate(d) { return d.toISOString().split('T')[0]; }
