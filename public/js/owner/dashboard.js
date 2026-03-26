import { get } from '../api.js';
import { fmtTime, fmtDate, membershipBadge, toast } from '../api.js';

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Dashboard</div><div class="page-sub">Your studio at a glance</div></div>
    </div>
    <div class="page-body">
      <div id="dash-stats" class="stats-grid">
        <div class="stat-card"><div class="stat-label">Loading...</div><div class="stat-value">—</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div id="dash-today" class="card"><div class="loading">Loading today's classes...</div></div>
        <div id="dash-upcoming" class="card"><div class="loading">Loading upcoming...</div></div>
      </div>
      <div style="margin-top:16px;display:grid;grid-template-columns:2fr 1fr;gap:16px">
        <div id="dash-members" class="card"></div>
        <div id="dash-breakdown" class="card"></div>
      </div>
    </div>`;

  try {
    const data = await get('/api/dashboard');
    renderStats(data.stats);
    renderToday(data.todaysSessions);
    renderUpcoming(data.upcomingWeek);
    renderRecentMembers(data.recentMembers);
    renderBreakdown(data.membersByType);
  } catch (e) { toast(e.message, 'error'); }
}

function renderStats(s) {
  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total members</div>
      <div class="stat-value">${s.totalMembers}</div>
      <div class="stat-sub stat-up">+${s.newMembersMonth} this month</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Bookings this week</div>
      <div class="stat-value">${s.totalBookingsWeek}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Classes today</div>
      <div class="stat-value">${s.todayClassCount}</div>
    </div>`;
}

function renderToday(sessions) {
  const el = document.getElementById('dash-today');
  el.innerHTML = `<div class="card-header"><span class="card-title">Today's classes</span></div>`;
  if (!sessions.length) {
    el.innerHTML += `<div class="empty-state"><div class="es-title">No classes today</div></div>`;
    return;
  }
  sessions.forEach(s => {
    const fill = s.booked_count / s.capacity;
    const pct = Math.round(fill * 100);
    el.innerHTML += `
      <div style="padding:12px 0;border-bottom:0.5px solid var(--border)" data-session="${s.id}">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-500" style="font-size:14px">${s.name}</div>
            <div class="text-sm text-muted mt-4">${fmtTime(s.starts_at)} · ${s.instructor_name||'No instructor'}</div>
          </div>
          <div style="text-align:right">
            <div class="font-500">${s.booked_count}/${s.capacity}</div>
            <div class="text-xs text-muted">${s.waitlist_count ? `+${s.waitlist_count} waitlist` : 'booked'}</div>
          </div>
        </div>
        <div class="progress-bar mt-8">
          <div class="progress-fill ${fill>=1?'full':fill>=.75?'warn':''}" style="width:${pct}%"></div>
        </div>
      </div>`;
  });
}

function renderUpcoming(sessions) {
  const el = document.getElementById('dash-upcoming');
  el.innerHTML = `<div class="card-header"><span class="card-title">Coming up</span></div>`;
  if (!sessions.length) {
    el.innerHTML += `<div class="empty-state"><div class="es-title">No upcoming classes</div></div>`;
    return;
  }
  sessions.forEach(s => {
    el.innerHTML += `
      <div style="padding:10px 0;border-bottom:0.5px solid var(--border)">
        <div class="flex items-center gap-8">
          <div style="width:4px;height:36px;border-radius:2px;background:${s.color||'var(--brand)'};flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div class="font-500 text-sm">${s.name}</div>
            <div class="text-xs text-muted">${fmtDate(s.starts_at,{weekday:'short',month:'short',day:'numeric'})} · ${fmtTime(s.starts_at)}</div>
          </div>
          <div class="text-xs text-muted">${s.booked_count}/${s.capacity}</div>
        </div>
      </div>`;
  });
}

function renderRecentMembers(members) {
  const el = document.getElementById('dash-members');
  el.innerHTML = `<div class="card-header"><span class="card-title">Recent members</span><a href="#/members" class="text-sm text-brand" style="cursor:pointer">View all</a></div>`;
  if (!members.length) { el.innerHTML += `<div class="empty-state"><div class="es-title">No members yet</div></div>`; return; }
  el.innerHTML += `<table style="width:100%"><thead><tr><th>Name</th><th>Email</th><th>Membership</th><th>Joined</th></tr></thead><tbody>
    ${members.map(m=>`<tr>
      <td class="font-500">${m.name}</td>
      <td class="text-sm text-muted">${m.email}</td>
      <td>${membershipBadge(m.membership_type)}</td>
      <td class="text-sm text-muted">${fmtDate(m.created_at)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

function renderBreakdown(types) {
  const el = document.getElementById('dash-breakdown');
  el.innerHTML = `<div class="card-header"><span class="card-title">Membership mix</span></div>`;
  if (!types.length) { el.innerHTML += `<div class="empty-state"><div class="es-title">No data</div></div>`; return; }
  const total = types.reduce((a,t)=>a+t.count, 0);
  types.sort((a,b)=>b.count-a.count).forEach(t => {
    const pct = Math.round(t.count/total*100);
    el.innerHTML += `
      <div style="margin-bottom:12px">
        <div class="flex justify-between text-sm mb-4">
          <span>${t.membership_type||'none'}</span>
          <span class="text-muted">${t.count} (${pct}%)</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
  });
}
