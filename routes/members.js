import { get, run, all, uuid } from '../lib/db.js';
import { authMiddleware } from '../lib/auth.js';
import { hashPassword } from '../lib/auth.js';

export function handleMembers(req, res, path) {
  if (path === '/api/members' && req.method === 'GET') return getMembers(req, res);
  if (path === '/api/members' && req.method === 'POST') return createMember(req, res);
  if (path.match(/^\/api\/members\/[\w-]+$/) && req.method === 'GET') return getMember(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/members\/[\w-]+$/) && req.method === 'PUT') return updateMember(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/members\/[\w-]+$/) && req.method === 'DELETE') return deactivateMember(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/members\/[\w-]+\/membership$/) && req.method === 'PUT') return updateMembership(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/members\/[\w-]+\/credits$/) && req.method === 'POST') return adjustCredits(req, res, path.split('/')[3]);
  if (path === '/api/me' && req.method === 'GET') return getMe(req, res);
  return false;
}

function send(res, status, data) { res.statusCode = status; res.end(JSON.stringify(data)); }

async function getMembers(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const url = new URL(req.url, 'http://localhost');
  const search = url.searchParams.get('q') || '';
  const members = search
    ? all(`SELECT m.*, (SELECT COUNT(*) FROM bookings b WHERE b.member_id=m.id AND b.status='confirmed') as booking_count
        FROM members m WHERE m.studio_id=? AND m.active=1 AND (m.name LIKE ? OR m.email LIKE ?)
        ORDER BY m.name LIMIT 100`, [auth.studioId, `%${search}%`, `%${search}%`])
    : all(`SELECT m.*, (SELECT COUNT(*) FROM bookings b WHERE b.member_id=m.id AND b.status='confirmed') as booking_count
        FROM members m WHERE m.studio_id=? AND m.active=1 ORDER BY m.created_at DESC LIMIT 200`, [auth.studioId]);
  send(res, 200, members);
}

async function createMember(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const { email, name, phone, membership_type, credits, notes, password } = req.body;
  if (!email || !name) return send(res, 400, { error: 'Email and name required' });
  const existing = get('SELECT id FROM members WHERE email=? AND studio_id=?', [email, auth.studioId]);
  if (existing) return send(res, 400, { error: 'Member with this email already exists' });
  const id = uuid();
  run(`INSERT INTO members (id, studio_id, email, password_hash, name, phone, membership_type, credits, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, auth.studioId, email, password ? hashPassword(password) : null, name,
     phone||null, membership_type||'none', credits||0, notes||null]);
  send(res, 201, get('SELECT * FROM members WHERE id=?', [id]));
}

async function getMember(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const member = get('SELECT * FROM members WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!member) return send(res, 404, { error: 'Not found' });
  const bookings = all(`SELECT b.*, s.name as session_name, s.starts_at, s.color
    FROM bookings b JOIN class_sessions s ON s.id=b.session_id
    WHERE b.member_id=? ORDER BY s.starts_at DESC LIMIT 20`, [id]);
  const transactions = all('SELECT * FROM transactions WHERE member_id=? ORDER BY created_at DESC LIMIT 20', [id]);
  send(res, 200, { ...member, bookings, transactions });
}

async function updateMember(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const m = get('SELECT id FROM members WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!m) return send(res, 404, { error: 'Not found' });
  const { name, phone, email, notes, emergency_contact } = req.body;
  run('UPDATE members SET name=?, phone=?, email=?, notes=?, emergency_contact=? WHERE id=?',
    [name, phone||null, email, notes||null, emergency_contact||null, id]);
  send(res, 200, get('SELECT * FROM members WHERE id=?', [id]));
}

async function deactivateMember(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  run('UPDATE members SET active=0 WHERE id=? AND studio_id=?', [id, auth.studioId]);
  send(res, 200, { ok: true });
}

async function updateMembership(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const m = get('SELECT id FROM members WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!m) return send(res, 404, { error: 'Not found' });
  const { membership_type, credits, membership_expires } = req.body;
  run('UPDATE members SET membership_type=?, credits=?, membership_expires=? WHERE id=?',
    [membership_type, credits||0, membership_expires||null, id]);
  run(`INSERT INTO transactions (id, studio_id, member_id, type, description) VALUES (?, ?, ?, 'membership_update', ?)`,
    [uuid(), auth.studioId, id, `Membership updated to: ${membership_type}`]);
  send(res, 200, get('SELECT * FROM members WHERE id=?', [id]));
}

async function adjustCredits(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const m = get('SELECT id, credits FROM members WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!m) return send(res, 404, { error: 'Not found' });
  const { delta, reason } = req.body;
  if (typeof delta !== 'number') return send(res, 400, { error: 'delta (number) required' });
  const newCredits = Math.max(0, m.credits + delta);
  run('UPDATE members SET credits=? WHERE id=?', [newCredits, id]);
  run(`INSERT INTO transactions (id, studio_id, member_id, type, credits_delta, description) VALUES (?, ?, ?, 'credit_adjust', ?, ?)`,
    [uuid(), auth.studioId, id, delta, reason||'Manual credit adjustment']);
  send(res, 200, { credits: newCredits });
}

async function getMe(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  if (auth.memberId) {
    const member = get('SELECT id, name, email, membership_type, credits, membership_expires, phone FROM members WHERE id=?', [auth.memberId]);
    const studio = get('SELECT name, slug, primary_color FROM studios WHERE id=?', [auth.studioId]);
    return send(res, 200, { ...member, studioName: studio?.name, studioSlug: studio?.slug });
  }
  const user = get('SELECT id, name, email, role FROM users WHERE id=?', [auth.userId]);
  const studio = get('SELECT id, name, slug, primary_color FROM studios WHERE id=?', [auth.studioId]);
  send(res, 200, { ...user, studio });
}
