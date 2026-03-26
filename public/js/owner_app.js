import { clearAuth, getUser } from './api.js';
import { renderDashboard } from './owner/dashboard.js';
import { renderSchedule } from './owner/schedule.js';
import { renderMembers } from './owner/members.js';
import { renderSettings } from './owner/settings.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>` },
  { id: 'schedule',  label: 'Schedule',  icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/></svg>` },
  { id: 'members',   label: 'Members',   icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5"/><circle cx="12" cy="5" r="1.8"/><path d="M15 13c0-2-1.34-3.7-3.2-4.3"/></svg>` },
  { id: 'settings',  label: 'Settings',  icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>` },
];

let currentPage = null;

function getPage() {
  const hash = window.location.hash.replace('#/', '') || 'dashboard';
  return hash.split('/')[0];
}

function buildShell(user) {
  document.body.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="logo-name">FitBook</div>
          <div class="logo-sub" id="studio-name-display">Loading...</div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">${user?.name || ''}</div>
          <div class="sidebar-studio" id="footer-studio"></div>
          <span class="sidebar-logout" id="logout-btn">Sign out</span>
        </div>
      </aside>
      <main class="main-content" id="main-content"></main>
    </div>
    <div id="toast-container"></div>`;

  renderNav(getPage());
  document.getElementById('logout-btn').onclick = () => { clearAuth(); window.location.reload(); };

  import('./api.js').then(({ get }) => {
    get('/api/me').then(data => {
      const sn = data.studio?.name || data.studioName || '';
      const el1 = document.getElementById('studio-name-display');
      const el2 = document.getElementById('footer-studio');
      if (el1) el1.textContent = sn;
      if (el2) el2.textContent = sn;
    }).catch(() => {});
  });
}

function renderNav(active) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = NAV.map(n => `
    <a class="nav-item ${n.id === active ? 'active' : ''}" href="#/${n.id}">
      ${n.icon} ${n.label}
    </a>`).join('');
}

async function route() {
  const page = getPage();
  if (page === currentPage && page !== 'dashboard') return;
  currentPage = page;
  renderNav(page);
  const main = document.getElementById('main-content');
  if (!main) return;
  const views = { dashboard: renderDashboard, schedule: renderSchedule, members: renderMembers, settings: renderSettings };
  const render = views[page] || renderDashboard;
  try { await render(main); } catch(e) { console.error(e); }
}

function loginForm() {
  return `
    <div class="auth-logo"><div class="logo">FitBook</div><div class="tagline">Simple booking for fitness studios</div></div>
    <div class="auth-title">Welcome back</div>
    <div class="auth-sub">Sign in to your studio dashboard</div>
    <div class="form-group"><label>Email</label><input id="a-email" type="email" placeholder="you@studio.com" autocomplete="email"></div>
    <div class="form-group"><label>Password</label><input id="a-pass" type="password" placeholder="••••••••"></div>
    <div id="a-err" class="form-error" style="display:none"></div>
    <button class="btn btn-primary btn-full btn-lg" id="a-btn" style="margin-top:8px">Sign in</button>
    <div class="auth-switch">New studio? <a id="go-register" style="cursor:pointer;color:var(--brand)">Create free account</a></div>`;
}

function registerForm() {
  return `
    <div class="auth-logo"><div class="logo">FitBook</div><div class="tagline">Simple booking for fitness studios</div></div>
    <div class="auth-title">Create your studio</div>
    <div class="auth-sub">Get live in under 5 minutes</div>
    <div class="form-group"><label>Your name</label><input id="r-name" type="text" placeholder="Jane Smith"></div>
    <div class="form-group"><label>Studio name</label><input id="r-studio" type="text" placeholder="Sunrise Spin Studio"></div>
    <div class="form-group"><label>Email</label><input id="r-email" type="email" placeholder="jane@studio.com"></div>
    <div class="form-group"><label>Password</label><input id="r-pass" type="password" placeholder="Choose a strong password"></div>
    <div class="form-group">
      <label>Booking page URL</label>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;color:var(--text-3);white-space:nowrap">${location.origin}/book/</span>
        <input id="r-slug" type="text" placeholder="sunrise-spin" style="flex:1">
      </div>
      <div class="form-hint">Members use this link to book classes</div>
    </div>
    <div id="a-err" class="form-error" style="display:none"></div>
    <button class="btn btn-primary btn-full btn-lg" id="a-btn" style="margin-top:8px">Create studio →</button>
    <div class="auth-switch">Already registered? <a id="go-login" style="cursor:pointer;color:var(--brand)">Sign in</a></div>`;
}

function renderAuthPage(mode = 'login') {
  document.body.innerHTML = `<div class="auth-page"><div class="auth-card" id="auth-card"></div></div><div id="toast-container"></div>`;
  showAuthForm(mode);
}

function showAuthForm(mode) {
  const card = document.getElementById('auth-card');
  card.innerHTML = mode === 'register' ? registerForm() : loginForm();

  if (mode === 'register') {
    const studioIn = document.getElementById('r-studio');
    const slugIn = document.getElementById('r-slug');
    if (studioIn && slugIn) {
      studioIn.oninput = () => {
        if (!slugIn._t) slugIn.value = studioIn.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      };
      slugIn.oninput = () => { slugIn._t = true; };
    }
    document.getElementById('go-login')?.addEventListener('click', () => showAuthForm('login'));
  } else {
    document.getElementById('go-register')?.addEventListener('click', () => showAuthForm('register'));
  }

  document.getElementById('a-btn').onclick = async () => {
    const errEl = document.getElementById('a-err');
    const btn = document.getElementById('a-btn');
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const { post, setAuth } = await import('./api.js');
      if (mode === 'register') {
        const data = await post('/api/auth/register', {
          name: document.getElementById('r-name').value.trim(),
          studioName: document.getElementById('r-studio').value.trim(),
          email: document.getElementById('r-email').value.trim(),
          password: document.getElementById('r-pass').value,
          slug: document.getElementById('r-slug').value.trim()
        });
        setAuth(data.token, data.user);
        initOwnerApp();
      } else {
        const data = await post('/api/auth/login', {
          email: document.getElementById('a-email').value.trim(),
          password: document.getElementById('a-pass').value
        });
        setAuth(data.token, data.user);
        initOwnerApp();
      }
    } catch(e) {
      errEl.textContent = e.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = mode === 'register' ? 'Create studio →' : 'Sign in';
    }
  };

  card.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('a-btn')?.click(); });
}

export function initOwnerApp() {
  const token = localStorage.getItem('fb_token');
  if (!token) { renderAuthPage(); return; }
  const user = getUser();
  buildShell(user);
  route();
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
}
