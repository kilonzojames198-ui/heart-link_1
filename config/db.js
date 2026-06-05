const { neon } = require('@neondatabase/serverless');
const bcrypt   = require('bcryptjs');

// ── Connection ────────────────────────────────────────────────────────────────
// Set DATABASE_URL in Vercel environment variables
// Format: postgres://user:password@host/dbname?sslmode=require
let sql;
function getSQL() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set.\nGet it from https://console.neon.tech');
    sql = neon(url);
  }
  return sql;
}

// ── Schema (PostgreSQL) ───────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password      TEXT    NOT NULL,
    age           INTEGER NOT NULL DEFAULT 18,
    gender        TEXT    NOT NULL DEFAULT 'other',
    interested_in TEXT    NOT NULL DEFAULT 'everyone',
    bio           TEXT    DEFAULT '',
    interests     TEXT    DEFAULT '[]',
    avatar        TEXT    DEFAULT NULL,
    plan          TEXT    DEFAULT 'free',
    role          TEXT    DEFAULT 'user',
    is_active     INTEGER DEFAULT 1,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS swipes (
    id         SERIAL PRIMARY KEY,
    swiper_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    swiped_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT    NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(swiper_id, swiped_id)
  );
  CREATE TABLE IF NOT EXISTS matches (
    id         SERIAL PRIMARY KEY,
    user1_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user1_id, user2_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT    NOT NULL DEFAULT '',
    image_url  TEXT    DEFAULT NULL,
    read_at    TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS payments (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                  TEXT    NOT NULL,
    amount_usd            NUMERIC(10,2) NOT NULL,
    stripe_session_id     TEXT    DEFAULT NULL,
    stripe_payment_intent TEXT    DEFAULT NULL,
    stripe_receipt        TEXT    DEFAULT NULL,
    status                TEXT    NOT NULL DEFAULT 'pending',
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS reports (
    id          SERIAL PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id    INTEGER REFERENCES matches(id) ON DELETE SET NULL,
    reason      TEXT    NOT NULL DEFAULT 'Other',
    detail      TEXT    DEFAULT '',
    status      TEXT    DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS blocks (
    id         SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
  );
  CREATE TABLE IF NOT EXISTS mutes (
    id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, muted_id)
  );
  CREATE INDEX IF NOT EXISTS idx_swipes_swiper  ON swipes(swiper_id);
  CREATE INDEX IF NOT EXISTS idx_matches_u1     ON matches(user1_id);
  CREATE INDEX IF NOT EXISTS idx_matches_u2     ON matches(user2_id);
  CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id);
  CREATE INDEX IF NOT EXISTS idx_payments_user  ON payments(user_id);
`;

// ── Wrapper — mirrors the sql.js API used throughout the app ─────────────────
// prepare(sql).get(params)  → one row or undefined
// prepare(sql).all(params)  → array of rows
// prepare(sql).run(params)  → { lastInsertRowid, changes }
//
// NOTE: We convert ? placeholders to $1 $2 … for PostgreSQL

function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function makeStmt(sqlStr) {
  const pgSql = toPostgres(sqlStr);
  return {
    async get(...args) {
      const params = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
      const rows = await getSQL()(pgSql, params);
      return rows[0] || undefined;
    },
    async all(...args) {
      const params = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
      return await getSQL()(pgSql, params);
    },
    async run(...args) {
      const params = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
      // Add RETURNING id so we can get lastInsertRowid
      let q = pgSql;
      if (/^INSERT/i.test(q.trim()) && !/RETURNING/i.test(q)) {
        q += ' RETURNING id';
      }
      const rows = await getSQL()(q, params);
      return {
        lastInsertRowid: rows[0]?.id || 0,
        changes: rows.length
      };
    }
  };
}

// ── Async db wrapper ──────────────────────────────────────────────────────────
const db = {
  prepare: (sql) => makeStmt(sql),
  // raw query helper
  query: async (sql, params = []) => await getSQL()(toPostgres(sql), params)
};

// ── Init: run schema + seed admin ─────────────────────────────────────────────
let _ready;
async function getDb() {
  if (!_ready) {
    _ready = (async () => {
      const s = getSQL();
      // Run each CREATE TABLE statement separately
      for (const stmt of SCHEMA.split(';').map(t => t.trim()).filter(Boolean)) {
        try { await s(stmt); } catch(e) { /* ignore already-exists */ }
      }
      await seedAdmin();
      console.log('✅ Neon PostgreSQL ready');
      return db;
    })();
  }
  return _ready;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL    || 'admin@heartlink.app';
  const pass  = process.env.ADMIN_PASSWORD || 'Admin@2026!';
  try {
    const existing = await db.prepare('SELECT id FROM users WHERE email=$1').get(email);
    if (!existing) {
      const hashed = await bcrypt.hash(pass, 10);
      await db.prepare(
        `INSERT INTO users (name,email,password,age,gender,role,plan,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
      ).run('Admin', email, hashed, 30, 'other', 'admin', 'vip', 1);
      console.log(`🔑 Admin created: ${email}`);
    }
  } catch(e) {
    console.error('Seed admin error:', e.message);
  }
}

module.exports = { getDb };
