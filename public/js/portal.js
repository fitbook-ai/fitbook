import { get, post, setAuth, clearAuth, getUser, toast, fmtTime, fmtDate, fmtDay, isoDate } from './api.js';

let studioSlug = '';
let studioData = null;
let memberUser = null;
let currentView = 'book';

function getSlug() {
  const path = window.location.pathname;
  const m = path.match(/\/book\/([^/]+)/);
  return m ? m[1] : '';
}

function setView(v) {
  currentView = v;
  document.querySelectorAll('.ph-nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  const main = document.getElementById('portal-main');
  if (!main) return;
  if (v === 'book') renderClassList(main);
  else if (v === 'my') renderMyBookings(main);
  else if (v === 'account') renderAccount(main);
}

export async function initPortal() {
  studioSlug = getSlug();
  if (!studioSlug) {
    document.body.innerHTML = `<div class="auth-page"><div class="auth-card"><div class="auth-logo"><div class="logo">FitBook</div></div><p style="text-align:center;color:var(--text-3)">No studio found.<br>Check the link and try again.</p></div></div>`;
    return;
  }

  memberUser = getUser();

  // Load studio info first
  try {
    const data = await get(`/api/public/sessions?studio=${studioSlug}`);
    studioData = data.studio;
    if (studioData?.primary_color) {
      document.documentElement.style.setProperty('--brand', studioData.primary_color);
    }
    document.title = `${studioData.name} — Book a Class`;
  } catch(e) {
    document.body.innerHTML = `<div class="auth-page"><div class="auth-card"><div class="auth-title">Studio not found</div><p style="color:var(--text-3)">Check the link and try again.</p></div></div>`;
    return;
  }

  renderShell();
  setView('book');
}

function renderShell() {
  document.body.innerHTML = `
    <header class="portal-header">
      <div class="ph-logo">${studioData?.name || 'FitBook'}</div>
      <nav class="ph-nav">
        <a data-view="book" onclick="window.__pv('book')" class="active">Classes</a>
        <a data-view="my" onclick="window.__pv('my')">My bookings</a>
        <a data-view="account" onclick="window.__pv('account')">${memberUser ? memberUser.name.split(' ')[0] : 'Sign in'}</a>
      </nav>
    </header>
    <div class="portal-body" id="portal-body">
      <div id="portal-main"></div>
    </div>
    <div id="toast-container"></div>`;
  window.__pv = setView;
}

async function renderClassList(container) {
  container.innerHTML = `<div class="loading">Loading classes...</div>`;
  const from = isoDate(new Date());
  const to = isoDate(new Date(Date.now() + 14 * 86400000));
  try {
    const data = await get(`/api/public/sessions?studio=${studioSlug}&from=${from}&to=${to}`);
    const sessions = data.sessions || [];

    if (!sessions.length) {
      container.innerHTML = `<div class="empty-state"><div class="es-icon" style="font-size:32px">📅</div><div class="es-title">No classes scheduled</div><div class="es-sub">Check back soon!</div></div>`;
      return;
    }

    // Group by date
    const byDate = {};
    sessions.forEach(s => {
      const d = isoDate(new Date(s.starts_at));
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(s);
    });

    container.innerHTML = Object.entries(byDate).map(([date, slist]) => `
      <div class="days-group">
        <div class="dg-date">${formatGroupDate(date)}</div>
        <div class="session-list">
          ${slist.map(s => sessionCard(s)).join('')}
        </div>
      </div>`).join('');

    // Attach booking handlers
    container.querySelectorAll('[data-book]').forEach(btn => {
      btn.onclick = () => handleBook(btn.dataset.book, btn.dataset.name);
    });
    container.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.onclick = () => handleCancel(btn.dataset.cancel, btn.dataset.session, btn.dataset.name);
    });
  } catch(e) { toast(e.message, 'error'); }
}

function formatGroupDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  if (dateStr === today) return 'Today — ' + d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  if (dateStr === tomorrow) return 'Tomorrow — ' + d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
}

function sessionCard(s) {
  const spotsLeft = s.capacity - (s.booked_count || 0);
  const isFull = spotsLeft <= 0;
  const hasWaitlist = isFull && (s.waitlist_count || 0) < s.waitlist_limit;
  const myBooking = s.my_booking;

  let actionBtn = '';
  if (myBooking) {
    if (myBooking.waitlisted) {
      actionBtn = `<button class="btn btn-secondary btn-sm" data-cancel="${myBooking.id}" data-session="${s.id}" data-name="${s.name}">Leave waitlist (#${myBooking.waitlist_position})</button>`;
    } else {
      actionBtn = `<button class="btn btn-danger btn-sm" data-cancel="${myBooking.id}" data-session="${s.id}" data-name="${s.name}">Cancel booking</button>`;
    }
  } else if (isFull) {
    if (hasWaitlist) {
      actionBtn = `<button class="btn btn-secondary btn-sm" data-book="${s.id}" data-name="${s.name}">Join waitlist</button>`;
    } else {
      actionBtn = `<button class="btn btn-ghost btn-sm" disabled>Waitlist full</button>`;
    }
  } else {
    actionBtn = `<button class="btn btn-primary btn-sm" data-book="${s.id}" data-name="${s.name}">Book spot</button>`;
  }

  let spotsDisplay = '';
  if (myBooking && !myBooking.waitlisted) {
    spotsDisplay = `<span class="sc-spots" style="color:var(--green)">You're booked!</span>`;
  } else if (myBooking && myBooking.waitlisted) {
    spotsDisplay = `<span class="sc-spots" style="color:var(--amber)">Waitlist #${myBooking.waitlist_position}</span>`;
  } else if (isFull) {
    spotsDisplay = `<span class="sc-spots full">Full</span>`;
  } else if (spotsLeft <= 3) {
    spotsDisplay = `<span class="sc-spots low">${spotsLeft} spot${spotsLeft===1?'':'s'} left</span>`;
  } else {
    spotsDisplay = `<span class="sc-spots">${spotsLeft} / ${s.capacity} spots</span>`;
  }

  const fillPct = Math.min(100, Math.round((s.booked_count||0)/s.capacity*100));
  const fillCls = fillPct >= 100 ? 'full' : fillPct >= 75 ? 'warn' : '';

  return `
    <div class="session-card" style="display:flex;gap:12px">
      <div class="session-color-bar" style="background:${s.color||'var(--brand)'}"></div>
      <div style="flex:1">
        <div class="sc-time">${fmtTime(s.starts_at)} — ${fmtTime(s.ends_at)}</div>
        <div class="sc-name">${s.name}</div>
        <div class="sc-meta">
          ${s.instructor_name ? `<span>with ${s.instructor_name}</span>` : ''}
          ${s.description ? `<span style="color:var(--text-3)">${s.description.substring(0,80)}${s.description.length>80?'…':''}</span>` : ''}
        </div>
        <div class="progress-bar mt-8" style="max-width:160px"><div class="progress-fill ${fillCls}" style="width:${fillPct}%"></div></div>
        <div class="sc-footer">
          ${spotsDisplay}
          ${actionBtn}
        </div>
      </div>
    </div>`;
}

async function handleBook(sessionId, sessionName) {
  if (!memberUser) {
    showAuthModal(() => handleBook(sessionId, sessionName));
    return;
  }
  try {
    const result = await post('/api/public/book', { session_id: sessionId });
    if (result.waitlisted) {
      toast(`Added to waitlist — position #${result.waitlistPosition}`, 'default', 4000);
    } else {
      toast(`Booked! See you there.`, 'success');
    }
    renderClassList(document.getElementById('portal-main'));
  } catch(e) { toast(e.message, 'error'); }
}

async function handleCancel(bookingId, sessionId, sessionName) {
  if (!confirm(`Cancel your booking for ${sessionName}?`)) return;
  try {
    const result = await post('/api/public/cancel', { booking_id: bookingId });
    if (result.lateCancel) toast('Cancelled (late cancel — credit not returned)', 'warning');
    else toast('Booking cancelled', 'default');
    renderClassList(document.getElementById('portal-main'));
  } catch(e) { toast(e.message, 'error'); }
}

async function renderMyBookings(container) {
  if (!memberUser) {
    container.innerHTML = `<div class="empty-state"><div class="es-title">Sign in to see your bookings</div></div>`;
    setTimeout(() => showAuthModal(() => renderMyBookings(container)), 300);
    return;
  }
  container.innerHTML = `<div class="loading">Loading your bookings...</div>`;
  try {
    const bookings = await get('/api/my-bookings');
    if (!bookings.length) {
      container.innerHTML = `<div class="empty-state"><div class="es-icon" style="font-size:32px">📋</div><div class="es-title">No upcoming bookings</div><div class="es-sub">Browse classes and book a spot!</div></div>
        <div style="text-align:center;margin-top:16px"><button class="btn btn-primary" onclick="window.__pv('book')">Browse classes</button></div>`;
      return;
    }
    container.innerHTML = `
      <div class="portal-section-title">Upcoming classes</div>
      <div class="session-list">
        ${bookings.map(b => `
          <div class="session-card" style="display:flex;gap:12px">
            <div class="session-color-bar" style="background:${b.color||'var(--brand)'}"></div>
            <div style="flex:1">
              <div class="sc-time">${fmtDate(b.starts_at,{weekday:'short',month:'short',day:'numeric'})} · ${fmtTime(b.starts_at)}</div>
              <div class="sc-name">${b.session_name}</div>
              <div class="sc-meta">${b.instructor_name ? `<span>with ${b.instructor_name}</span>` : ''}
                ${b.waitlisted ? `<span class="badge badge-amber">Waitlist #${b.waitlist_position}</span>` : `<span class="badge badge-green">Confirmed</span>`}
              </div>
              <div class="sc-footer">
                <span></span>
                <button class="btn btn-danger btn-sm" onclick="window.__cancelPortal('${b.id}','${b.session_id}','${b.session_name.replace(/'/g,"\\'")}')">Cancel</button>
              </div>
            </div>
          </div>`).join('')}
      </div>`;

    window.__cancelPortal = async (bid, sid, name) => {
      if (!confirm(`Cancel booking for ${name}?`)) return;
      try {
        await post('/api/public/cancel', { booking_id: bid });
        toast('Cancelled', 'default');
        renderMyBookings(container);
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { toast(e.message, 'error'); }
}

function renderAccount(container) {
  if (!memberUser) {
    container.innerHTML = '';
    showAuthForm(container, () => {
      memberUser = getUser();
      const nav = document.querySelector('.ph-nav a[data-view="account"]');
      if (nav) nav.textContent = memberUser?.name?.split(' ')[0] || 'Account';
      setView('account');
    });
    return;
  }

  container.innerHTML = `
    <div style="max-width:400px">
      <div class="portal-section-title">Your account</div>
      <div class="card mb-16">
        <div class="flex items-center gap-12 mb-16">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--brand-light);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;color:var(--brand-dark)">${memberUser.name.charAt(0).toUpperCase()}</div>
          <div><div class="font-600" style="font-size:16px">${memberUser.name}</div><div class="text-sm text-muted">${memberUser.email}</div></div>
        </div>
        <div class="divider"></div>
        <div id="member-info" class="text-sm text-muted">Loading membership info...</div>
      </div>
      <button class="btn btn-secondary btn-full" id="sign-out-btn">Sign out</button>
    </div>`;

  document.getElementById('sign-out-btn').onclick = () => {
    clearAuth();
    memberUser = null;
    const nav = document.querySelector('.ph-nav a[data-view="account"]');
    if (nav) nav.textContent = 'Sign in';
    setView('book');
  };

  get('/api/me').then(me => {
    const infoEl = document.getElementById('member-info');
    if (!infoEl) return;
    const membershipLabels = { unlimited:'Unlimited monthly', pack:'Class pack', dropin:'Drop-in', trial:'Trial', none:'No active membership' };
    infoEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="stat-card card-sm"><div class="stat-label">Membership</div><div class="mt-4 font-500">${membershipLabels[me.membership_type]||'None'}</div></div>
        ${me.membership_type==='pack' ? `<div class="stat-card card-sm"><div class="stat-label">Credits left</div><div class="stat-value" style="font-size:22px">${me.credits||0}</div></div>` : ''}
      </div>`;
  }).catch(() => {});
}

function showAuthForm(container, onSuccess) {
  container.innerHTML = `
    <div style="max-width:380px;margin:0 auto">
      <div class="portal-section-title" id="auth-mode-title">Sign in to book classes</div>
      <div id="auth-form-wrap">
        ${memberLoginForm()}
      </div>
    </div>`;
  attachPortalAuth(container, onSuccess);
}

function memberLoginForm() {
  return `
    <div class="card">
      <div class="form-group"><label>Email</label><input id="pa-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="form-group"><label>Password</label><input id="pa-pass" type="password" placeholder="••••••••"></div>
      <div id="pa-err" class="form-error" style="display:none"></div>
      <button class="btn btn-primary btn-full" id="pa-btn" style="margin-top:4px">Sign in</button>
      <div style="text-align:center;margin-top:12px;font-size:13px;color:var(--text-3)">New here? <a id="pa-switch" style="color:var(--brand);cursor:pointer">Create account</a></div>
    </div>`;
}

function memberRegisterForm() {
  return `
    <div class="card">
      <div class="form-group"><label>Full name</label><input id="pa-name" type="text" placeholder="Jane Smith"></div>
      <div class="form-group"><label>Email</label><input id="pa-email" type="email" placeholder="you@example.com"></div>
      <div class="form-group"><label>Password</label><input id="pa-pass" type="password" placeholder="Choose a password"></div>
      <div id="pa-err" class="form-error" style="display:none"></div>
      <button class="btn btn-primary btn-full" id="pa-btn" style="margin-top:4px">Create account</button>
      <div style="text-align:center;margin-top:12px;font-size:13px;color:var(--text-3)">Already have an account? <a id="pa-switch" style="color:var(--brand);cursor:pointer">Sign in</a></div>
    </div>`;
}

function attachPortalAuth(container, onSuccess) {
  let mode = 'login';

  const handle = async () => {
    const errEl = document.getElementById('pa-err');
    const btn = document.getElementById('pa-btn');
    if (!errEl || !btn) return;
    errEl.style.display = 'none';
    btn.disabled = true; btn.textContent = '...';
    try {
      if (mode === 'login') {
        const data = await post('/api/auth/member/login', {
          studioSlug,
          email: document.getElementById('pa-email').value.trim(),
          password: document.getElementById('pa-pass').value
        });
        setAuth(data.token, data.member);
        memberUser = data.member;
      } else {
        const data = await post('/api/auth/member/register', {
          studioSlug,
          name: document.getElementById('pa-name').value.trim(),
          email: document.getElementById('pa-email').value.trim(),
          password: document.getElementById('pa-pass').value
        });
        setAuth(data.token, data.member);
        memberUser = data.member;
      }
      toast(`Welcome, ${memberUser.name.split(' ')[0]}!`, 'success');
      if (onSuccess) onSuccess();
    } catch(e) {
      errEl.textContent = e.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    }
  };

  document.getElementById('pa-btn')?.addEventListener('click', handle);
  document.getElementById('pa-switch')?.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    document.getElementById('auth-form-wrap').innerHTML = mode === 'register' ? memberRegisterForm() : memberLoginForm();
    document.getElementById('auth-mode-title').textContent = mode === 'register' ? 'Create your account' : 'Sign in to book classes';
    attachPortalAuth(container, onSuccess);
  });

  container.addEventListener('keydown', e => { if (e.key === 'Enter') handle(); });
}

function showAuthModal(onSuccess) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Sign in to book</span>
        <button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">×</button>
      </div>
      <div class="modal-body" id="modal-auth-wrap"></div>
    </div>`;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);

  const wrap = document.getElementById('modal-auth-wrap');
  let mode = 'login';

  const renderModalForm = () => {
    wrap.innerHTML = mode === 'register' ? memberRegisterForm() : memberLoginForm();
    attachPortalAuth(wrap, () => {
      backdrop.remove();
      const nav = document.querySelector('.ph-nav a[data-view="account"]');
      if (nav) nav.textContent = memberUser?.name?.split(' ')[0] || 'Account';
      onSuccess();
    });
    document.getElementById('pa-switch')?.addEventListener('click', () => {
      mode = mode === 'login' ? 'register' : 'login';
      renderModalForm();
    });
  };
  renderModalForm();
}
