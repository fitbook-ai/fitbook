import { get, post, put, del, toast, modal, closeModal, fmtDate, membershipBadge, membershipLabel, debounce } from '../api.js';

export async function renderMembers(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Members</div><div class="page-sub">Manage your studio's members</div></div>
      <button class="btn btn-primary" id="add-member-btn">+ Add member</button>
    </div>
    <div class="page-body">
      <div class="search-bar">
        <input type="text" id="member-search" placeholder="Search by name or email..." style="max-width:320px">
      </div>
      <div id="members-table" class="table-wrap">
        <div class="loading">Loading members...</div>
      </div>
    </div>`;

  document.getElementById('add-member-btn').onclick = openAddMember;
  document.getElementById('member-search').oninput = debounce(e => loadMembers(e.target.value), 300);
  loadMembers();
}

async function loadMembers(search = '') {
  const el = document.getElementById('members-table');
  if (!el) return;
  try {
    const members = await get(`/api/members${search ? `?q=${encodeURIComponent(search)}` : ''}`);
    if (!members.length) {
      el.innerHTML = `<div class="empty-state"><div class="es-icon">👥</div><div class="es-title">No members yet</div><div class="es-sub">Add your first member to get started</div></div>`;
      return;
    }
    el.innerHTML = `<table>
      <thead><tr><th>Name</th><th>Email</th><th>Membership</th><th>Credits</th><th>Bookings</th><th>Joined</th><th></th></tr></thead>
      <tbody>
        ${members.map(m => `<tr style="cursor:pointer" onclick="window.__viewMember('${m.id}')">
          <td><span class="font-500">${m.name}</span></td>
          <td class="text-sm text-muted">${m.email}</td>
          <td>${membershipBadge(m.membership_type)}</td>
          <td class="text-sm">${m.membership_type==='pack' ? `<strong>${m.credits}</strong> credits` : '—'}</td>
          <td class="text-sm text-muted">${m.booking_count||0}</td>
          <td class="text-sm text-muted">${fmtDate(m.created_at)}</td>
          <td onclick="event.stopPropagation()" class="td-action">
            <button class="btn btn-ghost btn-sm" onclick="window.__viewMember('${m.id}')">View</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch(e) { toast(e.message,'error'); }
}

async function openAddMember() {
  modal('Add new member', `
    <div class="form-row">
      <div class="form-group"><label>Full name *</label><input id="m-name" type="text" placeholder="Jane Smith"></div>
      <div class="form-group"><label>Email *</label><input id="m-email" type="email" placeholder="jane@example.com"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Phone</label><input id="m-phone" type="tel" placeholder="Optional"></div>
      <div class="form-group"><label>Password (optional)</label><input id="m-pass" type="password" placeholder="For member self-login"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Membership type</label>
        <select id="m-type">
          <option value="none">No membership</option>
          <option value="unlimited">Unlimited monthly</option>
          <option value="pack">Class pack</option>
          <option value="dropin">Drop-in</option>
          <option value="trial">Trial</option>
        </select>
      </div>
      <div class="form-group"><label>Starting credits (pack)</label><input id="m-credits" type="number" value="0" min="0"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="m-notes" placeholder="Internal notes..."></textarea></div>
    <div id="m-err" class="form-error" style="display:none"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" id="save-member-btn">Add member</button>`);

  document.getElementById('save-member-btn').onclick = saveMember;
}

async function saveMember() {
  const name = document.getElementById('m-name').value.trim();
  const email = document.getElementById('m-email').value.trim();
  if (!name || !email) { showErr('Name and email are required'); return; }
  const btn = document.getElementById('save-member-btn');
  btn.disabled = true; btn.textContent = 'Adding...';
  try {
    await post('/api/members', {
      name, email,
      phone: document.getElementById('m-phone').value || null,
      password: document.getElementById('m-pass').value || null,
      membership_type: document.getElementById('m-type').value,
      credits: parseInt(document.getElementById('m-credits').value) || 0,
      notes: document.getElementById('m-notes').value || null
    });
    toast(`${name} added!`, 'success');
    closeModal();
    loadMembers();
  } catch(e) { showErr(e.message); btn.disabled=false; btn.textContent='Add member'; }
}

window.__viewMember = async function(id) {
  try {
    const m = await get(`/api/members/${id}`);
    openMemberDetail(m);
  } catch(e) { toast(e.message,'error'); }
};

function openMemberDetail(m) {
  const upcomingBookings = (m.bookings||[]).filter(b=>b.status==='confirmed'&&new Date(b.starts_at)>new Date());
  const pastBookings = (m.bookings||[]).filter(b=>new Date(b.starts_at)<=new Date()).slice(0,5);

  const body = `
    <div class="flex items-center gap-12 mb-20">
      <div style="width:48px;height:48px;border-radius:50%;background:var(--brand-light);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;color:var(--brand-dark)">${m.name.charAt(0).toUpperCase()}</div>
      <div>
        <div class="font-600" style="font-size:17px">${m.name}</div>
        <div class="text-sm text-muted">${m.email}${m.phone?` · ${m.phone}`:''}</div>
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="stat-card card-sm"><div class="stat-label">Membership</div><div class="mt-4">${membershipBadge(m.membership_type)}</div></div>
      <div class="stat-card card-sm"><div class="stat-label">Credits</div><div class="stat-value" style="font-size:22px">${m.credits||0}</div></div>
      <div class="stat-card card-sm"><div class="stat-label">Total bookings</div><div class="stat-value" style="font-size:22px">${(m.bookings||[]).length}</div></div>
    </div>
    <hr class="divider">
    <div class="flex justify-between items-center mb-8">
      <span class="font-500 text-sm">Membership</span>
      <button class="btn btn-secondary btn-sm" onclick="window.__editMembership('${m.id}','${m.membership_type}',${m.credits})">Edit</button>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Type</label><input readonly value="${membershipLabel(m.membership_type)}" style="background:var(--bg-2)"></div>
      <div class="form-group"><label>Credits remaining</label><input readonly value="${m.credits||0}" style="background:var(--bg-2)"></div>
    </div>
    ${m.membership_type==='pack'?`<div class="flex gap-8">
      <button class="btn btn-ghost btn-sm" onclick="window.__adjustCredits('${m.id}',5)">+ Add 5 credits</button>
      <button class="btn btn-ghost btn-sm" onclick="window.__adjustCredits('${m.id}',10)">+ Add 10 credits</button>
    </div>`:''}
    ${upcomingBookings.length ? `<hr class="divider"><div class="font-500 text-sm mb-8">Upcoming (${upcomingBookings.length})</div>
      <div>${upcomingBookings.slice(0,3).map(b=>`<div class="flex justify-between text-sm py-2" style="border-bottom:0.5px solid var(--border)">
        <span>${b.session_name}</span><span class="text-muted">${fmtDate(b.starts_at,{month:'short',day:'numeric'})}</span>
      </div>`).join('')}</div>` : ''}
    ${m.notes ? `<hr class="divider"><div class="text-sm text-muted"><strong>Notes:</strong> ${m.notes}</div>` : ''}`;

  modal(m.name, body, `
    <button class="btn btn-ghost btn-sm btn-danger" onclick="window.__deleteMember('${m.id}','${m.name}')">Deactivate</button>
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    <button class="btn btn-primary" onclick="window.__editMember('${m.id}')">Edit info</button>`, true);

  window.__editMembership = (id, type, credits) => {
    modal('Update membership', `
      <div class="form-group"><label>Membership type</label>
        <select id="em-type">
          <option value="none" ${type==='none'?'selected':''}>No membership</option>
          <option value="unlimited" ${type==='unlimited'?'selected':''}>Unlimited monthly</option>
          <option value="pack" ${type==='pack'?'selected':''}>Class pack</option>
          <option value="dropin" ${type==='dropin'?'selected':''}>Drop-in</option>
          <option value="trial" ${type==='trial'?'selected':''}>Trial</option>
        </select>
      </div>
      <div class="form-group"><label>Credits (for class packs)</label><input id="em-credits" type="number" value="${credits}" min="0"></div>
      <div class="form-group"><label>Expires (optional)</label><input id="em-exp" type="date"></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.__saveMembership('${id}')">Save</button>`);
    window.__saveMembership = async (memberId) => {
      try {
        await put(`/api/members/${memberId}/membership`, {
          membership_type: document.getElementById('em-type').value,
          credits: parseInt(document.getElementById('em-credits').value)||0,
          membership_expires: document.getElementById('em-exp').value||null
        });
        toast('Membership updated!','success');
        closeModal();
        window.__viewMember(memberId);
      } catch(e) { toast(e.message,'error'); }
    };
  };

  window.__adjustCredits = async (id, delta) => {
    try {
      await post(`/api/members/${id}/credits`, { delta, reason: `Manual: +${delta} credits` });
      toast(`Added ${delta} credits!`, 'success');
      closeModal();
      window.__viewMember(id);
    } catch(e) { toast(e.message,'error'); }
  };

  window.__deleteMember = async (id, name) => {
    if (!confirm(`Deactivate ${name}? They won't be able to log in or book classes.`)) return;
    try { await del(`/api/members/${id}`); toast(`${name} deactivated`,'success'); closeModal(); loadMembers(); }
    catch(e) { toast(e.message,'error'); }
  };

  window.__editMember = (id) => {
    modal('Edit member info', `
      <div class="form-group"><label>Full name</label><input id="em-name" value="${m.name}"></div>
      <div class="form-group"><label>Email</label><input id="em-email" type="email" value="${m.email}"></div>
      <div class="form-group"><label>Phone</label><input id="em-phone" value="${m.phone||''}"></div>
      <div class="form-group"><label>Emergency contact</label><input id="em-ec" value="${m.emergency_contact||''}"></div>
      <div class="form-group"><label>Notes</label><textarea id="em-notes">${m.notes||''}</textarea></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="window.__saveEdit('${id}')">Save</button>`);
    window.__saveEdit = async (memberId) => {
      try {
        await put(`/api/members/${memberId}`, {
          name: document.getElementById('em-name').value,
          email: document.getElementById('em-email').value,
          phone: document.getElementById('em-phone').value||null,
          emergency_contact: document.getElementById('em-ec').value||null,
          notes: document.getElementById('em-notes').value||null
        });
        toast('Saved!','success');
        closeModal();
        window.__viewMember(memberId);
      } catch(e) { toast(e.message,'error'); }
    };
  };
}

function showErr(msg) {
  const el = document.getElementById('m-err');
  if (el) { el.textContent=msg; el.style.display='block'; }
}
