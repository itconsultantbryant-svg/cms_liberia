/**
 * Phase 31 — SQLite transaction helper.
 */
const db = require('../database');

/**
 * Run `fn` inside BEGIN/COMMIT. Rolls back on error.
 * `fn` receives the db module and may use runAsync/getAsync/allAsync.
 */
async function withTransaction(fn) {
  await db.runAsync('BEGIN IMMEDIATE');
  try {
    const result = await fn(db);
    await db.runAsync('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.runAsync('ROLLBACK');
    } catch (_) {
      /* ignore rollback errors */
    }
    throw err;
  }
}

module.exports = { withTransaction };
