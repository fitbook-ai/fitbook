import { get, del, put, post, toast, modal, closeModal, fmtTime, fmtDate, isoDate, getWeekDates, CLASS_COLORS } from '../api.js';

let currentAnchor = new Date();
let sessions = [];

export async function renderSchedule(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Schedule</div><div class="page-sub">Weekly class calendar</div></div>
      <button class="btn btn-primary" id="add-session-btn">+ Add class</button>
    </div>
    <div class="page-body">
      <div class="cal-header">
        <div class="cal-nav">
          <button class="btn btn-secondary btn-sm" id="prev-week">‹</button>
          <button class="btn btn-secondary btn-sm" id="next-week">›</button>
        </div>
        <span class="cal-title" id="cal-title"></span>
        <button class="btn btn-ghost btn-sm" id="today-btn">Today</button>
      </div>
      <div id="week-grid"></div>
    </div>`;

  document.getElementById('prev-week').onclick = () => { currentAnchor.setDate(currentAnchor.getDate()-7); loadWeek(); };
  document.getElementById('next-week').onclick = () => { currentAnchor.setDate(currentAnchor.getDate()+7); loadWeek(); };
  document.getElementById('today-btn').onclick = () => { currentAnchor = new Date(); loadWeek(); };
  document.getElementById('add-session-btn').onclick = () => openAddSession();

  loadWeek();
}

async function loadWeek() {
  const dates = getWeekDates(currentAnchor);
  const from = isoDate(dates[0]);
  const to = isoDate(dates[6]);
  document.getElementById('cal-title').textContent =
    `${dates[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${dates[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  try {
    sessions = await get(`/api/sessions?from=${from}&to=${to}`);
    renderWeekGrid(dates);
  } catch(e) { toast(e.message,'error'); }
}

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HOURS = Array.from({length:16},(_,i)=>i+6); // 6am-9pm

function renderWeekGrid(dates) {
  const today = isoDate(new Date());
  const grid = document.getElementById('week-grid');
  grid.className = 'week-grid';

  // Header row
  let html = `<div class="week-time-col week-day-header"></div>`;
  dates.forEach((d,i) => {
    const isToday = isoDate(d) === today;
    html += `<div class="week-day-header ${isToday?'today':''}">
      <div>${DAY_NAMES[i]}</div>
      <div class="week-day-date">${d.getDate()}</div>
    </div>`;
  });

  // Time rows
  HOURS.forEach(h => {
    const hStr = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
    html += `<div class="week-time-col"><div class="week-time">${hStr}</div></div>`;
    dates.forEach(d => {
      html += `<div class="week-hour-line" data-date="${isoDate(d)}" data-hour="${h}"></div>`;
    });
  });

  grid.innerHTML = html;
  grid.style.gridTemplateRows = `auto repeat(${HOURS.length}, 60px)`;
  grid.style.gridTemplateColumns = `60px repeat(7, 1fr)`;

  // Overlay events
  sessions.forEach(s => {
    if (s.status === 'cancelled') return;
    const sDate = isoDate(new Date(s.starts_at));
    const dayIdx = dates.findIndex(d => isoDate(d) === sDate);
    if (dayIdx === -1) return;

    const start = new Date(s.starts_at);
    const end = new Date(s.ends_at);
    const startH = start.getHours() + start.getMinutes()/60;
    const endH = end.getHours() + end.getMinutes()/60;
    const topOffset = Math.max(0, (startH - HOURS[0]) * 60);
    const height = Math.max(30, (endH - startH) * 60 - 2);

    const col = grid.children[1 + dayIdx]; // +1 for time col
    const evDiv = document.createElement('button');
    evDiv.className = 'cal-event';
    evDiv.style.cssText = `top:${topOffset + 32}px;height:${height}px;background:${s.color||'#185FA5'};color:#fff;position:absolute;left:2px;right:2px`;
    const booked = s.booked_count || 0;
    evDiv.innerHTML = `
      <div class="ev-name">${s.name}</div>
      <div class="ev-time">${fmtTime(s.starts_at)}</div>
      <div class="ev-spots">${booked}/${s.capacity}</div>`;
    evDiv.onclick = () => openSessionDetail(s);
    grid.appendChild(evDiv);
    // Position absolutely over the grid column
    evDiv.style.position = 'fixed'; // temp
    setTimeout(() => {
      const cell = grid.querySelector(`[data-date="${sDate}"][data-hour="${HOURS[0]}"]`);
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const colWidth = rect.width;
      const colX = rect.left - gridRect.left;
      evDiv.style.cssText = `top:${topOffset + 32}px;height:${height}px;background:${s.color||'#185FA5'};color:#fff;left:${colX + 2}px;width:${colWidth-4}px;position:absolute`;
      evDiv.style.removeProperty('position');
    }, 0);
  });

  grid.style.position = 'relative';

  // Re-place events properly using absolute positioning relative to grid
  setTimeout(() => positionEvents(dates), 10);
}

function positionEvents(dates) {
  const grid = document.getElementById('week-grid');
  if (!grid) return;
  // Remove existing event overlays
  grid.querySelectorAll('.cal-event').forEach(e => e.remove());

  sessions.forEach(s => {
    if (s.status === 'cancelled') return;
    const sDate = isoDate(new Date(s.starts_at));
    const dayIdx = dates.findIndex(d => isoDate(d) === sDate);
    if (dayIdx < 0) return;

    const start = new Date(s.starts_at);
    const end = new Date(s.ends_at);
    const startH = start.getUTCHours() + start.getUTCMinutes()/60;
    const endH = end.getUTCHours() + end.getUTCMinutes()/60;

    // Find the cell for this day at the first hour
    const sampleCell = grid.querySelector(`[data-date="${sDate}"][data-hour="${HOURS[0]}"]`);
    if (!sampleCell) return;

    const gridRect = grid.getBoundingClientRect();
    const cellRect = sampleCell.getBoundingClientRect();
    const colX = cellRect.left - gridRect.left;
    const colW = cellRect.width;
    // Use the actual measured top of the first hour cell instead of a hardcoded header height
    const headerH = cellRect.top - gridRect.top;

    // Offset from the top of the first hour cell, then add per-hour pixels
    const topInGrid = headerH + (startH - HOURS[0]) * 60;
    const height = Math.max(22, (endH - startH) * 60 - 3);

    const ev = document.createElement('button');
    ev.className = 'cal-event';
    ev.style.cssText = `top:${topInGrid}px;height:${height}px;background:${s.color||'#185FA5'};color:#fff;left:${colX+2}px;width:${colW-4}px;position:absolute`;
    const booked = s.booked_count || 0;
    ev.innerHTML = `
      <div class="ev-name">${s.name}</div>
      <div class="ev-time">${fmtTime(s.starts_at)}</div>
      ${height > 40 ? `<div class="ev-spots">${booked}/${s.capacity}</div>` : ''}`;
    ev.onclick = () => openSessionDetail(s);
    grid.appendChild(ev);
  });
}

async function openSessionDetail(s) {
  let bookings = [];
  try {
    const data = await get(`/api/sessions/${s.id}`);
    bookings = data.bookings || [];
  } catch(e) {}

  const confirmed = bookings.filter(b => b.status === 'confirmed' && !b.waitlisted);
  const waitlisted = bookings.filter(b => b.waitlisted && b.status === 'confirmed');

  const body = `
    <div class="flex items-center gap-8 mb-16">
      <div style="width:10px;height:40px;border-radius:4px;background:${s.color||'var(--brand)'}"></div>
      <div>
        <div class="font-600" style="font-size:16px">${s.name}</div>
        <div class="text-sm text-muted">${fmtDate(s.starts_at,{weekday:'long',month:'long',day:'numeric'})} · ${fmtTime(s.starts_at)} – ${fmtTime(s.ends_at)}</div>
        ${s.instructor_name ? `<div class="text-sm text-muted">with ${s.instructor_name}</div>` : ''}
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="stat-card card-sm"><div class="stat-label">Booked</div><div class="stat-value" style="font-size:20px">${confirmed.length}</div><div class="stat-sub">of ${s.capacity} spots</div></div>
      <div class="stat-card card-sm"><div class="stat-label">Waitlist</div><div class="stat-value" style="font-size:20px">${waitlisted.length}</div></div>
      <div class="stat-card card-sm"><div class="stat-label">Checked in</div><div class="stat-value" style="font-size:20px">${bookings.filter(b=>b.checked_in).length}</div></div>
    </div>
    <hr class="divider">
    <div class="font-500 mb-8" style="font-size:13px">Attendees (${confirmed.length})</div>
    ${confirmed.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Membership</th><th>Check-in</th></tr></thead><tbody>
      ${confirmed.map(b=>`<tr>
        <td>${b.member_name}<br><span class="text-xs text-muted">${b.member_email}</span></td>
        <td><span class="badge badge-gray">${b.membership_type||'—'}</span></td>
        <td>${b.checked_in ? `<span class="badge badge-green">Checked in</span>` :
          `<button class="btn btn-success btn-sm" onclick="window.__checkin('${b.id}')">Check in</button>`}</td>
      </tr>`).join('')}
    </tbody></table></div>` : `<div class="text-sm text-muted">No bookings yet</div>`}
    ${waitlisted.length ? `<div class="font-500 mb-8 mt-16" style="font-size:13px">Waitlist (${waitlisted.length})</div>
    <div style="font-size:13px;color:var(--text-2)">${waitlisted.map(b=>`#${b.waitlist_position} ${b.member_name}`).join(', ')}</div>` : ''}`;

  modal(s.name, body, `
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    <button class="btn btn-danger" onclick="window.__cancelSession('${s.id}')">Cancel class</button>
  `, true);

  window.__checkin = async (bookingId) => {
    try {
      await post(`/api/bookings/${bookingId}/checkin`);
      toast('Checked in!', 'success');
      closeModal();
      openSessionDetail(s);
    } catch(e) { toast(e.message,'error'); }
  };
  window.__cancelSession = async (sessionId) => {
    const reason = prompt('Reason for cancellation (optional):');
    if (reason === null) return;
    try {
      await del(`/api/sessions/${sessionId}`, { reason });
      toast('Class cancelled', 'success');
      closeModal();
      loadWeek();
    } catch(e) { toast(e.message,'error'); }
  };
}

async function openAddSession() {
  let instructors = [];
  try { instructors = await get('/api/instructors'); } catch {}

  const body = `
    <div class="form-group"><label>Class name</label><input id="s-name" type="text" placeholder="e.g. Morning Spin"></div>
    <div class="form-group"><label>Description</label><textarea id="s-desc" placeholder="Short description for members..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Instructor</label><select id="s-instructor">
        <option value="">No instructor</option>
        ${instructors.map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Duration (minutes)</label>
        <select id="s-duration"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>60 min</option><option value="75">75 min</option><option value="90">90 min</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Capacity</label><input id="s-cap" type="number" value="20" min="1"></div>
      <div class="form-group"><label>Waitlist limit</label><input id="s-wl" type="number" value="5" min="0"></div>
    </div>
    <div class="form-group"><label>Color</label>
      <div class="color-picker" id="color-picker">
        ${CLASS_COLORS.map((c,i)=>`<div class="color-swatch ${i===0?'selected':''}" style="background:${c}" data-color="${c}" onclick="this.parentNode.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('selected'));this.classList.add('selected')"></div>`).join('')}
      </div>
    </div>
    <hr class="divider">
    <div class="form-group"><label>Recurrence</label>
      <select id="s-recur" onchange="document.getElementById('recur-weekly').style.display=this.value==='weekly'?'block':'none';document.getElementById('recur-onetime').style.display=this.value!=='weekly'?'block':'none'">
        <option value="none">One-time class</option>
        <option value="weekly">Weekly recurring</option>
      </select>
    </div>
    <div id="recur-onetime">
      <div class="form-row">
        <div class="form-group"><label>Date</label><input id="s-date" type="date" value="${isoDate(new Date())}"></div>
        <div class="form-group"><label>Start time</label><input id="s-time" type="time" value="09:00"></div>
      </div>
    </div>
    <div id="recur-weekly" style="display:none">
      <div class="form-group"><label>Days of week</label>
        <div class="day-picker" id="day-picker">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<button type="button" class="day-btn" data-day="${i}" onclick="this.classList.toggle('on')">${d}</button>`).join('')}
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label>Start time</label><input id="s-rtime" type="time" value="09:00"></div>
        <div class="form-group"><label>Series start</label><input id="s-rstart" type="date" value="${isoDate(new Date())}"></div>
        <div class="form-group"><label>Series end</label><input id="s-rend" type="date" value="${isoDate(new Date(Date.now()+90*86400000))}"></div>
      </div>
    </div>
    <div id="form-err" class="form-error" style="display:none"></div>`;

  modal('Add new class', body, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="save-session-btn">Create class</button>`, true);

  document.getElementById('save-session-btn').onclick = saveSession;
}

async function saveSession() {
  const name = document.getElementById('s-name').value.trim();
  if (!name) { showErr('Class name is required'); return; }
  const recur = document.getElementById('s-recur').value;
  const color = document.querySelector('.color-swatch.selected')?.dataset.color || CLASS_COLORS[0];
  const payload = {
    name,
    description: document.getElementById('s-desc').value.trim() || null,
    instructor_id: document.getElementById('s-instructor').value || null,
    duration_minutes: parseInt(document.getElementById('s-duration').value),
    capacity: parseInt(document.getElementById('s-cap').value),
    waitlist_limit: parseInt(document.getElementById('s-wl').value),
    color,
    recurrence: recur
  };

  if (recur === 'none') {
    payload.series_start = document.getElementById('s-date').value;
    payload.start_time = document.getElementById('s-time').value;
  } else {
    const days = [...document.querySelectorAll('.day-btn.on')].map(b=>b.dataset.day);
    if (!days.length) { showErr('Select at least one day'); return; }
    payload.days_of_week = days;
    payload.start_time = document.getElementById('s-rtime').value;
    payload.series_start = document.getElementById('s-rstart').value;
    payload.series_end = document.getElementById('s-rend').value;
  }

  const btn = document.getElementById('save-session-btn');
  btn.disabled = true; btn.textContent = 'Creating...';
  try {
    const result = await post('/api/classes', payload);
    toast(`Created! ${result.sessionsCreated} session${result.sessionsCreated!==1?'s':''} scheduled.`, 'success');
    closeModal();
    loadWeek();
  } catch(e) { showErr(e.message); btn.disabled=false; btn.textContent='Create class'; }
}

function showErr(msg) {
  const el = document.getElementById('form-err');
  if (el) { el.textContent=msg; el.style.display='block'; }
}
