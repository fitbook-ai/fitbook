import { get, run, all, uuid } from '../lib/db.js';
import { authMiddleware } from '../lib/auth.js';

export function handleClasses(req, res, path) {
  if (path === '/api/classes' && req.method === 'GET') return getTemplates(req, res);
  if (path === '/api/classes' && req.method === 'POST') return createTemplate(req, res);
  if (path.match(/^\/api\/classes\/[\w-]+$/) && req.method === 'GET') return getTemplate(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/classes\/[\w-]+$/) && req.method === 'PUT') return updateTemplate(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/classes\/[\w-]+$/) && req.method === 'DELETE') return deleteTemplate(req, res, path.split('/')[3]);
  if (path === '/api/sessions' && req.method === 'GET') return getSessions(req, res);
  if (path.match(/^\/api\/sessions\/[\w-]+$/) && req.method === 'GET') return getSession(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/sessions\/[\w-]+$/) && req.method === 'PUT') return updateSession(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/sessions\/[\w-]+$/) && req.method === 'DELETE') return cancelSession(req, res, path.split('/')[3]);
  if (path === '/api/instructors' && req.method === 'GET') return getInstructors(req, res);
  if (path === '/api/instructors' && req.method === 'POST') return createInstructor(req, res);
  if (path.match(/^\/api\/instructors\/[\w-]+$/) && req.method === 'DELETE') return deleteInstructor(req, res, path.split('/')[3]);
  return false;
}

function send(res, status, data) { res.statusCode = status; res.end(JSON.stringify(data)); }

async function getTemplates(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const templates = all(`SELECT t.*, i.name as instructor_name FROM class_templates t
    LEFT JOIN instructors i ON i.id = t.instructor_id
    WHERE t.studio_id = ? AND t.active = 1 ORDER BY t.name`, [auth.studioId]);
  send(res, 200, templates);
}

async function createTemplate(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const { name, description, duration_minutes, capacity, waitlist_limit, color,
    instructor_id, recurrence, start_time, series_start, series_end, days_of_week,
    booking_window_days, cancel_cutoff_hours, late_cancel_penalty } = req.body;
  if (!name) return send(res, 400, { error: 'Class name required' });

  const templateId = uuid();
  run(`INSERT INTO class_templates (id, studio_id, name, description, duration_minutes, capacity, 
    waitlist_limit, color, instructor_id, booking_window_days, cancel_cutoff_hours, late_cancel_penalty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [templateId, auth.studioId, name, description||null, duration_minutes||60, capacity||20,
     waitlist_limit||5, color||'#185FA5', instructor_id||null,
     booking_window_days||null, cancel_cutoff_hours||null, late_cancel_penalty||null]);

  // Generate sessions from recurrence
  let sessions = [];
  if (recurrence === 'none' || !recurrence) {
    if (series_start && start_time) {
      sessions = [generateSession(templateId, auth.studioId, { name, description, duration_minutes: duration_minutes||60,
        capacity: capacity||20, waitlist_limit: waitlist_limit||5, color: color||'#185FA5',
        instructor_id: instructor_id||null }, series_start, start_time)];
    }
  } else if (recurrence === 'weekly' && series_start && series_end && start_time) {
    const days = Array.isArray(days_of_week) ? days_of_week : (days_of_week ? [days_of_week] : []);
    sessions = generateRecurringSessions(templateId, auth.studioId,
      { name, description, duration_minutes: duration_minutes||60, capacity: capacity||20,
        waitlist_limit: waitlist_limit||5, color: color||'#185FA5', instructor_id: instructor_id||null },
      series_start, series_end, start_time, days);
  }

  for (const s of sessions) {
    run(`INSERT INTO class_sessions (id, studio_id, template_id, instructor_id, name, description,
      starts_at, ends_at, capacity, waitlist_limit, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.studio_id, s.template_id, s.instructor_id, s.name, s.description,
       s.starts_at, s.ends_at, s.capacity, s.waitlist_limit, s.color]);
  }

  const template = get('SELECT * FROM class_templates WHERE id = ?', [templateId]);
  send(res, 201, { template, sessionsCreated: sessions.length });
}

function generateSession(templateId, studioId, tmpl, date, time) {
  const starts = new Date(`${date}T${time}:00`);
  const ends = new Date(starts.getTime() + (tmpl.duration_minutes||60) * 60000);
  return { id: uuid(), studio_id: studioId, template_id: templateId,
    instructor_id: tmpl.instructor_id, name: tmpl.name, description: tmpl.description,
    starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    capacity: tmpl.capacity, waitlist_limit: tmpl.waitlist_limit, color: tmpl.color };
}

function generateRecurringSessions(templateId, studioId, tmpl, seriesStart, seriesEnd, time, dayNumbers) {
  const sessions = [];
  const start = new Date(`${seriesStart}T00:00:00`);
  const end = new Date(`${seriesEnd}T23:59:59`);
  const current = new Date(start);
  const days = dayNumbers.map(Number);
  while (current <= end) {
    if (days.includes(current.getDay())) {
      const dateStr = current.toISOString().split('T')[0];
      sessions.push(generateSession(templateId, studioId, tmpl, dateStr, time));
    }
    current.setDate(current.getDate() + 1);
  }
  return sessions;
}

async function getTemplate(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const t = get('SELECT * FROM class_templates WHERE id = ? AND studio_id = ?', [id, auth.studioId]);
  if (!t) return send(res, 404, { error: 'Not found' });
  send(res, 200, t);
}

async function updateTemplate(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const t = get('SELECT id FROM class_templates WHERE id = ? AND studio_id = ?', [id, auth.studioId]);
  if (!t) return send(res, 404, { error: 'Not found' });
  const { name, description, duration_minutes, capacity, waitlist_limit, color, instructor_id } = req.body;
  run(`UPDATE class_templates SET name=?, description=?, duration_minutes=?, capacity=?,
    waitlist_limit=?, color=?, instructor_id=? WHERE id=?`,
    [name, description||null, duration_minutes||60, capacity||20, waitlist_limit||5,
     color||'#185FA5', instructor_id||null, id]);
  send(res, 200, get('SELECT * FROM class_templates WHERE id = ?', [id]));
}

async function deleteTemplate(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  run('UPDATE class_templates SET active=0 WHERE id=? AND studio_id=?', [id, auth.studioId]);
  send(res, 200, { ok: true });
}

async function getSessions(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const url = new URL(req.url, 'http://localhost');
  const from = url.searchParams.get('from') || new Date().toISOString().split('T')[0];
  const to = url.searchParams.get('to') || new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
  const sessions = all(`SELECT s.*, i.name as instructor_name, i.color as instructor_color,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed' AND b.waitlisted=0) as booked_count,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.waitlisted=1) as waitlist_count
    FROM class_sessions s LEFT JOIN instructors i ON i.id=s.instructor_id
    WHERE s.studio_id=? AND s.starts_at>=? AND s.starts_at<=? AND s.status!='deleted'
    ORDER BY s.starts_at`,
    [auth.studioId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z']);
  send(res, 200, sessions);
}

async function getSession(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const session = get(`SELECT s.*, i.name as instructor_name FROM class_sessions s
    LEFT JOIN instructors i ON i.id=s.instructor_id WHERE s.id=? AND s.studio_id=?`, [id, auth.studioId]);
  if (!session) return send(res, 404, { error: 'Not found' });
  const bookings = all(`SELECT b.*, m.name as member_name, m.email as member_email
    FROM bookings b JOIN members m ON m.id=b.member_id
    WHERE b.session_id=? ORDER BY b.booked_at`, [id]);
  send(res, 200, { ...session, bookings });
}

async function updateSession(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const session = get('SELECT id FROM class_sessions WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!session) return send(res, 404, { error: 'Not found' });
  const { name, description, starts_at, ends_at, capacity, instructor_id } = req.body;
  run(`UPDATE class_sessions SET name=?, description=?, starts_at=?, ends_at=?, capacity=?, instructor_id=? WHERE id=?`,
    [name, description||null, starts_at, ends_at, capacity, instructor_id||null, id]);
  send(res, 200, get('SELECT * FROM class_sessions WHERE id=?', [id]));
}

async function cancelSession(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const session = get('SELECT * FROM class_sessions WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!session) return send(res, 404, { error: 'Not found' });
  const { reason } = req.body || {};
  run(`UPDATE class_sessions SET status='cancelled', cancel_reason=? WHERE id=?`, [reason||null, id]);
  // Refund credits to all confirmed bookings
  const bookings = all('SELECT b.*, m.membership_type FROM bookings b JOIN members m ON m.id=b.member_id WHERE b.session_id=? AND b.status=\'confirmed\'', [id]);
  for (const b of bookings) {
    run('UPDATE bookings SET status=\'cancelled\', cancelled_at=datetime(\'now\') WHERE id=?', [b.id]);
    if (b.credit_deducted) {
      run('UPDATE members SET credits=credits+1 WHERE id=?', [b.member_id]);
    }
  }
  send(res, 200, { ok: true, affectedBookings: bookings.length });
}

async function getInstructors(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  send(res, 200, all('SELECT * FROM instructors WHERE studio_id=? AND active=1 ORDER BY name', [auth.studioId]));
}

async function createInstructor(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const { name, email, bio, color } = req.body;
  if (!name) return send(res, 400, { error: 'Name required' });
  const id = uuid();
  run('INSERT INTO instructors (id, studio_id, name, email, bio, color) VALUES (?, ?, ?, ?, ?, ?)',
    [id, auth.studioId, name, email||null, bio||null, color||'#185FA5']);
  send(res, 201, get('SELECT * FROM instructors WHERE id=?', [id]));
}

async function deleteInstructor(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  run('UPDATE instructors SET active=0 WHERE id=? AND studio_id=?', [id, auth.studioId]);
  send(res, 200, { ok: true });
}
