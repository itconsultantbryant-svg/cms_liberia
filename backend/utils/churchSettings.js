/**
 * Phase 28 church settings helpers.
 */
const db = require('../database');

const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MMM-YYYY'];

const PROFILE_FIELDS = [
  'name',
  'short_name',
  'email',
  'phone',
  'country',
  'city',
  'address',
  'website_url',
  'currency',
  'timezone'
];

const SETTINGS_FIELDS = [
  'fiscal_year_start_month',
  'date_format',
  'membership_number_prefix',
  'membership_number_padding',
  'membership_number_next',
  'receipt_number_prefix',
  'receipt_number_include_year',
  'receipt_number_padding',
  'receipt_number_next',
  'notify_birthdays',
  'notify_events',
  'notify_approvals',
  'notify_membership'
];

function parseLocked(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (_) {
    return [];
  }
}

async function ensureSettings(churchId) {
  let row = await db.getAsync('SELECT * FROM church_settings WHERE church_id = ?', [churchId]);
  if (!row) {
    await db.runAsync('INSERT INTO church_settings (church_id) VALUES (?)', [churchId]);
    row = await db.getAsync('SELECT * FROM church_settings WHERE church_id = ?', [churchId]);
  }
  return row;
}

async function getChurchSettingsBundle(churchId) {
  const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [churchId]);
  if (!church) return null;
  const settings = await ensureSettings(churchId);
  return {
    church: {
      id: church.id,
      name: church.name,
      shortName: church.short_name,
      email: church.email,
      phone: church.phone,
      country: church.country,
      city: church.city,
      address: church.address,
      websiteUrl: church.website_url,
      currency: church.currency,
      timezone: church.timezone,
      primaryColor: church.primary_color,
      secondaryColor: church.secondary_color,
      logoUrl: church.logo_url,
      status: church.status
    },
    settings: {
      fiscalYearStartMonth: settings.fiscal_year_start_month,
      dateFormat: settings.date_format,
      membershipNumberPrefix: settings.membership_number_prefix,
      membershipNumberPadding: settings.membership_number_padding,
      membershipNumberNext: settings.membership_number_next,
      receiptNumberPrefix: settings.receipt_number_prefix,
      receiptNumberIncludeYear: !!settings.receipt_number_include_year,
      receiptNumberPadding: settings.receipt_number_padding,
      receiptNumberNext: settings.receipt_number_next,
      notifyBirthdays: !!settings.notify_birthdays,
      notifyEvents: !!settings.notify_events,
      notifyApprovals: !!settings.notify_approvals,
      notifyMembership: !!settings.notify_membership,
      lockedFields: parseLocked(settings.locked_fields)
    },
    meta: {
      dateFormats: DATE_FORMATS,
      links: {
        branding: '/settings/branding',
        branches: '/branches',
        workflows: '/workflows',
        admins: '/settings/admins'
      }
    }
  };
}

async function updateChurchSettings(churchId, body, { isSuperadmin = false } = {}) {
  const settings = await ensureSettings(churchId);
  const locked = new Set(parseLocked(settings.locked_fields));

  // Superadmin may update locked_fields list
  if (isSuperadmin && body.lockedFields !== undefined) {
    const nextLocked = Array.isArray(body.lockedFields)
      ? body.lockedFields.map(String)
      : parseLocked(body.lockedFields);
    await db.runAsync(
      `UPDATE church_settings SET locked_fields = ?, updated_at = CURRENT_TIMESTAMP WHERE church_id = ?`,
      [JSON.stringify(nextLocked), churchId]
    );
  }

  const fresh = await ensureSettings(churchId);
  const lockedNow = new Set(parseLocked(fresh.locked_fields));

  const churchSets = [];
  const churchParams = [];
  const churchMap = {
    name: body.name,
    short_name: body.shortName ?? body.short_name,
    email: body.email,
    phone: body.phone,
    country: body.country,
    city: body.city,
    address: body.address,
    website_url: body.websiteUrl ?? body.website_url,
    currency: body.currency,
    timezone: body.timezone
  };

  for (const [col, val] of Object.entries(churchMap)) {
    if (val === undefined) continue;
    if (!isSuperadmin && lockedNow.has(col)) {
      throw Object.assign(new Error(`Field "${col}" is locked by Superadmin`), { status: 403 });
    }
    churchSets.push(`${col} = ?`);
    churchParams.push(val);
  }

  if (churchSets.length) {
    churchSets.push('updated_at = CURRENT_TIMESTAMP');
    churchParams.push(churchId);
    await db.runAsync(
      `UPDATE churches SET ${churchSets.join(', ')} WHERE id = ?`,
      churchParams
    );
  }

  const settingsMap = {
    fiscal_year_start_month: body.fiscalYearStartMonth ?? body.fiscal_year_start_month,
    date_format: body.dateFormat ?? body.date_format,
    membership_number_prefix: body.membershipNumberPrefix ?? body.membership_number_prefix,
    membership_number_padding: body.membershipNumberPadding ?? body.membership_number_padding,
    membership_number_next: body.membershipNumberNext ?? body.membership_number_next,
    receipt_number_prefix: body.receiptNumberPrefix ?? body.receipt_number_prefix,
    receipt_number_include_year:
      body.receiptNumberIncludeYear ?? body.receipt_number_include_year,
    receipt_number_padding: body.receiptNumberPadding ?? body.receipt_number_padding,
    receipt_number_next: body.receiptNumberNext ?? body.receipt_number_next,
    notify_birthdays: body.notifyBirthdays ?? body.notify_birthdays,
    notify_events: body.notifyEvents ?? body.notify_events,
    notify_approvals: body.notifyApprovals ?? body.notify_approvals,
    notify_membership: body.notifyMembership ?? body.notify_membership
  };

  const setSets = [];
  const setParams = [];
  for (const [col, val] of Object.entries(settingsMap)) {
    if (val === undefined) continue;
    if (!isSuperadmin && lockedNow.has(col)) {
      throw Object.assign(new Error(`Field "${col}" is locked by Superadmin`), { status: 403 });
    }
    let v = val;
    if (col === 'date_format' && !DATE_FORMATS.includes(String(v))) {
      throw Object.assign(new Error(`Invalid date format`), { status: 400 });
    }
    if (col === 'fiscal_year_start_month') {
      v = Number(v);
      if (!Number.isInteger(v) || v < 1 || v > 12) {
        throw Object.assign(new Error('fiscalYearStartMonth must be 1-12'), { status: 400 });
      }
    }
    if (
      [
        'notify_birthdays',
        'notify_events',
        'notify_approvals',
        'notify_membership',
        'receipt_number_include_year'
      ].includes(col)
    ) {
      v = v === false || v === 0 || v === '0' ? 0 : 1;
    }
    if (
      [
        'membership_number_padding',
        'membership_number_next',
        'receipt_number_padding',
        'receipt_number_next'
      ].includes(col)
    ) {
      v = Math.max(1, Number(v) || 1);
    }
    setSets.push(`${col} = ?`);
    setParams.push(v);
  }

  if (setSets.length) {
    setSets.push('updated_at = CURRENT_TIMESTAMP');
    setParams.push(churchId);
    await db.runAsync(
      `UPDATE church_settings SET ${setSets.join(', ')} WHERE church_id = ?`,
      setParams
    );
  }

  return getChurchSettingsBundle(churchId);
}

async function allocateMembershipNumber(churchId) {
  const settings = await ensureSettings(churchId);
  const next = Number(settings.membership_number_next) || 1;
  const pad = Math.min(12, Math.max(1, Number(settings.membership_number_padding) || 5));
  const prefix = settings.membership_number_prefix || 'M';
  const number = `${prefix}${String(next).padStart(pad, '0')}`;
  await db.runAsync(
    `UPDATE church_settings SET membership_number_next = ?, updated_at = CURRENT_TIMESTAMP
     WHERE church_id = ?`,
    [next + 1, churchId]
  );
  return number;
}

async function allocateReceiptNumber(churchId) {
  const settings = await ensureSettings(churchId);
  const next = Number(settings.receipt_number_next) || 1;
  const pad = Math.min(12, Math.max(1, Number(settings.receipt_number_padding) || 5));
  const prefix = settings.receipt_number_prefix || 'RCP';
  const yearPart = settings.receipt_number_include_year
    ? `-${new Date().getFullYear()}-`
    : '-';
  const number = `${prefix}${yearPart}${String(next).padStart(pad, '0')}`;
  await db.runAsync(
    `UPDATE church_settings SET receipt_number_next = ?, updated_at = CURRENT_TIMESTAMP
     WHERE church_id = ?`,
    [next + 1, churchId]
  );
  return number;
}

module.exports = {
  DATE_FORMATS,
  PROFILE_FIELDS,
  SETTINGS_FIELDS,
  ensureSettings,
  getChurchSettingsBundle,
  updateChurchSettings,
  allocateMembershipNumber,
  allocateReceiptNumber,
  parseLocked
};
