import { get, run, all, uuid } from '../lib/db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';

export function handleAuth(req, res, path) {
  if (path === '/api/auth/register' && req.method === 'POST') return register(req, res);
  if (path === '/api/auth/login' && req.method === 'POST') return login(req, res);
  if (path === '/api/auth/member/register' && req.method === 'POST') return memberRegister(req, res);
  if (path === '/api/auth/member/login' && req.method === 'POST') return memberLogin(req, res);
  return false;
}

async function register(req, res) {
  const { studioName, email, password, name, slug } = req.body;
  if (!studioName || !email || !password || !name) {
    return send(res, 400, { error: 'Missing required fields' });
  }
  const cleanSlug = (slug || studioName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const existing = get('SELECT id FROM studios WHERE slug = ?', [cleanSlug]);
  if (existing) return send(res, 400, { error: 'Studio URL already taken' });
  const emailExists = get('SELECT id FROM users WHERE email = ?', [email]);
  if (emailExists) return send(res, 400, { error: 'Email already registered' });

  const studioId = uuid();
  const userId = uuid();
  run(`INSERT INTO studios (id, name, slug, email) VALUES (?, ?, ?, ?)`,
    [studioId, studioName, cleanSlug, email]);
  run(`INSERT INTO users (id, studio_id, email, password_hash, role, name) VALUES (?, ?, ?, ?, 'owner', ?)`,
    [userId, studioId, email, hashPassword(password), name]);

  // Seed demo instructor
  const instructorId = uuid();
  run(`INSERT INTO instructors (id, studio_id, name, email, color) VALUES (?, ?, ?, ?, ?)`,
    [instructorId, studioId, name, email, '#185FA5']);

  const token = signToken({ userId, studioId, role: 'owner', name, email });
  send(res, 201, { token, user: { id: userId, name, email, role: 'owner', studioId }, slug: cleanSlug });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return send(res, 400, { error: 'Email and password required' });
  const user = get(`SELECT u.*, s.slug, s.name as studioName FROM users u 
    JOIN studios s ON s.id = u.studio_id WHERE u.email = ? AND u.role = 'owner'`, [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return send(res, 401, { error: 'Invalid email or password' });
  }
  const token = signToken({ userId: user.id, studioId: user.studio_id, role: 'owner', name: user.name, email });
  send(res, 200, { token, user: { id: user.id, name: user.name, email, role: 'owner', studioId: user.studio_id, studioName: user.studioName }, slug: user.slug });
}

async function memberRegister(req, res) {
  const { studioSlug, email, password, name, phone } = req.body;
  if (!studioSlug || !email || !name) return send(res, 400, { error: 'Missing required fields' });
  const studio = get('SELECT id FROM studios WHERE slug = ?', [studioSlug]);
  if (!studio) return send(res, 404, { error: 'Studio not found' });
  const existing = get('SELECT id FROM members WHERE email = ? AND studio_id = ?', [email, studio.id]);
  if (existing) {
    // If member exists but no password, set password (self-registration)
    if (password && !existing.password_hash) {
      run('UPDATE members SET password_hash = ? WHERE id = ?', [hashPassword(password), existing.id]);
    }
    return send(res, 400, { error: 'Email already registered at this studio' });
  }
  const memberId = uuid();
  run(`INSERT INTO members (id, studio_id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?, ?)`,
    [memberId, studio.id, email, password ? hashPassword(password) : null, name, phone || null]);
  const studioData = get('SELECT name, slug FROM studios WHERE id = ?', [studio.id]);
  const token = signToken({ memberId, studioId: studio.id, role: 'member', name, email });
  send(res, 201, { token, member: { id: memberId, name, email, studioId: studio.id, studioName: studioData.name } });
}

async function memberLogin(req, res) {
  const { studioSlug, email, password } = req.body;
  if (!studioSlug || !email || !password) return send(res, 400, { error: 'Missing required fields' });
  const studio = get('SELECT id, name FROM studios WHERE slug = ?', [studioSlug]);
  if (!studio) return send(res, 404, { error: 'Studio not found' });
  const member = get('SELECT * FROM members WHERE email = ? AND studio_id = ?', [email, studio.id]);
  if (!member || !member.password_hash || !verifyPassword(password, member.password_hash)) {
    return send(res, 401, { error: 'Invalid email or password' });
  }
  const token = signToken({ memberId: member.id, studioId: studio.id, role: 'member', name: member.name, email });
  send(res, 200, { token, member: { id: member.id, name: member.name, email, studioId: studio.id, studioName: studio.name, membershipType: member.membership_type, credits: member.credits } });
}

function send(res, status, data) {
  res.statusCode = status;
  res.end(JSON.stringify(data));
}
