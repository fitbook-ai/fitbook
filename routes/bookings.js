import { get, run, all, uuid } from '../lib/db.js';
import { authMiddleware } from '../lib/auth.js';
import { sendEmail, bookingConfirmationEmail, cancellationEmail, waitlistAvailableEmail } from '../lib/email.js';

export function handleBookings(req, res, path) {
  if (path === '/api/bookings' && req.method === 'POST') return createBooking(req, res);
  if (path.match(/^\/api\/bookings\/[\w-]+$/) && req.method === 'DELETE') return cancelBooking(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/bookings\/[\w-]+\/checkin$/) && req.method === 'POST') return checkIn(req, res, path.split('/')[3]);
  if (path.match(/^\/api\/sessions\/[\w-]+\/bookings$/) && req.method === 'GET') return getSessionBookings(req, res, path.split('/')[3]);
  if (path === '/api/my-bookings' && req.method === 'GET') return getMyBookings(req, res);
  if (path === '/api/public/sessions' && req.method === 'GET') return getPublicSessions(req, res);
  if (path === '/api/public/book' && req.method === 'POST') return memberBook(req, res);
  if (path === '/api/public/cancel' && req.method === 'POST') return memberCancel(req, res);
  return false;
}

function send(res, status, data) { res.statusCode = status; res.end(JSON.stringify(data)); }

// Owner: create booking on behalf of member
async function createBooking(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const { session_id, member_id } = req.body;
  await doBook(res, session_id, member_id, auth.studioId, true);
}

// Member: book a class (uses token with memberId)
async function memberBook(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  if (!auth.memberId) return send(res, 403, { error: 'Member token required' });
  const { session_id } = req.body;
  await doBook(res, session_id, auth.memberId, auth.studioId, false);
}

async function doBook(res, sessionId, memberId, studioId, isOwner) {
  if (!sessionId || !memberId) return send(res, 400, { error: 'session_id and member_id required' });

  const session = get('SELECT * FROM class_sessions WHERE id=? AND studio_id=?', [sessionId, studioId]);
  if (!session) return send(res, 404, { error: 'Session not found' });
  if (session.status === 'cancelled') return send(res, 400, { error: 'Class is cancelled' });

  const member = get('SELECT * FROM members WHERE id=? AND studio_id=?', [memberId, studioId]);
  if (!member) return send(res, 404, { error: 'Member not found' });

  const existing = get('SELECT id, status, waitlisted FROM bookings WHERE session_id=? AND member_id=?', [sessionId, memberId]);
  if (existing && existing.status === 'confirmed') return send(res, 400, { error: 'Already booked' });

  // Check booking window (unless owner)
  if (!isOwner) {
    const studio = get('SELECT booking_window_days, cancel_cutoff_hours FROM studios WHERE id=?', [studioId]);
    const tmpl = session.template_id ? get('SELECT booking_window_days FROM class_templates WHERE id=?', [session.template_id]) : null;
    const windowDays = tmpl?.booking_window_days || studio?.booking_window_days || 7;
    const cutoffHours = studio?.cancel_cutoff_hours || 1;
    const now = new Date();
    const classTime = new Date(session.starts_at);
    const openTime = new Date(classTime.getTime() - windowDays * 86400000);
    const closedTime = new Date(classTime.getTime() - cutoffHours * 3600000);
    if (now < openTime) return send(res, 400, { error: `Booking opens ${openTime.toLocaleDateString()}` });
    if (now > closedTime) return send(res, 400, { error: 'Booking is closed for this class' });
    if (classTime < now) return send(res, 400, { error: 'Class has already started' });
  }

  const bookedCount = get('SELECT COUNT(*) as c FROM bookings WHERE session_id=? AND status=\'confirmed\' AND waitlisted=0', [sessionId]).c;
  const waitlistCount = get('SELECT COUNT(*) as c FROM bookings WHERE session_id=? AND waitlisted=1', [sessionId]).c;
  const isFull = bookedCount >= session.capacity;
  const waitlistFull = isFull && waitlistCount >= session.waitlist_limit;

  if (waitlistFull && !isOwner) return send(res, 400, { error: 'Class is full and waitlist is full' });

  // Deduct credit if on a class pack
  let creditDeducted = 0;
  if (!isOwner && !isFull && member.membership_type === 'pack') {
    if (member.credits <= 0) return send(res, 400, { error: 'No class credits remaining' });
    run('UPDATE members SET credits=credits-1 WHERE id=?', [memberId]);
    run(`INSERT INTO transactions (id, studio_id, member_id, type, credits_delta, description) VALUES (?, ?, ?, 'credit_use', -1, ?)`,
      [uuid(), studioId, memberId, `Class booking: ${session.name}`]);
    creditDeducted = 1;
  }

  const bookingId = uuid();
  const waitlisted = isFull ? 1 : 0;
  const waitlistPos = isFull ? waitlistCount + 1 : null;

  if (existing) {
    run(`UPDATE bookings SET status='confirmed', waitlisted=?, waitlist_position=?, booked_at=datetime('now'), cancelled_at=NULL, credit_deducted=? WHERE id=?`,
      [waitlisted, waitlistPos, creditDeducted, existing.id]);
  } else {
    run(`INSERT INTO bookings (id, studio_id, session_id, member_id, status, waitlisted, waitlist_position, credit_deducted) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      [bookingId, studioId, sessionId, memberId, waitlisted, waitlistPos, creditDeducted]);
  }

  const studio = get('SELECT name FROM studios WHERE id=?', [studioId]);
  if (!waitlisted) {
    await sendEmail(bookingConfirmationEmail(member, session, studio));
  }

  send(res, 201, { ok: true, waitlisted: !!waitlisted, waitlistPosition: waitlistPos, bookingId: existing?.id || bookingId });
}

async function cancelBooking(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const booking = get(`SELECT b.*, s.starts_at, s.name as session_name, s.status as session_status
    FROM bookings b JOIN class_sessions s ON s.id=b.session_id
    WHERE b.id=? AND b.studio_id=?`, [id, auth.studioId]);
  if (!booking) return send(res, 404, { error: 'Booking not found' });
  if (booking.status !== 'confirmed') return send(res, 400, { error: 'Booking already cancelled' });

  const isOwner = auth.role === 'owner';
  const isLateCancel = !isOwner && checkLateCancel(booking, auth.studioId);

  run(`UPDATE bookings SET status='cancelled', cancelled_at=datetime('now') WHERE id=?`, [id]);

  // Refund credit (unless late cancel penalty applies)
  if (booking.credit_deducted && !isLateCancel) {
    run('UPDATE members SET credits=credits+1 WHERE id=?', [booking.member_id]);
    run(`INSERT INTO transactions (id, studio_id, member_id, type, credits_delta, description) VALUES (?, ?, ?, 'credit_refund', 1, ?)`,
      [uuid(), auth.studioId, booking.member_id, `Cancellation refund: ${booking.session_name}`]);
  }

  // Promote waitlist
  await promoteWaitlist(booking.session_id, auth.studioId);

  const member = get('SELECT * FROM members WHERE id=?', [booking.member_id]);
  const session = get('SELECT * FROM class_sessions WHERE id=?', [booking.session_id]);
  const studio = get('SELECT name FROM studios WHERE id=?', [auth.studioId]);
  if (member) await sendEmail(cancellationEmail(member, session, studio));

  send(res, 200, { ok: true, lateCancel: isLateCancel });
}

function checkLateCancel(booking, studioId) {
  const studio = get('SELECT cancel_cutoff_hours FROM studios WHERE id=?', [studioId]);
  const cutoff = studio?.cancel_cutoff_hours || 1;
  const classTime = new Date(booking.starts_at);
  const now = new Date();
  return (classTime - now) < cutoff * 3600000;
}

async function promoteWaitlist(sessionId, studioId) {
  const session = get('SELECT capacity FROM class_sessions WHERE id=?', [sessionId]);
  const bookedCount = get('SELECT COUNT(*) as c FROM bookings WHERE session_id=? AND status=\'confirmed\' AND waitlisted=0', [sessionId]).c;
  if (bookedCount >= session.capacity) return;

  const next = get(`SELECT b.*, m.name as member_name, m.email as member_email
    FROM bookings b JOIN members m ON m.id=b.member_id
    WHERE b.session_id=? AND b.waitlisted=1 AND b.status='confirmed'
    ORDER BY b.waitlist_position ASC LIMIT 1`, [sessionId]);
  if (!next) return;

  run('UPDATE bookings SET waitlisted=0, waitlist_position=NULL WHERE id=?', [next.id]);
  // Re-number remaining waitlist
  const remaining = all(`SELECT id FROM bookings WHERE session_id=? AND waitlisted=1 AND status='confirmed' ORDER BY waitlist_position`, [sessionId]);
  remaining.forEach((b, i) => run('UPDATE bookings SET waitlist_position=? WHERE id=?', [i+1, b.id]));

  const member = { name: next.member_name, email: next.member_email };
  const sess = get('SELECT * FROM class_sessions WHERE id=?', [sessionId]);
  const studio = get('SELECT name FROM studios WHERE id=?', [studioId]);
  await sendEmail(waitlistAvailableEmail(member, sess, studio));
}

async function checkIn(req, res, id) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const booking = get('SELECT id, studio_id FROM bookings WHERE id=? AND studio_id=?', [id, auth.studioId]);
  if (!booking) return send(res, 404, { error: 'Not found' });
  run(`UPDATE bookings SET checked_in=1, checked_in_at=datetime('now') WHERE id=?`, [id]);
  send(res, 200, { ok: true });
}

async function getSessionBookings(req, res, sessionId) {
  const auth = authMiddleware(req, res); if (!auth) return;
  const bookings = all(`SELECT b.*, m.name as member_name, m.email as member_email, m.membership_type
    FROM bookings b JOIN members m ON m.id=b.member_id
    WHERE b.session_id=? AND b.studio_id=? AND b.status='confirmed'
    ORDER BY b.waitlisted ASC, b.booked_at ASC`, [sessionId, auth.studioId]);
  send(res, 200, bookings);
}

async function getMyBookings(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  if (!auth.memberId) return send(res, 403, { error: 'Member token required' });
  const url = new URL(req.url, 'http://localhost');
  const upcoming = url.searchParams.get('upcoming') !== 'false';
  const bookings = all(`SELECT b.*, s.name as session_name, s.starts_at, s.ends_at, s.color,
    i.name as instructor_name
    FROM bookings b
    JOIN class_sessions s ON s.id=b.session_id
    LEFT JOIN instructors i ON i.id=s.instructor_id
    WHERE b.member_id=? AND b.status='confirmed' AND ${upcoming ? "s.starts_at >= datetime('now')" : "s.starts_at < datetime('now')"}
    ORDER BY s.starts_at ${upcoming ? 'ASC' : 'DESC'} LIMIT 50`, [auth.memberId]);
  send(res, 200, bookings);
}

async function getPublicSessions(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const slug = url.searchParams.get('studio');
  const from = url.searchParams.get('from') || new Date().toISOString().split('T')[0];
  const to = url.searchParams.get('to') || new Date(Date.now() + 14*86400000).toISOString().split('T')[0];
  if (!slug) return send(res, 400, { error: 'Studio slug required' });

  const studio = get('SELECT id, name, slug, primary_color FROM studios WHERE slug=?', [slug]);
  if (!studio) return send(res, 404, { error: 'Studio not found' });

  const sessions = all(`SELECT s.*, i.name as instructor_name,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed' AND b.waitlisted=0) as booked_count,
    (SELECT COUNT(*) FROM bookings b WHERE b.session_id=s.id AND b.waitlisted=1) as waitlist_count
    FROM class_sessions s LEFT JOIN instructors i ON i.id=s.instructor_id
    WHERE s.studio_id=? AND s.starts_at>=? AND s.starts_at<=? AND s.status='scheduled'
    ORDER BY s.starts_at`,
    [studio.id, from+'T00:00:00.000Z', to+'T23:59:59.999Z']);

  // Add member's booking status if authenticated
  const authHeader = req.headers['authorization'];
  let memberId = null;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { verifyToken } = await import('../lib/auth.js');
      const payload = verifyToken(authHeader.slice(7));
      if (payload.memberId) memberId = payload.memberId;
    } catch {}
  }

  const enriched = sessions.map(s => {
    let myBooking = null;
    if (memberId) {
      myBooking = get('SELECT id, waitlisted, waitlist_position FROM bookings WHERE session_id=? AND member_id=? AND status=\'confirmed\'', [s.id, memberId]);
    }
    return { ...s, spots_left: s.capacity - s.booked_count, is_full: s.booked_count >= s.capacity, my_booking: myBooking };
  });

  send(res, 200, { studio, sessions: enriched });
}

async function memberCancel(req, res) {
  const auth = authMiddleware(req, res); if (!auth) return;
  if (!auth.memberId) return send(res, 403, { error: 'Member token required' });
  const { booking_id } = req.body;
  const booking = get(`SELECT b.*, s.starts_at, s.name as session_name
    FROM bookings b JOIN class_sessions s ON s.id=b.session_id
    WHERE b.id=? AND b.member_id=? AND b.studio_id=?`, [booking_id, auth.memberId, auth.studioId]);
  if (!booking) return send(res, 404, { error: 'Booking not found' });
  if (booking.status !== 'confirmed') return send(res, 400, { error: 'Already cancelled' });

  const isLateCancel = checkLateCancel(booking, auth.studioId);
  run(`UPDATE bookings SET status='cancelled', cancelled_at=datetime('now') WHERE id=?`, [booking_id]);

  if (booking.credit_deducted && !isLateCancel) {
    run('UPDATE members SET credits=credits+1 WHERE id=?', [auth.memberId]);
  }

  await promoteWaitlist(booking.session_id, auth.studioId);
  send(res, 200, { ok: true, lateCancel: isLateCancel });
}
