import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'fitbook.db');

let db;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
  }
  return db;
}

export function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS studios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      timezone TEXT DEFAULT 'America/New_York',
      booking_window_days INTEGER DEFAULT 7,
      cancel_cutoff_hours INTEGER DEFAULT 1,
      late_cancel_penalty INTEGER DEFAULT 1,
      stripe_pk TEXT,
      stripe_sk TEXT,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#185FA5',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email, studio_id)
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      email TEXT NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      emergency_contact TEXT,
      notes TEXT,
      membership_type TEXT DEFAULT 'none',
      credits INTEGER DEFAULT 0,
      membership_expires TEXT,
      stripe_customer_id TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email, studio_id)
    );

    CREATE TABLE IF NOT EXISTS instructors (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      name TEXT NOT NULL,
      email TEXT,
      bio TEXT,
      color TEXT DEFAULT '#185FA5',
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS class_templates (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      name TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER DEFAULT 60,
      capacity INTEGER DEFAULT 20,
      waitlist_limit INTEGER DEFAULT 5,
      color TEXT DEFAULT '#185FA5',
      instructor_id TEXT REFERENCES instructors(id),
      booking_window_days INTEGER,
      cancel_cutoff_hours INTEGER,
      late_cancel_penalty INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_sessions (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      template_id TEXT REFERENCES class_templates(id),
      instructor_id TEXT REFERENCES instructors(id),
      name TEXT NOT NULL,
      description TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 20,
      waitlist_limit INTEGER DEFAULT 5,
      color TEXT DEFAULT '#185FA5',
      status TEXT DEFAULT 'scheduled',
      cancel_reason TEXT,
      booked_count INTEGER DEFAULT 0,
      waitlist_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      session_id TEXT NOT NULL REFERENCES class_sessions(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      status TEXT DEFAULT 'confirmed',
      waitlisted INTEGER DEFAULT 0,
      waitlist_position INTEGER,
      booked_at TEXT DEFAULT (datetime('now')),
      cancelled_at TEXT,
      checked_in INTEGER DEFAULT 0,
      checked_in_at TEXT,
      credit_deducted INTEGER DEFAULT 0,
      UNIQUE(session_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      type TEXT NOT NULL,
      amount INTEGER DEFAULT 0,
      credits_delta INTEGER DEFAULT 0,
      description TEXT,
      booking_id TEXT,
      stripe_charge_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_studio_starts ON class_sessions(studio_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id);
    CREATE INDEX IF NOT EXISTS idx_members_studio ON members(studio_id);
  `);
  console.log('✅ Database initialized');
}

export function uuid() {
  return crypto.randomUUID();
}

export function run(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

export function get(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params);
}

export function all(sql, params = []) {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params);
}
