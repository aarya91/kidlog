// Plain Postgres storage. No AI anywhere in this app.
import pg from 'pg';
import crypto from 'node:crypto';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) console.warn('DATABASE_URL is not set. Set it to a Postgres connection string.');

const isLocal = /localhost|127\.0\.0\.1/.test(url || '');
export const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 3,
});

export const CATEGORIES = ['symptom', 'temperature', 'medicine', 'feeding', 'sleep', 'doctor_visit', 'vaccine', 'note'];

let ready;
export function init() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        share_token TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        child TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        temperature TEXT,
        flagged BOOLEAN NOT NULL DEFAULT false,
        source TEXT NOT NULL DEFAULT 'manual',
        edited BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS entries_space_idx ON entries(space_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        dob TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS children_name_idx ON children(space_id, lower(name));
      INSERT INTO children (space_id, name)
        SELECT space_id, min(child) FROM entries GROUP BY space_id, lower(child)
        ON CONFLICT (space_id, lower(name)) DO NOTHING;
      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        child TEXT,
        flagged_only BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        child TEXT NOT NULL,
        kind TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS appointments_space_idx ON appointments(space_id, scheduled_at);
    `).catch((e) => { ready = undefined; throw e; });
  }
  return ready;
}

const token = (n) => crypto.randomBytes(n).toString('base64url');

export async function createSpace(name) {
  await init();
  const r = await pool.query(
    'INSERT INTO spaces (key, share_token, name) VALUES ($1, $2, $3) RETURNING *',
    [token(18), token(18), clean(name, 80) || 'Our family']
  );
  return r.rows[0];
}

export async function spaceByKey(key) {
  await init();
  const r = await pool.query('SELECT * FROM spaces WHERE key = $1', [String(key)]);
  return r.rows[0];
}

export async function spaceByShareToken(t) {
  await init();
  const r = await pool.query('SELECT * FROM spaces WHERE share_token = $1', [String(t)]);
  return r.rows[0];
}

export function clean(v, max) {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

// Accepts "YYYY-MM-DDTHH:MM" (or with a space, or date only). Stored as local text, no timezone maths.
export function normaliseWhen(v) {
  const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00'] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

// Validates and tidies entry fields. Returns { value } or { error }.
export function validateEntry(input, { partial = false } = {}) {
  const out = {};
  const has = (k) => input[k] !== undefined && input[k] !== null;
  if (has('child') || !partial) {
    out.child = clean(input.child, 60);
    if (!out.child) return { error: "The child's name is required." };
  }
  if (has('occurred_at') || !partial) {
    out.occurred_at = normaliseWhen(input.occurred_at);
    if (!out.occurred_at) return { error: 'The date and time must look like 2026-11-10T02:15.' };
  }
  if (has('category') || !partial) {
    out.category = clean(input.category, 30).toLowerCase();
    if (!CATEGORIES.includes(out.category)) return { error: `Category must be one of: ${CATEGORIES.join(', ')}.` };
  }
  if (has('title') || !partial) {
    out.title = clean(input.title, 120);
    if (!out.title) return { error: 'A short title is required.' };
  }
  if (has('details')) out.details = clean(input.details, 4000);
  if (has('temperature')) out.temperature = clean(input.temperature, 20) || null;
  if (has('flagged')) out.flagged = input.flagged === true || input.flagged === 'on' || input.flagged === 'true';
  return { value: out };
}

// Birth date as YYYY-MM-DD, not in the future. Returns { value } (null when blank) or { error }.
export function validateDob(v) {
  const t = String(v ?? '').trim();
  if (!t) return { value: null };
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCMonth() !== +m[2] - 1 || +m[1] < 1990) return { error: 'The birth date must look like 2024-08-15.' };
  if (d.getTime() > Date.now() + 86400000) return { error: 'The birth date cannot be in the future.' };
  return { value: t };
}

// Finds the child's profile by name (any capitalisation), creating it if new. Returns the saved spelling.
async function canonicalChild(spaceId, child) {
  const r = await pool.query(
    `INSERT INTO children (space_id, name) VALUES ($1, $2)
     ON CONFLICT (space_id, lower(name)) DO UPDATE SET name = children.name RETURNING name`,
    [spaceId, child]
  );
  return r.rows[0].name;
}

export async function getChild(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  const r = await pool.query('SELECT id, name AS child, dob FROM children WHERE space_id = $1 AND id = $2', [spaceId, n]);
  return r.rows[0];
}

// Create (no id) or update a child profile. Renaming also renames the child's entries.
// Renaming onto another child's name merges the two. dob === undefined leaves the birth date alone.
export async function saveChild(spaceId, { id, name, dob }) {
  name = clean(name, 60);
  if (!name) return { error: "The child's name is required." };
  if (id === undefined) {
    const saved = await canonicalChild(spaceId, name);
    if (dob !== undefined) await pool.query('UPDATE children SET dob = $1 WHERE space_id = $2 AND lower(name) = lower($3)', [dob, spaceId, saved]);
    return { value: saved };
  }
  const current = await getChild(spaceId, id);
  if (!current) return { error: 'That child profile no longer exists.' };
  const clash = await pool.query('SELECT id, dob FROM children WHERE space_id = $1 AND lower(name) = lower($2) AND id <> $3', [spaceId, name, current.id]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (clash.rows[0]) {
      const target = clash.rows[0];
      await client.query('UPDATE entries SET child = (SELECT name FROM children WHERE id = $1) WHERE space_id = $2 AND lower(child) = lower($3)', [target.id, spaceId, current.child]);
      for (const t of ['appointments', 'shares']) {
        await client.query(`UPDATE ${t} SET child = (SELECT name FROM children WHERE id = $1) WHERE space_id = $2 AND lower(child) = lower($3)`, [target.id, spaceId, current.child]);
      }
      const keepDob = dob || target.dob || current.dob;
      await client.query('UPDATE children SET dob = $1 WHERE id = $2', [keepDob, target.id]);
      await client.query('DELETE FROM children WHERE id = $1', [current.id]);
    } else {
      await client.query('UPDATE entries SET child = $1 WHERE space_id = $2 AND lower(child) = lower($3)', [name, spaceId, current.child]);
      for (const t of ['appointments', 'shares']) {
        await client.query(`UPDATE ${t} SET child = $1 WHERE space_id = $2 AND lower(child) = lower($3)`, [name, spaceId, current.child]);
      }
      await client.query('UPDATE children SET name = $1, dob = $2 WHERE id = $3', [name, dob !== undefined ? dob : current.dob, current.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { value: name };
}

// Only children with no entries and no appointments can be removed.
export async function deleteChild(spaceId, id) {
  const c = await getChild(spaceId, id);
  if (!c) return;
  const r = await pool.query(
    `DELETE FROM children WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM entries WHERE space_id = $2 AND lower(child) = lower($3))
       AND NOT EXISTS (SELECT 1 FROM appointments WHERE space_id = $2 AND lower(child) = lower($3))`,
    [c.id, spaceId, c.child]
  );
  if (r.rowCount) await pool.query('DELETE FROM shares WHERE space_id = $1 AND lower(child) = lower($2)', [spaceId, c.child]);
}

// ---- Doctor share links ----
// Each link is locked to one child (or all children) and to flagged entries only (or everything).
export async function createShare(spaceId, { child, flaggedOnly }) {
  let name = null;
  if (child) {
    const r = await pool.query('SELECT name FROM children WHERE space_id = $1 AND lower(name) = lower($2)', [spaceId, child]);
    if (!r.rows[0]) return { error: 'Choose a child from the list.' };
    name = r.rows[0].name;
  }
  // Reuse an existing link with the same scope instead of piling up duplicates.
  const dup = await pool.query(
    'SELECT * FROM shares WHERE space_id = $1 AND flagged_only = $2 AND coalesce(lower(child), \'\') = coalesce(lower($3), \'\')',
    [spaceId, !!flaggedOnly, name]
  );
  if (dup.rows[0]) return { value: dup.rows[0] };
  const r = await pool.query(
    'INSERT INTO shares (space_id, token, child, flagged_only) VALUES ($1, $2, $3, $4) RETURNING *',
    [spaceId, token(18), name, !!flaggedOnly]
  );
  return { value: r.rows[0] };
}

export async function listShares(spaceId) {
  const r = await pool.query('SELECT * FROM shares WHERE space_id = $1 ORDER BY id DESC', [spaceId]);
  return r.rows;
}

export async function deleteShare(spaceId, id) {
  const n = Number(id);
  if (Number.isInteger(n)) await pool.query('DELETE FROM shares WHERE space_id = $1 AND id = $2', [spaceId, n]);
}

// Returns { space, child, flaggedOnly } for a share token, or undefined.
// The family's original link (spaces.share_token) still works and shows everything.
export async function resolveShare(t) {
  await init();
  const r = await pool.query(
    'SELECT s.*, sh.child AS share_child, sh.flagged_only AS share_flagged FROM shares sh JOIN spaces s ON s.id = sh.space_id WHERE sh.token = $1',
    [String(t)]
  );
  if (r.rows[0]) {
    const { share_child, share_flagged, ...space } = r.rows[0];
    return { space, child: share_child, flaggedOnly: share_flagged };
  }
  const space = await spaceByShareToken(t);
  return space ? { space, child: null, flaggedOnly: false } : undefined;
}

// ---- Upcoming appointments ----
export const APPOINTMENT_KINDS = ['doctor', 'vaccine'];

export function validateAppointment(input) {
  const out = {};
  out.child = clean(input.child, 60);
  if (!out.child) return { error: "The child's name is required." };
  out.kind = clean(input.kind, 20).toLowerCase();
  if (!APPOINTMENT_KINDS.includes(out.kind)) return { error: 'Type must be doctor or vaccine.' };
  out.scheduled_at = normaliseWhen(input.scheduled_at);
  if (!out.scheduled_at) return { error: 'The date and time must look like 2026-11-28T17:00.' };
  out.title = clean(input.title, 120) || (out.kind === 'vaccine' ? 'Vaccine appointment' : 'Doctor appointment');
  out.notes = clean(input.notes, 1000);
  return { value: out };
}

export async function addAppointment(spaceId, v, source) {
  const child = await canonicalChild(spaceId, v.child);
  const r = await pool.query(
    `INSERT INTO appointments (space_id, child, kind, scheduled_at, title, notes, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [spaceId, child, v.kind, v.scheduled_at, v.title, v.notes || '', source]
  );
  return r.rows[0];
}

export async function getAppointment(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  const r = await pool.query('SELECT * FROM appointments WHERE space_id = $1 AND id = $2', [spaceId, n]);
  return r.rows[0];
}

export async function updateAppointment(spaceId, id, v) {
  const existing = await getAppointment(spaceId, id);
  if (!existing) return undefined;
  const child = await canonicalChild(spaceId, v.child);
  const r = await pool.query(
    `UPDATE appointments SET child = $1, kind = $2, scheduled_at = $3, title = $4, notes = $5, updated_at = now()
     WHERE space_id = $6 AND id = $7 RETURNING *`,
    [child, v.kind, v.scheduled_at, v.title, v.notes || '', spaceId, existing.id]
  );
  return r.rows[0];
}

export async function deleteAppointment(spaceId, id) {
  const n = Number(id);
  if (Number.isInteger(n)) await pool.query('DELETE FROM appointments WHERE space_id = $1 AND id = $2', [spaceId, n]);
}

// Soonest first.
export async function listAppointments(spaceId, { child, from } = {}) {
  const where = ['space_id = $1'];
  const vals = [spaceId];
  if (child) { vals.push(child); where.push(`lower(child) = lower($${vals.length})`); }
  if (from) { vals.push(from); where.push(`scheduled_at >= $${vals.length}`); }
  const r = await pool.query(`SELECT * FROM appointments WHERE ${where.join(' AND ')} ORDER BY scheduled_at, id LIMIT 500`, vals);
  return r.rows;
}

export async function addEntry(spaceId, v, source) {
  const child = await canonicalChild(spaceId, v.child);
  const r = await pool.query(
    `INSERT INTO entries (space_id, child, occurred_at, category, title, details, temperature, flagged, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [spaceId, child, v.occurred_at, v.category, v.title, v.details || '', v.temperature || null, !!v.flagged, source]
  );
  return r.rows[0];
}

export async function getEntry(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  const r = await pool.query('SELECT * FROM entries WHERE space_id = $1 AND id = $2', [spaceId, n]);
  return r.rows[0];
}

export async function updateEntry(spaceId, id, v, { markEdited = false } = {}) {
  const existing = await getEntry(spaceId, id);
  if (!existing) return undefined;
  const allowed = ['child', 'occurred_at', 'category', 'title', 'details', 'temperature', 'flagged'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (v[k] !== undefined) {
      vals.push(k === 'child' ? await canonicalChild(spaceId, v[k]) : v[k]);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (markEdited) sets.push('edited = true');
  sets.push('updated_at = now()');
  vals.push(spaceId, existing.id);
  const r = await pool.query(
    `UPDATE entries SET ${sets.join(', ')} WHERE space_id = $${vals.length - 1} AND id = $${vals.length} RETURNING *`,
    vals
  );
  return r.rows[0];
}

export async function deleteEntry(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return;
  await pool.query('DELETE FROM entries WHERE space_id = $1 AND id = $2', [spaceId, n]);
}

export async function listEntries(spaceId, { child, from, to, flaggedOnly, limit = 500 } = {}) {
  const where = ['space_id = $1'];
  const vals = [spaceId];
  if (child) { vals.push(child); where.push(`lower(child) = lower($${vals.length})`); }
  if (from) { vals.push(from); where.push(`occurred_at >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`occurred_at <= $${vals.length}`); }
  if (flaggedOnly) where.push('flagged = true');
  vals.push(Math.min(Math.max(Number(limit) || 500, 1), 500));
  const r = await pool.query(
    `SELECT * FROM entries WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, id DESC LIMIT $${vals.length}`,
    vals
  );
  return r.rows;
}

export async function listChildren(spaceId) {
  const r = await pool.query(
    `SELECT c.id, c.name AS child, c.dob, count(e.id)::int AS entries, max(e.occurred_at) AS latest
     FROM children c LEFT JOIN entries e ON e.space_id = c.space_id AND lower(e.child) = lower(c.name)
     WHERE c.space_id = $1 GROUP BY c.id ORDER BY c.id`,
    [spaceId]
  );
  return r.rows;
}

// "2 years, 3 months" from a YYYY-MM-DD birth date. Empty string when unknown.
export function ageLabel(dob, now = new Date()) {
  if (!dob) return '';
  const [y, m, d] = dob.split('-').map(Number);
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) - (now.getDate() < d ? 1 : 0);
  if (months < 0) return '';
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - Date.UTC(y, m - 1, d)) / 86400000));
    return `${days} ${days === 1 ? 'day' : 'days'} old`;
  }
  const yrs = Math.floor(months / 12);
  months %= 12;
  const parts = [];
  if (yrs) parts.push(`${yrs} ${yrs === 1 ? 'year' : 'years'}`);
  if (months) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  return parts.join(', ');
}

// Cheap change marker so an open timeline can refresh when Claude adds something.
export async function stamp(spaceId) {
  const r = await pool.query(
    `SELECT count(*)::int AS n, coalesce(max(updated_at)::text, '') AS t,
            (SELECT count(*)::int FROM children WHERE space_id = $1) AS k,
            (SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') FROM appointments WHERE space_id = $1) AS a
     FROM entries WHERE space_id = $1`,
    [spaceId]
  );
  return `${r.rows[0].n}:${r.rows[0].k}:${r.rows[0].t}:${r.rows[0].a}`;
}
