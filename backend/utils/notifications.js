/**
 * Phase 24 notification helpers.
 */
const db = require('../database');

const TYPES = [
  'request',
  'approval',
  'member',
  'attendance',
  'collection',
  'report',
  'system',
  'assignment',
  'event',
  'birthday',
  'subscription',
  'announcement',
  'communication'
];

/**
 * Backward-compatible createNotification.
 * Extra optional args: churchId (8th) OR options object as last arg.
 */
async function createNotification(
  userId,
  userType,
  notificationType,
  title,
  message,
  referenceId = null,
  referenceType = null,
  churchIdOrOpts = null
) {
  try {
    let churchId = null;
    if (churchIdOrOpts && typeof churchIdOrOpts === 'object') {
      churchId = churchIdOrOpts.churchId ?? null;
    } else if (churchIdOrOpts != null) {
      churchId = churchIdOrOpts;
    }

    const type = TYPES.includes(notificationType) ? notificationType : 'system';

    if (churchId == null && userType === 'branch') {
      const row = await db.getAsync('SELECT church_id FROM branches WHERE id = ?', [userId]);
      churchId = row?.church_id || null;
    }

    await db.runAsync(
      `INSERT INTO notifications
        (church_id, user_id, user_type, notification_type, title, message, reference_id, reference_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        churchId,
        userId,
        userType || 'branch',
        type,
        title,
        message,
        referenceId,
        referenceType
      ]
    );
  } catch (error) {
    console.error('Create notification error:', error);
  }
}

async function listChurchAdminIds(churchId) {
  const rows = await db.allAsync(
    `SELECT id FROM branches WHERE church_id = ? AND isadmin = 1`,
    [churchId]
  );
  return rows.map(r => r.id);
}

async function notifyChurchAdmins(churchId, type, title, message, referenceId = null, referenceType = null) {
  const ids = await listChurchAdminIds(churchId);
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    await createNotification(id, 'branch', type, title, message, referenceId, referenceType, churchId);
  }
  return ids.length;
}

async function alreadyNotifiedToday(userId, userType, type, referenceType, referenceId) {
  const row = await db.getAsync(
    `SELECT id FROM notifications
     WHERE user_id = ? AND user_type = ? AND notification_type = ?
       AND IFNULL(reference_type,'') = IFNULL(?, '')
       AND IFNULL(reference_id, 0) = IFNULL(?, 0)
       AND date(created_at) = date('now')
     LIMIT 1`,
    [userId, userType, type, referenceType, referenceId]
  );
  return !!row;
}

/**
 * Generate birthday / upcoming-event / subscription notifications for a church.
 * Idempotent per day for the same reference.
 */
async function scanChurchNotifications(churchId) {
  const created = { birthdays: 0, events: 0, subscriptions: 0 };
  const admins = await listChurchAdminIds(churchId);
  if (!admins.length) return created;

  // Birthdays in next 7 days (parse YYYY-MM-DD; avoid Date timezone shifts)
  let members = [];
  try {
    members = await db.allAsync(
      `SELECT id, firstname, lastname, dob, branch_id
       FROM members
       WHERE church_id = ? AND dob IS NOT NULL AND length(dob) >= 8`,
      [churchId]
    );
  } catch (_) {
    members = [];
  }

  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const m of members) {
    const match = String(m.dob).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) continue;
    const month = Number(match[2]);
    const day = Number(match[3]);
    let next = new Date(todayLocal.getFullYear(), month - 1, day);
    if (next < todayLocal) {
      next = new Date(todayLocal.getFullYear() + 1, month - 1, day);
    }
    const days = Math.round((next - todayLocal) / 86400000);
    if (days < 0 || days > 7) continue;

    const title = days === 0 ? 'Birthday today' : `Birthday in ${days} day${days === 1 ? '' : 's'}`;
    const message =
      `${m.firstname || ''} ${m.lastname || ''}`.trim() +
      (days === 0 ? ' has a birthday today.' : ` has an upcoming birthday (${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}).`);

    for (const adminId of admins) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await alreadyNotifiedToday(adminId, 'branch', 'birthday', 'member', m.id);
      if (exists) continue;
      // eslint-disable-next-line no-await-in-loop
      await createNotification(
        adminId,
        'branch',
        'birthday',
        title,
        message,
        m.id,
        'member',
        churchId
      );
      created.birthdays += 1;
    }
  }

  // Upcoming events (next 7 days)
  let events = [];
  try {
    events = await db.allAsync(
      `SELECT e.id, e.title, e.date, e.time, b.branchname
       FROM events e
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE (e.church_id = ? OR e.branch_id IN (SELECT id FROM branches WHERE church_id = ?))
         AND date(e.date) >= date('now')
         AND date(e.date) <= date('now', '+7 days')
       ORDER BY e.date
       LIMIT 50`,
      [churchId, churchId]
    );
  } catch (_) {
    try {
      events = await db.allAsync(
        `SELECT e.id, e.title, e.date, e.time, b.branchname
         FROM events e
         JOIN branches b ON b.id = e.branch_id
         WHERE b.church_id = ?
           AND date(e.date) >= date('now')
           AND date(e.date) <= date('now', '+7 days')
         ORDER BY e.date LIMIT 50`,
        [churchId]
      );
    } catch (__) {
      events = [];
    }
  }

  for (const ev of events) {
    const when = String(ev.date).slice(0, 10) + (ev.time ? ` ${ev.time}` : '');
    for (const adminId of admins) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await alreadyNotifiedToday(adminId, 'branch', 'event', 'event', ev.id);
      if (exists) continue;
      // eslint-disable-next-line no-await-in-loop
      await createNotification(
        adminId,
        'branch',
        'event',
        'Upcoming event',
        `"${ev.title}" on ${when}${ev.branchname ? ` (${ev.branchname})` : ''}`,
        ev.id,
        'event',
        churchId
      );
      created.events += 1;
    }
  }

  // Subscription / church status warnings
  try {
    const church = await db.getAsync('SELECT id, name, status FROM churches WHERE id = ?', [churchId]);
    if (church && church.status && church.status !== 'active') {
      for (const adminId of admins) {
        // eslint-disable-next-line no-await-in-loop
        const exists = await alreadyNotifiedToday(
          adminId,
          'branch',
          'subscription',
          'church',
          churchId
        );
        if (exists) continue;
        // eslint-disable-next-line no-await-in-loop
        await createNotification(
          adminId,
          'branch',
          'subscription',
          'Subscription warning',
          `Church "${church.name}" status is ${church.status}. Contact platform support.`,
          churchId,
          'church',
          churchId
        );
        created.subscriptions += 1;
      }
    }
  } catch (_) {
    /* ignore */
  }

  return created;
}

module.exports = {
  TYPES,
  createNotification,
  notifyChurchAdmins,
  listChurchAdminIds,
  scanChurchNotifications,
  alreadyNotifiedToday
};
