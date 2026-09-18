/**
 * Database access layer.
 * - Default: SQLite (local / legacy Render disk)
 * - When DATABASE_URL or NEON_DATABASE_URL is set: Postgres (Neon)
 *
 * Preserves runAsync / getAsync / allAsync used across the app.
 */
require('dotenv').config();
const path = require('path');
const {
  isPostgres,
  toPgPlaceholders,
  translateSql,
  parsePragmaTableInfo,
  pragmaTableInfoQuery
} = require('./utils/sqlDialect');

const usePg = isPostgres();
const onVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);

let db;

if (!usePg && onVercel) {
  const msg =
    'DATABASE_URL is required on Vercel (Neon Postgres). SQLite is not supported in serverless.';
  console.error('[database]', msg);
  const fail = () => Promise.reject(new Error(msg));
  db = {
    dialect: 'none',
    run() {},
    get() {},
    all() {},
    runAsync: fail,
    getAsync: fail,
    allAsync: fail,
    ping: fail
  };
} else if (usePg) {
  const { Pool } = require('pg');
  let connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  // Prefer pool ssl config; avoid pg v8/v9 sslmode ambiguity with Neon URIs
  try {
    const u = new URL(connectionString);
    u.searchParams.delete('channel_binding');
    if (!u.searchParams.get('sslmode')) u.searchParams.set('sslmode', 'require');
    u.searchParams.set('uselibpqcompat', 'true');
    connectionString = u.toString();
  } catch (_) { /* keep raw */ }

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === '0' ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 8),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 60000),
    keepAlive: true
  });

  console.log('Connected to Postgres (Neon) via DATABASE_URL');

  async function query(sql, params = [], attempt = 1) {
    const pragmaTable = parsePragmaTableInfo(sql);
    if (pragmaTable) {
      const res = await pool.query(pragmaTableInfoQuery(), [pragmaTable]);
      return res;
    }
    if (/^\s*PRAGMA\s+/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    const translated = translateSql(sql);
    let text = toPgPlaceholders(translated);
    // RETURNING id on same connection — lastval() fails across pool clients
    const wantsLastId =
      /^\s*INSERT\s+/i.test(sql) &&
      !/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(translated) &&
      !/\bRETURNING\b/i.test(translated);
    if (wantsLastId) {
      text = `${text.replace(/;\s*$/, '')} RETURNING id`;
    }
    try {
      const res = await pool.query(text, params);
      if (wantsLastId && res.rows?.[0]?.id != null) {
        res._lastID = res.rows[0].id;
      }
      return res;
    } catch (err) {
      const retryable =
        /timeout|ETIMEDOUT|ECONNRESET|Connection terminated|Connection ended|could not connect|ECONNREFUSED/i.test(
          String(err.message || err.code || err)
        );
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        return query(sql, params, attempt + 1);
      }
      throw err;
    }
  }

  db = {
    dialect: 'postgres',
    pool,
    run(sql, params, cb) {
      const args = typeof params === 'function' ? [] : params || [];
      const callback = typeof params === 'function' ? params : cb;
      query(sql, args)
        .then((res) => {
          const lastID = res._lastID ?? res.rows?.[0]?.id ?? null;
          callback && callback.call({ lastID, changes: res.rowCount || 0 }, null);
        })
        .catch((err) => callback && callback(err));
    },
    get(sql, params, cb) {
      const args = typeof params === 'function' ? [] : params || [];
      const callback = typeof params === 'function' ? params : cb;
      query(sql, args)
        .then((res) => callback && callback(null, res.rows[0]))
        .catch((err) => callback && callback(err));
    },
    all(sql, params, cb) {
      const args = typeof params === 'function' ? [] : params || [];
      const callback = typeof params === 'function' ? params : cb;
      query(sql, args)
        .then((res) => callback && callback(null, res.rows))
        .catch((err) => callback && callback(err));
    },
    runAsync(sql, params = []) {
      return query(sql, params).then((res) => ({
        lastID: res._lastID ?? res.rows?.[0]?.id ?? null,
        changes: res.rowCount || 0
      }));
    },
    getAsync(sql, params = []) {
      return query(sql, params).then((res) => res.rows[0]);
    },
    allAsync(sql, params = []) {
      return query(sql, params).then((res) => res.rows);
    },
    async ping() {
      await pool.query('SELECT 1 AS ok');
      return true;
    }
  };
} else {
  const sqlite3 = require('sqlite3').verbose();
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to SQLite database');
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA synchronous = NORMAL');
      db.run('PRAGMA foreign_keys = ON');
      db.run('PRAGMA temp_store = MEMORY');
      db.run('PRAGMA cache_size = -8000');
    }
  });

  db.run('PRAGMA foreign_keys = ON');
  db.dialect = 'sqlite';

  db.runAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  db.getAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  db.allAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  db.ping = async function () {
    await db.getAsync('SELECT 1 AS ok');
    return true;
  };
}

module.exports = db;
