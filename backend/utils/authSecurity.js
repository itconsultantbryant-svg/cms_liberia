const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MIN_PASSWORD_LENGTH = 8;

function getJwtSecret() {
  const { assessJwtSecret } = require('./securityHardening');
  const secret = process.env.JWT_SECRET;
  const assessment = assessJwtSecret(secret);
  if (process.env.NODE_ENV === 'production' && !assessment.ok) {
    throw new Error(assessment.message);
  }
  return secret || 'your-secret-key';
}

function validatePassword(password) {
  const { validatePasswordStrength } = require('./securityHardening');
  return validatePasswordStrength(password);
}

function isDebugResetEnabled() {
  return (
    process.env.AUTH_DEBUG_RESET === '1' ||
    process.env.NODE_ENV !== 'production'
  );
}

function isLocked(account) {
  if (!account?.locked_until) return false;
  const until = new Date(account.locked_until).getTime();
  if (Number.isNaN(until)) return false;
  return until > Date.now();
}

function lockMessage(account) {
  return `Account locked until ${account.locked_until}. Try again later.`;
}

async function recordFailedLogin(table, id) {
  const row = await db.getAsync(
    `SELECT failed_login_attempts, locked_until FROM ${table} WHERE id = ?`,
    [id]
  );
  const attempts = (row?.failed_login_attempts || 0) + 1;
  let lockedUntil = null;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
  }
  await db.runAsync(
    `UPDATE ${table} SET failed_login_attempts = ?, locked_until = COALESCE(?, locked_until) WHERE id = ?`,
    [attempts, lockedUntil, id]
  );
  return { attempts, lockedUntil };
}

async function clearFailedLogins(table, id) {
  await db.runAsync(
    `UPDATE ${table} SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
    [id]
  );
}

async function bumpTokenVersion(table, id) {
  await db.runAsync(
    `UPDATE ${table} SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?`,
    [id]
  );
  const row = await db.getAsync(`SELECT token_version FROM ${table} WHERE id = ?`, [id]);
  return row?.token_version ?? 1;
}

async function setPassword(table, id, hashedPassword) {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE ${table} SET password = ?, password_changed_at = ?, token_version = COALESCE(token_version, 0) + 1, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
    [hashedPassword, now, id]
  );
  const row = await db.getAsync(`SELECT token_version FROM ${table} WHERE id = ?`, [id]);
  return row?.token_version ?? 1;
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createPasswordResetToken(accountType, accountId, churchId) {
  const raw = generateResetToken();
  const tokenHash = hashResetToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  // Invalidate prior unused tokens for this account
  await db.runAsync(
    `UPDATE password_reset_tokens SET used_at = ? WHERE account_type = ? AND account_id = ? AND used_at IS NULL`,
    [new Date().toISOString(), accountType, accountId]
  );

  await db.runAsync(
    `INSERT INTO password_reset_tokens (account_type, account_id, church_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [accountType, accountId, churchId || null, tokenHash, expiresAt]
  );

  return { raw, expiresAt };
}

async function consumeResetToken(rawToken) {
  const tokenHash = hashResetToken(rawToken);
  const row = await db.getAsync(
    `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL`,
    [tokenHash]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  await db.runAsync(
    `UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`,
    [new Date().toISOString(), row.id]
  );
  return row;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
  MIN_PASSWORD_LENGTH,
  getJwtSecret,
  validatePassword,
  isDebugResetEnabled,
  isLocked,
  lockMessage,
  recordFailedLogin,
  clearFailedLogins,
  bumpTokenVersion,
  setPassword,
  createPasswordResetToken,
  consumeResetToken,
  hashPassword
};
