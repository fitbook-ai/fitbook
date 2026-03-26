import { get, put, post, del, toast, modal, closeModal } from '../api.js';

export async function renderSettings(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Settings</div><div class="page-sub">Studio configuration</div></div>
    </div>
    <div class="page-body" id="settings-body">
      <div class="loading">Loading...</div>
    </div>`;
  loadSettings();
}

async function loadSettings() {
  try {
    const [studio, instructors] = await Promise.all([
      get('/api/studio'),
      get('/api/instructors')
    ]);
    renderAll(studio, instructors);
  } catch(e) { toast(e.message,'error'); }
}

function renderAll(studio, instructors) {
  const body = document.getElementById('settings-body');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div class="card mb-20">
          <div class="card-header"><span class="card-title">Studio info</span></div>
          <div class="form-group"><label>Studio name</label><input id="st-name" value="${studio.name}"></div>
          <div class="form-group"><label>Email</label><input id="st-email" type="email" value="${studio.email||''}"></div>
          <div class="form-group"><label>Phone</label><input id="st-phone" value="${studio.phone||''}"></div>
          <div class="form-group"><label>Address</label><input id="st-addr" value="${studio.address||''}"></div>
          <div class="form-group"><label>Brand color</label><input id="st-color" type="color" value="${studio.primary_color||'#185FA5'}" style="height:36px;padding:2px 4px;width:80px"></div>
          <button class="btn btn-primary" onclick="window.__saveStudio()">Save studio info</button>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Booking rules</span></div>
          <div class="form-group"><label>Booking opens (days before class)</label>
            <select id="st-window">
              <option value="1" ${studio.booking_window_days==1?'selected':''}>1 day before</option>
              <option value="3" ${studio.booking_window_days==3?'selected':''}>3 days before</option>
              <option value="7" ${studio.booking_window_days==7?'selected':''}>7 days before</option>
              <option value="14" ${studio.booking_window_days==14?'selected':''}>14 days before</option>
              <option value="30" ${studio.booking_window_days==30?'selected':''}>30 days before</option>
            </select>
          </div>
          <div class="form-group"><label>Booking closes (hours before class)</label>
            <select id="st-cutoff">
              <option value="0" ${studio.cancel_cutoff_hours==0?'selected':''}>At class start time</option>
              <option value="1" ${studio.cancel_cutoff_hours==1?'selected':''}>1 hour before</option>
              <option value="2" ${studio.cancel_cutoff_hours==2?'selected':''}>2 hours before</option>
              <option value="12" ${studio.cancel_cutoff_hours==12?'selected':''}>12 hours before</option>
              <option value="24" ${studio.cancel_cutoff_hours==24?'selected':''}>24 hours before</option>
            </select>
          </div>
          <div class="form-group"><label>Late cancellation penalty</label>
            <select id="st-penalty">
              <option value="0" ${!studio.late_cancel_penalty?'selected':''}>No penalty</option>
              <option value="1" ${studio.late_cancel_penalty?'selected':''}>Lose 1 class credit</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="window.__saveStudio()">Save rules</button>
        </div>
      </div>

      <div>
        <div class="card mb-20">
          <div class="card-header">
            <span class="card-title">Instructors (${instructors.length})</span>
            <button class="btn btn-secondary btn-sm" onclick="window.__addInstructor()">+ Add</button>
          </div>
          <div id="instructor-list">
            ${instructors.length ? instructors.map(i=>`
              <div class="flex items-center justify-between py-2" style="border-bottom:0.5px solid var(--border)">
                <div class="flex items-center gap-8">
                  <div style="width:8px;height:8px;border-radius:50%;background:${i.color||'var(--brand)'}"></div>
                  <div><div class="font-500 text-sm">${i.name}</div>${i.email?`<div class="text-xs text-muted">${i.email}</div>`:''}</div>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="window.__removeInstructor('${i.id}','${i.name}')">Remove</button>
              </div>`).join('') : `<div class="text-sm text-muted">No instructors added yet</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Your booking page</span></div>
          <div class="text-sm text-muted mb-8">Share this link with your members:</div>
          <div style="background:var(--bg-2);border-radius:var(--radius);padding:10px 12px;font-size:13px;font-family:monospace;word-break:break-all" id="booking-url">
            ${window.location.origin}/book/${studio.slug}
          </div>
          <button class="btn btn-secondary btn-sm mt-12" onclick="navigator.clipboard.writeText(document.getElementById('booking-url').textContent.trim());window.toast_('Copied!','success')">Copy link</button>
          <a href="/book/${studio.slug}" target="_blank" class="btn btn-ghost btn-sm mt-12">Open booking page ↗</a>
        </div>
      </div>
    </div>`;

  window.__saveStudio = async () => {
    try {
      await put('/api/studio', {
        name: document.getElementById('st-name').value,
        phone: document.getElementById('st-phone').value||null,
        address: document.getElementById('st-addr').value||null,
        booking_window_days: parseInt(document.getElementById('st-window').value),
        cancel_cutoff_hours: parseInt(document.getElementById('st-cutoff').value),
        late_cancel_penalty: parseInt(document.getElementById('st-penalty').value),
        primary_color: document.getElementById('st-color').value
      });
      toast('Settings saved!','success');
    } catch(e) { toast(e.message,'error'); }
  };

  window.__addInstructor = () => {
    modal('Add instructor', `
      <div class="form-group"><label>Name *</label><input id="i-name" placeholder="Instructor name"></div>
      <div class="form-group"><label>Email</label><input id="i-email" type="email" placeholder="instructor@email.com"></div>
      <div class="form-group"><label>Bio</label><textarea id="i-bio" placeholder="Short bio shown to members..."></textarea></div>
      <div class="form-group"><label>Color</label><input id="i-color" type="color" value="#185FA5" style="height:36px;padding:2px 4px;width:80px"></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.__saveInstructor()">Add</button>`);
    window.__saveInstructor = async () => {
      const name = document.getElementById('i-name').value.trim();
      if (!name) return;
      try {
        await post('/api/instructors', { name, email: document.getElementById('i-email').value||null, bio: document.getElementById('i-bio').value||null, color: document.getElementById('i-color').value });
        toast(`${name} added!`,'success');
        closeModal();
        loadSettings();
      } catch(e) { toast(e.message,'error'); }
    };
  };

  window.__removeInstructor = async (id, name) => {
    if (!confirm(`Remove ${name}?`)) return;
    try { await del(`/api/instructors/${id}`); toast(`${name} removed`,'success'); loadSettings(); }
    catch(e) { toast(e.message,'error'); }
  };

  window.toast_ = toast;
}
