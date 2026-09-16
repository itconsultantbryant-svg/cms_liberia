/**
 * Multi-currency: USD + LRD always available; catalog + per-church enablement.
 */
const db = require('../database');

const SYSTEM_CODES = ['USD', 'LRD'];

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function isValidCode(code) {
  return /^[A-Z]{3,8}$/.test(code);
}

async function ensureCatalogSeeded() {
  await db.runAsync(
    `INSERT OR IGNORE INTO currencies (code, name, symbol, decimal_places, is_system, is_active)
     VALUES ('USD', 'US Dollar', '$', 2, 1, 1)`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO currencies (code, name, symbol, decimal_places, is_system, is_active)
     VALUES ('LRD', 'Liberian Dollar', 'L$', 2, 1, 1)`
  );
}

async function ensureChurchCurrencies(churchId, preferredDefault) {
  if (!churchId) return;
  await ensureCatalogSeeded();
  const church = await db.getAsync(`SELECT currency FROM churches WHERE id = ?`, [churchId]);
  const pref = normalizeCode(preferredDefault || church?.currency) || 'USD';

  for (const code of SYSTEM_CODES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO church_currencies (church_id, currency_code, is_default, is_enabled)
       VALUES (?, ?, 0, 1)`,
      [churchId, code]
    );
  }

  if (pref && !SYSTEM_CODES.includes(pref)) {
    const exists = await db.getAsync(
      `SELECT code FROM currencies WHERE code = ? AND is_active = 1`,
      [pref]
    );
    if (exists) {
      await db.runAsync(
        `INSERT OR IGNORE INTO church_currencies (church_id, currency_code, is_default, is_enabled)
         VALUES (?, ?, 0, 1)`,
        [churchId, pref]
      );
    }
  }

  const prefEnabled = await db.getAsync(
    `SELECT currency_code FROM church_currencies
     WHERE church_id = ? AND currency_code = ? AND is_enabled = 1`,
    [churchId, pref]
  );
  const defaultCode = prefEnabled ? pref : 'USD';

  await db.runAsync(
    `UPDATE church_currencies SET is_default = CASE WHEN currency_code = ? THEN 1 ELSE 0 END
     WHERE church_id = ?`,
    [defaultCode, churchId]
  );

  // Keep churches.currency aligned with default when empty or when seeding from preferredDefault
  if (preferredDefault || !church?.currency) {
    await db.runAsync(
      `UPDATE churches SET currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [defaultCode, churchId]
    );
  }

  return defaultCode;
}

async function listCatalog({ includeInactive = false } = {}) {
  await ensureCatalogSeeded();
  if (includeInactive) {
    return db.allAsync(`SELECT * FROM currencies ORDER BY is_system DESC, code ASC`);
  }
  return db.allAsync(
    `SELECT * FROM currencies WHERE is_active = 1 ORDER BY is_system DESC, code ASC`
  );
}

async function listForChurch(churchId) {
  await ensureChurchCurrencies(churchId);
  const rows = await db.allAsync(
    `SELECT c.code, c.name, c.symbol, c.decimal_places, c.is_system, c.is_active,
            cc.is_default, cc.is_enabled
     FROM church_currencies cc
     JOIN currencies c ON c.code = cc.currency_code
     WHERE cc.church_id = ? AND cc.is_enabled = 1 AND c.is_active = 1
     ORDER BY cc.is_default DESC, c.is_system DESC, c.code ASC`,
    [churchId]
  );
  // Always expose USD + LRD even if somehow missing
  const codes = new Set(rows.map((r) => r.code));
  for (const code of SYSTEM_CODES) {
    if (!codes.has(code)) {
      const c = await db.getAsync(`SELECT * FROM currencies WHERE code = ?`, [code]);
      if (c) {
        rows.unshift({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          decimal_places: c.decimal_places,
          is_system: 1,
          is_active: 1,
          is_default: 0,
          is_enabled: 1
        });
      }
    }
  }
  return rows;
}

async function getDefaultCurrency(churchId) {
  await ensureChurchCurrencies(churchId);
  const row = await db.getAsync(
    `SELECT currency_code FROM church_currencies
     WHERE church_id = ? AND is_default = 1 AND is_enabled = 1`,
    [churchId]
  );
  if (row?.currency_code) return row.currency_code;
  const church = await db.getAsync(`SELECT currency FROM churches WHERE id = ?`, [churchId]);
  const fromChurch = normalizeCode(church?.currency);
  if (fromChurch && SYSTEM_CODES.includes(fromChurch)) return fromChurch;
  return 'USD';
}

async function isAllowedForChurch(churchId, code) {
  const c = normalizeCode(code);
  if (!c) return false;
  if (SYSTEM_CODES.includes(c)) return true;
  await ensureChurchCurrencies(churchId);
  const row = await db.getAsync(
    `SELECT cc.id FROM church_currencies cc
     JOIN currencies cur ON cur.code = cc.currency_code
     WHERE cc.church_id = ? AND cc.currency_code = ? AND cc.is_enabled = 1 AND cur.is_active = 1`,
    [churchId, c]
  );
  return !!row;
}

/**
 * Resolve + validate currency for a money write.
 * Returns { ok, currency, error }.
 */
async function resolveCurrency(churchId, requested) {
  const fallback = await getDefaultCurrency(churchId);
  const code = normalizeCode(requested) || fallback;
  if (!(await isAllowedForChurch(churchId, code))) {
    return {
      ok: false,
      currency: null,
      error: `Currency ${code} is not enabled for this church. Use USD, LRD, or an enabled currency.`
    };
  }
  return { ok: true, currency: code, error: null };
}

async function upsertCatalogCurrency({ code, name, symbol, decimalPlaces, isActive, createdByChurchId }) {
  const c = normalizeCode(code);
  if (!isValidCode(c)) {
    throw Object.assign(new Error('Currency code must be 3–8 letters (e.g. USD, LRD, EUR)'), {
      status: 400
    });
  }
  const existing = await db.getAsync(`SELECT * FROM currencies WHERE code = ?`, [c]);
  if (existing) {
    if (SYSTEM_CODES.includes(c)) {
      // Allow name/symbol polish only
      await db.runAsync(
        `UPDATE currencies SET
           name = COALESCE(?, name),
           symbol = COALESCE(?, symbol),
           decimal_places = COALESCE(?, decimal_places),
           is_active = 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE code = ?`,
        [name || null, symbol || null, decimalPlaces ?? null, c]
      );
    } else {
      await db.runAsync(
        `UPDATE currencies SET
           name = COALESCE(?, name),
           symbol = COALESCE(?, symbol),
           decimal_places = COALESCE(?, decimal_places),
           is_active = COALESCE(?, is_active),
           updated_at = CURRENT_TIMESTAMP
         WHERE code = ?`,
        [
          name || null,
          symbol || null,
          decimalPlaces ?? null,
          isActive == null ? null : isActive ? 1 : 0,
          c
        ]
      );
    }
  } else {
    await db.runAsync(
      `INSERT INTO currencies (code, name, symbol, decimal_places, is_system, is_active, created_by_church_id)
       VALUES (?, ?, ?, ?, 0, 1, ?)`,
      [
        c,
        name || c,
        symbol || c,
        decimalPlaces == null ? 2 : Number(decimalPlaces),
        createdByChurchId || null
      ]
    );
  }
  return db.getAsync(`SELECT * FROM currencies WHERE code = ?`, [c]);
}

async function deactivateCatalogCurrency(code) {
  const c = normalizeCode(code);
  if (SYSTEM_CODES.includes(c)) {
    throw Object.assign(new Error('System currencies USD and LRD cannot be removed'), { status: 400 });
  }
  await db.runAsync(
    `UPDATE currencies SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE code = ?`,
    [c]
  );
  return db.getAsync(`SELECT * FROM currencies WHERE code = ?`, [c]);
}

async function enableForChurch(churchId, code, { makeDefault = false } = {}) {
  const c = normalizeCode(code);
  const cur = await db.getAsync(`SELECT * FROM currencies WHERE code = ? AND is_active = 1`, [c]);
  if (!cur) {
    throw Object.assign(new Error(`Currency ${c} is not in the active catalog`), { status: 404 });
  }
  await ensureChurchCurrencies(churchId);
  await db.runAsync(
    `INSERT INTO church_currencies (church_id, currency_code, is_default, is_enabled)
     VALUES (?, ?, 0, 1)
     ON CONFLICT(church_id, currency_code) DO UPDATE SET is_enabled = 1`,
    [churchId, c]
  );
  if (makeDefault) {
    await setDefaultForChurch(churchId, c);
  }
  return listForChurch(churchId);
}

async function setDefaultForChurch(churchId, code) {
  const c = normalizeCode(code);
  if (!(await isAllowedForChurch(churchId, c))) {
    throw Object.assign(new Error(`Currency ${c} is not enabled for this church`), { status: 400 });
  }
  await db.runAsync(
    `UPDATE church_currencies SET is_default = CASE WHEN currency_code = ? THEN 1 ELSE 0 END
     WHERE church_id = ?`,
    [c, churchId]
  );
  await db.runAsync(`UPDATE churches SET currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    c,
    churchId
  ]);
  return getDefaultCurrency(churchId);
}

async function disableForChurch(churchId, code) {
  const c = normalizeCode(code);
  if (SYSTEM_CODES.includes(c)) {
    throw Object.assign(new Error('USD and LRD cannot be disabled'), { status: 400 });
  }
  const wasDefault = await db.getAsync(
    `SELECT is_default FROM church_currencies WHERE church_id = ? AND currency_code = ?`,
    [churchId, c]
  );
  await db.runAsync(
    `UPDATE church_currencies SET is_enabled = 0, is_default = 0
     WHERE church_id = ? AND currency_code = ?`,
    [churchId, c]
  );
  if (wasDefault?.is_default) {
    await setDefaultForChurch(churchId, 'USD');
  }
  return listForChurch(churchId);
}

/**
 * Church admin adds a currency: create in catalog if needed, enable for church.
 */
async function addCurrencyForChurch(churchId, { code, name, symbol, makeDefault }) {
  const row = await upsertCatalogCurrency({
    code,
    name,
    symbol,
    createdByChurchId: churchId
  });
  await enableForChurch(churchId, row.code, { makeDefault: !!makeDefault });
  return {
    currency: row,
    currencies: await listForChurch(churchId),
    defaultCurrency: await getDefaultCurrency(churchId)
  };
}

module.exports = {
  SYSTEM_CODES,
  normalizeCode,
  isValidCode,
  ensureCatalogSeeded,
  ensureChurchCurrencies,
  listCatalog,
  listForChurch,
  getDefaultCurrency,
  isAllowedForChurch,
  resolveCurrency,
  upsertCatalogCurrency,
  deactivateCatalogCurrency,
  enableForChurch,
  setDefaultForChurch,
  disableForChurch,
  addCurrencyForChurch
};
