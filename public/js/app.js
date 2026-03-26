import { requireAuth, clearAuth, getUser, toast } from './api.js';
import { renderDashboard } from './owner/dashboard.js';
import { renderSchedule } from './owner/schedule.js';
import { renderMembers } from './owner/members.js';
import { renderSettings } from './owner/settings.js';

const ROUTES = {
  '/': renderDashboard,
  '/dashboard': renderDashboard,
  '/schedule': renderSchedule,
  '/members': renderMembers,
  '/settings': renderSettings,
};

const NAV = [
  { path: '/', label: 'Dashboard', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>` },
  { path: '/schedule', label: 'Schedule', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>` },
  { path: '/members', label: 'Members', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
  { path: '/settings', label: 'Settings', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
];

function getPath() {
  const hash = location.hash.replace('#', '') || '/';
  return hash.split('?')[0];
}

function buildShell(user) {
  document.body.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="logo-name">FitBook</div>
          <div class="logo-sub">${user.studio?.name || user.studioName || 'Studio'}</div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">${user.name}</div>
          <div class="sidebar-studio">${user.email}</div>
          <span class="sidebar-logout" id="logout-btn">Sign out</span>
        </div>
      </aside>
      <main class="main-content" id="main-content"></main>
    </div>
    <div id="toast-container"></div>`;

  document.getElementById('logout-btn').onclick = () => {
    clearAuth();
    location.href = '/login';
  };

  renderNav();
  window.addEventListener('hashchange', () => { renderNav(); route(); });
}

function renderNav() {
  const path = getPath();
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = NAV.map(n => `
    <a class="nav-item ${path === n.path || (n.path !== '/' && path.startsWith(n.path)) ? 'active' : ''}"
       href="#${n.path}">
      ${n.icon}
      ${n.label}
    </a>`).join('');
}

function route() {
  const path = getPath();
  const container = document.getElementById('main-content');
  if (!container) return;
  const handler = ROUTES[path] || ROUTES['/'];
  handler(container);
}

// Auth pages
function renderLogin() {
  document.body.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo">FitBook</div>
          <div class="tagline">Studio management made simple</div>
        </div>
        <div id="auth-view"></div>
      </div>
    </div>
    <div id="toast-container"></div>`;
  showLoginForm();
}

function showLoginForm() {
  document.getElementById('auth-view').innerHTML = `
    <div class="auth-title">Welcome back</div>
    <div class="auth-sub">Sign in to your studio</div>
    <div class="form-group"><label>Email</label><input id="l-email" type="email" autocomplete="email" placeholder="you@studio.com"></div>
    <div class="form-group"><label>Password</label><input id="l-pass" type="password" autocomplete="current-password" placeholder="Password"></div>
    <div id="l-err" class="form-error" style="display:none"></div>
    <button class="btn btn-primary btn-full mt-12" id="login-btn" style="margin-top:16px">Sign in</button>
    <div class="auth-switch">New studio? <a onclick="showRegForm()">Create your account →</a></div>`;

  const doLogin = async () => {
    const email = document.getElementById('l-email').value.trim();
    const pass = document.getElementById('l-pass').value;
    if (!email || !pass) { showAuthErr('l-err','Email and password required'); return; }
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const { post: postFn } = await import('./api.js');
      const { setAuth } = await import('./api.js');
      const data = await postFn('/api/auth/login', { email, password: pass });
      setAuth(data.token, data.user);
      location.hash = '#/';
      location.reload();
    } catch(e) {
      showAuthErr('l-err', e.message);
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  };

  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('l-pass').onkeydown = e => { if(e.key==='Enter') doLogin(); };
  window.showRegForm = showRegisterForm;
}

function showRegisterForm() {
  document.getElementById('auth-view').innerHTML = `
    <div class="auth-title">Create your studio</div>
    <div class="auth-sub">Start your free trial — no credit card needed</div>
    <div class="form-row">
      <div class="form-group"><label>Your name</label><input id="r-name" type="text" placeholder="Jane Smith"></div>
      <div class="form-group"><label>Studio name</label><input id="r-studio" type="text" placeholder="Spark Spin Studio"></div>
    </div>
    <div class="form-group"><label>Email</label><input id="r-email" type="email" placeholder="you@studio.com"></div>
    <div class="form-group"><label>Password</label><input id="r-pass" type="password" placeholder="At least 8 characters"></div>
    <div class="form-group">
      <label>Booking URL (your-studio.com/book/<span style="color:var(--brand)" id="slug-preview">your-studio</span>)</label>
      <input id="r-slug" type="text" placeholder="your-studio" oninput="document.getElementById('slug-preview').textContent=this.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')||'your-studio'">
    </div>
    <div id="r-err" class="form-error" style="display:none"></div>
    <button class="btn btn-primary btn-full" id="reg-btn" style="margin-top:16px">Create studio</button>
    <div class="auth-switch">Already have an account? <a onclick="window.showLoginForm()">Sign in</a></div>`;

  document.getElementById('r-studio').oninput = function() {
    const slug = document.getElementById('r-slug');
    if (!slug.dataset.touched) {
      const val = this.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      slug.value = val;
      document.getElementById('slug-preview').textContent = val || 'your-studio';
    }
  };
  document.getElementById('r-slug').oninput = function() { this.dataset.touched = '1'; };

  document.getElementById('reg-btn').onclick = async () => {
    const name = document.getElementById('r-name').value.trim();
    const studio = document.getElementById('r-studio').value.trim();
    const email = document.getElementById('r-email').value.trim();
    const pass = document.getElementById('r-pass').value;
    const slug = document.getElementById('r-slug').value.trim();
    if (!name||!studio||!email||!pass) { showAuthErr('r-err','All fields required'); return; }
    if (pass.length < 8) { showAuthErr('r-err','Password must be at least 8 characters'); return; }
    const btn = document.getElementById('reg-btn');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const { post: postFn, setAuth } = await import('./api.js');
      const data = await postFn('/api/auth/register', { name, studioName: studio, email, password: pass, slug: slug||studio });
      setAuth(data.token, data.user);
      location.hash = '#/';
      location.reload();
    } catch(e) { showAuthErr('r-err',e.message); btn.disabled=false; btn.textContent='Create studio'; }
  };
  window.showLoginForm = showLoginForm;
}

function showAuthErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// Boot
const path = getPath();
const isAuthPage = location.pathname === '/login' || path === '/login';
const user = getUser();

if (!user || !localStorage.getItem('fb_token')) {
  renderLogin();
} else {
  buildShell(user);
  route();
}
