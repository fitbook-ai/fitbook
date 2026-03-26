import { get, run, all } from '../lib/db.js';
import { authMiddleware } from '../lib/auth.js';

export function handleDashboard(req, res, path) {
  if (path === '/api/dashboard' && req.method === 'GET') return getDashboard(req, res);
  if (path === '/api/studio' && req.method === 'GET') return getStudio(req, res);
  if (path === '/api/studio' && req.method === 'PUT') return updateStudio(req, res);
  return false;
}

function send(res, status, data) { res.statusCode = status; res.end(JSON.stringify(data)); }

async function getDashboard(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const sid = auth.studioId;
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];

  const totalMembers = get('SELECT COUNT(*) as c FROM members WHERE studio_id=? AND active=1', [sid]).c;
  const newMembersMonth = get(`SELECT COUNT(*) as c FROM members WHERE studio_id=? AND created_at>=?`, [sid, monthAgo]).c;
  const totalBookingsWeek = get(`SELECT COUNT(*) as c FROM bookings b JOIN class_sessions s ON s.id=b.session_id
    WHERE b.studio_id=? AND b.status='confirmed' AND s.starts_at>=?`, [sid, weekAgo+'T00:00:00']).c;

  const todaysSessions = all(`SELECT s.*, i.name as instructor_name,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed' AND b.waitlisted=0) as booked_count,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.waitlisted=1) as waitlist_count
    FROM class_sessions s LEFT JOIN instructors i ON i.id=s.instructor_id
    WHERE s.studio_id=? AND DATE(s.starts_at)=? AND s.status='scheduled'
    ORDER BY s.starts_at`, [sid, today]);

  const upcomingWeek = all(`SELECT s.*, i.name as instructor_name,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed' AND b.waitlisted=0) as booked_count
    FROM class_sessions s LEFT JOIN instructors i ON i.id=s.instructor_id
    WHERE s.studio_id=? AND s.starts_at>datetime('now') AND s.starts_at<=? AND s.status='scheduled'
    ORDER BY s.starts_at LIMIT 10`, [sid, new Date(Date.now()+7*86400000).toISOString()]);

  const recentMembers = all(`SELECT id, name, email, membership_type, created_at FROM members
    WHERE studio_id=? AND active=1 ORDER BY created_at DESC LIMIT 5`, [sid]);

  const membersByType = all(`SELECT membership_type, COUNT(*) as count FROM members
    WHERE studio_id=? AND active=1 GROUP BY membership_type`, [sid]);

  const fillRates = all(`SELECT DATE(starts_at) as date, 
    AVG(CAST((SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed' AND b.waitlisted=0) AS FLOAT) / s.capacity * 100) as avg_fill
    FROM class_sessions s WHERE s.studio_id=? AND s.starts_at>=? AND s.status='scheduled'
    GROUP BY DATE(starts_at) ORDER BY date`, [sid, weekAgo]);

  send(res, 200, {
    stats: { totalMembers, newMembersMonth, totalBookingsWeek, todayClassCount: todaysSessions.length },
    todaysSessions,
    upcomingWeek,
    recentMembers,
    membersByType,
    fillRates
  });
}

async function getStudio(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const studio = get('SELECT id,name,slug,email,phone,address,timezone,booking_window_days,cancel_cutoff_hours,late_cancel_penalty,logo_url,primary_color FROM studios WHERE id=?', [auth.studioId]);
  const instructorCount = get('SELECT COUNT(*) as c FROM instructors WHERE studio_id=? AND active=1', [auth.studioId]).c;
  const memberCount = get('SELECT COUNT(*) as c FROM members WHERE studio_id=? AND active=1', [auth.studioId]).c;
  send(res, 200, { ...studio, instructorCount, memberCount });
}

async function updateStudio(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const { name, phone, address, timezone, booking_window_days, cancel_cutoff_hours, late_cancel_penalty, primary_color } = req.body;
  run(`UPDATE studios SET name=?, phone=?, address=?, timezone=?, booking_window_days=?, 
    cancel_cutoff_hours=?, late_cancel_penalty=?, primary_color=? WHERE id=?`,
    [name, phone||null, address||null, timezone||'America/New_York',
     booking_window_days||7, cancel_cutoff_hours||1, late_cancel_penalty||1,
     primary_color||'#185FA5', auth.studioId]);
  send(res, 200, get('SELECT * FROM studios WHERE id=?', [auth.studioId]));
}
