import { get, post, toast, modal, closeModal, fmtTime, fmtDate, fmtDay, isoDate, spotsText } from './api.js';

let studioSlug = '';
let studioData = null;
let memberToken = localStorage.getItem('fb_member_token');
let memberUser = null;
let currentView = 'schedule';

function getSlug() {
  const path = location.pathname;
  const m = path.match(/\/book\/([^/]+)/);
  return m ? m[1] : null;
}

async function boot() {
  studioSlug = getSlug();
  if (!studioSlug) {
    document.body.innerHTML = `<div style="text-align:center;padding:80px;font-family:sans-serif;color:#888">
      <h2>No studio specified</h2><p>Visit /book/your-studio-slug to book classes.</p></div>`;
    return;
  }

  if (memberToken) {
    try {
      const { get: getApi } = await import('./api.js');
      memberUser = await getApi('/api/me', null, memberToken);
    } catch { memberToken = null; localStorage.removeItem('fb_member_token'); }
  }

  await loadAndRender();
}

async function loadAndRender() {
  try {
    const from = isoDate(new Date());
    const to = isoDate(new Date(Date.now() + 14*86400000));
    const data = await fetch(`/api/public/sessions?studio=${studioSlug}&from=${from}&to=${to}`,
      { headers: memberToken ? { Authorization: `Bearer ${memberToken}` } : {} })
      .then(r => r.json());
    if (data.error) throw new Error(data.error);
    studioData = data.studio;
    renderShell();
    renderScheduleView(data.sessions);
  } catch(e) {
    document.body.innerHTML = `<div style="text-align:center;padding:80px;font-family:sans-serif;color:#888">
      <h2>Studio not found</h2><p>${e.message}</p></div>`;
  }
}

function renderShell() {
  const brandColor = studioData?.primary_color || '#185FA5';
  document.documentElement.style.setProperty('--brand', brandColor);
  document.documentElement.style.setProperty('--brand-dark', adjustColor(brandColor, -20));
  document.documentElement.style.setProperty('--brand-light', hexToLightBg(brandColor));

  document.body.innerHTML = `
    <header class="portal-header">
      <div class="ph-logo">${studioData?.name || 'Studio'}</div>
      <nav class="ph-nav">
        <a id="nav-schedule" class="active" onclick="switchView('schedule')">Classes</a>
        ${memberUser ? `<a id="nav-bookings" onclick="switchView('bookings')">My bookings</a>
          <a id="nav-account" onclick="switchView('account')">Account</a>` : ''}
      </nav>
      <div>
        ${memberUser
          ? `<button class="btn btn-secondary btn-sm" onclick="signOut()">Sign out</button>`
          : `<button class="btn btn-primary btn-sm" onclick="showAuth('login')">Sign in</button>`}
      </div>
    </header>
    <div class="portal-body" id="portal-body"></div>
    <div id="toast-container"></div>`;

  window.switchView = (v) => {
    currentView = v;
    document.querySelectorAll('.ph-nav a').forEach(a => a.classList.remove('active'));
    document.getElementById(`nav-${v}`)?.classList.add('active');
    if (v === 'schedule') loadAndRender();
    else if (v === 'bookings') renderMyBookings();
    else if (v === 'account') renderAccount();
  };

  window.signOut = () => {
    localStorage.removeItem('fb_member_token');
    localStorage.removeItem('fb_member_user');
    memberToken = null; memberUser = null;
    loadAndRender();
  };
}

function renderScheduleView(sessions) {
  const body = document.getElementById('portal-body');
  if (!body) return;

  if (!sessions.length) {
    body.innerHTML = `<div class="empty-state"><div class="es-icon">📅</div>
      <div class="es-title">No classes scheduled</div>
      <div class="es-sub">Check back soon!</div></div>`;
    return;
  }

  // Group by date
  const byDate = {};
  sessions.forEach(s => {
    const d = isoDate(new Date(s.starts_at));
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });

  let html = '';
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(Date.now() + 86400000));

  Object.keys(byDate).sort().forEach(date => {
    const label = date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : fmtDay(date + 'T12:00:00');
    html += `<div class="days-group">
      <div class="dg-date">${label}</div>
      <div class="session-list">
        ${byDate[date].map(s => sessionCard(s)).join('')}
      </div>
    </div>`;
  });

  body.innerHTML = html;

  window.__bookSession = (id) => openBookingFlow(id, sessions.find(s => s.id === id));
  window.__cancelMyBooking = cancelMyBooking;
}

function sessionCard(s) {
  const spotsLeft = s.capacity - (s.booked_count || 0);
  const isFull = spotsLeft <= 0;
  const isBooked = !!s.my_booking;
  const isWaitlisted = s.my_booking?.waitlisted;
  const isPast = new Date(s.starts_at) < new Date();

  let actionBtn = '';
  if (isPast) {
    actionBtn = `<span class="badge badge-gray">Past</span>`;
  } else if (isBooked && !isWaitlisted) {
    actionBtn = `<div style="display:flex;gap:8px;align-items:center">
      <span class="badge badge-green">Booked</span>
      ${memberUser ? `<button class="btn btn-ghost btn-sm" onclick="window.__cancelMyBooking('${s.my_booking.id}')">Cancel</button>` : ''}
    </div>`;
  } else if (isWaitlisted) {
    actionBtn = `<div style="display:flex;gap:8px;align-items:center">
      <span class="badge badge-amber">Waitlisted #${s.my_booking.waitlist_position}</span>
      ${memberUser ? `<button class="btn btn-ghost btn-sm" onclick="window.__cancelMyBooking('${s.my_booking.id}')">Leave waitlist</button>` : ''}
    </div>`;
  } else if (isFull && s.waitlist_count < s.waitlist_limit) {
    actionBtn = `<button class="btn btn-secondary btn-sm" onclick="window.__bookSession('${s.id}')">Join waitlist</button>`;
  } else if (isFull) {
    actionBtn = `<span class="badge badge-red">Full</span>`;
  } else {
    actionBtn = `<button class="btn btn-primary btn-sm" onclick="window.__bookSession('${s.id}')">Book</button>`;
  }

  const fillPct = Math.min(100, Math.round((s.booked_count || 0) / s.capacity * 100));
  const fillClass = fillPct >= 100 ? 'full' : fillPct >= 80 ? 'warn' : '';

  return `
    <div class="session-card" style="display:flex;gap:12px">
      <div class="session-color-bar" style="background:${s.color||'var(--brand)'}"></div>
      <div style="flex:1;min-width:0">
        <div class="sc-time">${fmtTime(s.starts_at)} — ${fmtTime(s.ends_at)}</div>
        <div class="sc-name">${s.name}</div>
        <div class="sc-meta">
          ${s.instructor_name ? `<span>with ${s.instructor_name}</span>` : ''}
          <span>${s.duration_minutes || Math.round((new Date(s.ends_at)-new Date(s.starts_at))/60000)} min</span>
        </div>
        <div class="sc-footer">
          <div>
            ${spotsText(s)}
            <div class="progress-bar mt-4" style="width:80px">
              <div class="progress-fill ${fillClass}" style="width:${fillPct}%"></div>
            </div>
          </div>
          ${actionBtn}
        </div>
      </div>
    </div>`;
}

async function openBookingFlow(sessionId, session) {
  if (!memberUser) {
    showAuth('login', () => openBookingFlow(sessionId, session));
    return;
  }

  const isFull = session.spots_left <= 0;
  const m = modal(
    isFull ? 'Join waitlist' : 'Confirm booking',
    `<div style="text-align:center;padding:8px 0">
      <div style="width:10px;height:10px;border-radius:50%;background:${session.color||'var(--brand)'};margin:0 auto 12px"></div>
      <div style="font-size:18px;font-weight:600;margin-bottom:6px">${session.name}</div>
      <div style="color:var(--text-2);font-size:14px">${fmtDay(session.starts_at)}</div>
      <div style="color:var(--text-2);font-size:14px">${fmtTime(session.starts_at)} – ${fmtTime(session.ends_at)}</div>
      ${session.instructor_name ? `<div style="color:var(--text-3);font-size:13px;margin-top:4px">with ${session.instructor_name}</div>` : ''}
      <div style="margin-top:16px;padding:12px;background:var(--bg-2);border-radius:var(--radius);font-size:13px;color:var(--text-2)">
        Booking as <strong>${memberUser.name}</strong>
        ${isFull ? '<br><span style="color:var(--amber)">This class is full — you\'ll be added to the waitlist</span>' : ''}
      </div>
      <div id="book-err" style="color:var(--red);font-size:13px;margin-top:8px;display:none"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="confirm-book-btn">${isFull ? 'Join waitlist' : 'Confirm booking'}</button>`
  );

  document.getElementById('confirm-book-btn').onclick = async () => {
    const btn = document.getElementById('confirm-book-btn');
    btn.disabled = true; btn.textContent = 'Booking...';
    try {
      const result = await fetch('/api/public/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` },
        body: JSON.stringify({ session_id: sessionId })
      }).then(r => r.json());
      if (result.error) throw new Error(result.error);
      toast(result.waitlisted ? `You're on the waitlist!` : `Booked! See you there 🎉`, 'success');
      closeModal();
      loadAndRender();
    } catch(e) {
      const err = document.getElementById('book-err');
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
      btn.disabled = false; btn.textContent = isFull ? 'Join waitlist' : 'Confirm booking';
    }
  };
}

async function cancelMyBooking(bookingId) {
  if (!confirm('Cancel this booking?')) return;
  try {
    const res = await fetch('/api/public/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ booking_id: bookingId })
    }).then(r => r.json());
    if (res.error) throw new Error(res.error);
    if (res.lateCancel) toast('Booking cancelled (late cancel — credit not refunded)', 'warning');
    else toast('Booking cancelled', 'success');
    loadAndRender();
  } catch(e) { toast(e.message, 'error'); }
}

async function renderMyBookings() {
  const body = document.getElementById('portal-body');
  body.innerHTML = `<div class="loading">Loading your bookings...</div>`;
  try {
    const bookings = await fetch('/api/my-bookings?upcoming=true', {
      headers: { Authorization: `Bearer ${memberToken}` }
    }).then(r => r.json());

    if (!bookings.length) {
      body.innerHTML = `<div class="empty-state">
        <div class="es-icon">📅</div>
        <div class="es-title">No upcoming bookings</div>
        <div class="es-sub">Browse the schedule and book a class</div>
        <button class="btn btn-primary mt-12" onclick="switchView('schedule')">View schedule</button>
      </div>`;
      return;
    }

    body.innerHTML = `
      <div class="portal-section-title">Upcoming classes</div>
      <div class="session-list">
        ${bookings.map(b => `
          <div class="session-card" style="display:flex;gap:12px">
            <div class="session-color-bar" style="background:${b.color||'var(--brand)'}"></div>
            <div style="flex:1">
              <div class="sc-time">${fmtDay(b.starts_at)} · ${fmtTime(b.starts_at)}</div>
              <div class="sc-name">${b.session_name}</div>
              <div class="sc-meta">${b.instructor_name?`with ${b.instructor_name}`:''}</div>
              <div class="sc-footer">
                <span class="badge ${b.waitlisted ? 'badge-amber' : 'badge-green'}">${b.waitlisted ? `Waitlisted #${b.waitlist_position}` : 'Confirmed'}</span>
                <button class="btn btn-ghost btn-sm" onclick="window.__cancelMyBooking('${b.id}')">Cancel</button>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
    window.__cancelMyBooking = cancelMyBooking;
  } catch(e) { toast(e.message,'error'); }
}

function renderAccount() {
  const body = document.getElementById('portal-body');
  if (!memberUser) return;
  const typeLabel = { unlimited:'Unlimited monthly', pack:'Class pack', dropin:'Drop-in', trial:'Trial', none:'No active membership' };
  body.innerHTML = `
    <div class="card" style="max-width:480px">
      <div class="flex items-center gap-12 mb-20">
        <div style="width:52px;height:52px;border-radius:50%;background:var(--brand-light);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:20px;color:var(--brand-dark)">${memberUser.name?.charAt(0)||'M'}</div>
        <div>
          <div style="font-size:18px;font-weight:600">${memberUser.name}</div>
          <div class="text-sm text-muted">${memberUser.email}</div>
        </div>
      </div>
      <hr class="divider">
      <div class="stats-grid" style="grid-template-columns:1fr 1fr">
        <div class="stat-card card-sm">
          <div class="stat-label">Membership</div>
          <div style="margin-top:4px;font-weight:500;font-size:14px">${typeLabel[memberUser.membership_type]||'—'}</div>
        </div>
        <div class="stat-card card-sm">
          <div class="stat-label">Credits remaining</div>
          <div class="stat-value" style="font-size:22px">${memberUser.credits||0}</div>
        </div>
      </div>
      ${memberUser.membership_type === 'none' ? `
        <div style="margin-top:16px;padding:14px;background:var(--brand-light);border-radius:var(--radius);font-size:13px;color:var(--brand-dark)">
          Contact the studio to set up your membership.
        </div>` : ''}
    </div>`;
}

function showAuth(mode, onSuccess) {
  const isLogin = mode !== 'register';
  modal(isLogin ? 'Sign in to book' : 'Create account', `
    <div class="form-group"><label>Name${isLogin?'':' *'}</label>${isLogin ? '' : `<input id="a-name" type="text" placeholder="Your name">`}</div>
    ${isLogin ? '' : `<div class="form-group"><label></label></div>`}
    <div class="form-group"><label>Email</label><input id="a-email" type="email" placeholder="you@email.com" autocomplete="email"></div>
    <div class="form-group"><label>Password</label><input id="a-pass" type="password" placeholder="Password" autocomplete="${isLogin?'current-password':'new-password'}"></div>
    <div id="a-err" class="form-error" style="display:none"></div>
    <div style="text-align:center;margin-top:8px;font-size:13px;color:var(--text-3)">
      ${isLogin ? `No account? <a style="color:var(--brand);cursor:pointer" onclick="closeModal();showAuth('register',onSuccessCb)">Create one</a>` :
        `Have an account? <a style="color:var(--brand);cursor:pointer" onclick="closeModal();showAuth('login',onSuccessCb)">Sign in</a>`}
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="auth-submit-btn">${isLogin ? 'Sign in' : 'Create account'}</button>`);

  window.onSuccessCb = onSuccess;

  document.getElementById('auth-submit-btn').onclick = async () => {
    const email = document.getElementById('a-email')?.value.trim();
    const pass = document.getElementById('a-pass')?.value;
    const name = document.getElementById('a-name')?.value.trim();
    const btn = document.getElementById('auth-submit-btn');
    const err = document.getElementById('a-err');

    if (!email || !pass) { err.textContent='Email and password required'; err.style.display='block'; return; }
    if (!isLogin && !name) { err.textContent='Name required'; err.style.display='block'; return; }

    btn.disabled = true;
    try {
      const endpoint = isLogin ? '/api/auth/member/login' : '/api/auth/member/register';
      const body = isLogin ? { studioSlug, email, password: pass } : { studioSlug, email, password: pass, name };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);

      memberToken = res.token;
      memberUser = res.member;
      localStorage.setItem('fb_member_token', res.token);
      localStorage.setItem('fb_member_user', JSON.stringify(res.member));

      toast(`Welcome, ${memberUser.name}!`, 'success');
      closeModal();
      renderShell();
      if (onSuccess) onSuccess();
      else loadAndRender();
    } catch(e) {
      err.textContent = e.message; err.style.display='block';
      btn.disabled = false;
    }
  };
}

// Color utils
function adjustColor(hex, amt) {
  const r = Math.max(0,Math.min(255,parseInt(hex.slice(1,3),16)+amt));
  const g = Math.max(0,Math.min(255,parseInt(hex.slice(3,5),16)+amt));
  const b = Math.max(0,Math.min(255,parseInt(hex.slice(5,7),16)+amt));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
function hexToLightBg(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},0.1)`;
}

window.showAuth = showAuth;
boot();
