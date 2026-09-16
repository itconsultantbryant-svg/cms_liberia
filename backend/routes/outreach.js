const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');
const { resolveAudience, AUDIENCE_TYPES } = require('../utils/audience');
const { createNotification } = require('./notifications');

router.use(authMiddleware, requireTenant, attachRoleInfo);

function userType(req) {
  return req.userType || req.user.userType || 'branch';
}

function parseChannels(raw, body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return {
      in_app: body.in_app !== false,
      email: !!body.email,
      sms: !!body.sms,
      whatsapp: !!body.whatsapp
    };
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_) { /* fallthrough */ }
  }
  return { in_app: true, email: false, sms: false, whatsapp: false };
}

async function getChannelSettings(churchId) {
  let row = await db.getAsync(
    'SELECT * FROM communication_channel_settings WHERE church_id = ?',
    [churchId]
  );
  if (!row) {
    await db.runAsync(
      'INSERT INTO communication_channel_settings (church_id) VALUES (?)',
      [churchId]
    );
    row = await db.getAsync(
      'SELECT * FROM communication_channel_settings WHERE church_id = ?',
      [churchId]
    );
  }
  return row;
}

function channelReadiness(settings, channels) {
  return {
    in_app: { requested: !!channels.in_app, ready: true },
    email: {
      requested: !!channels.email,
      ready: !!(settings.email_enabled && settings.email_provider_ready)
    },
    sms: {
      requested: !!channels.sms,
      ready: !!(settings.sms_enabled && settings.sms_provider_ready)
    },
    whatsapp: {
      requested: !!channels.whatsapp,
      ready: !!(settings.whatsapp_enabled && settings.whatsapp_provider_ready)
    }
  };
}

router.get('/meta', requirePermission('communications.manage'), (req, res) => {
  res.json({
    audienceTypes: AUDIENCE_TYPES,
    channels: ['in_app', 'email', 'sms', 'whatsapp'],
    reminderTypes: ['event_reminder', 'birthday', 'follow_up']
  });
});

/** Channel readiness (email/SMS/WhatsApp) */
router.get('/channels', requirePermission('communications.manage', 'settings.manage'), async (req, res) => {
  try {
    const settings = await getChannelSettings(req.churchId);
    res.json({
      settings,
      readiness: {
        email: !!(settings.email_enabled && settings.email_provider_ready),
        sms: !!(settings.sms_enabled && settings.sms_provider_ready),
        whatsapp: !!(settings.whatsapp_enabled && settings.whatsapp_provider_ready),
        in_app: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/channels', requirePermission('communications.manage', 'settings.manage'), async (req, res) => {
  try {
    await getChannelSettings(req.churchId);
    const fields = {
      email_enabled: req.body.emailEnabled,
      email_provider_ready: req.body.emailProviderReady,
      email_from: req.body.emailFrom,
      sms_enabled: req.body.smsEnabled,
      sms_provider_ready: req.body.smsProviderReady,
      whatsapp_enabled: req.body.whatsappEnabled,
      whatsapp_provider_ready: req.body.whatsappProviderReady
    };
    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        values.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.churchId);
    await db.runAsync(
      `UPDATE communication_channel_settings SET ${updates.join(', ')} WHERE church_id = ?`,
      values
    );
    res.json({ message: 'Channel settings updated', settings: await getChannelSettings(req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates', requirePermission('communications.manage'), async (req, res) => {
  try {
    const templates = await db.allAsync(
      `SELECT * FROM message_templates
       WHERE church_id IS NULL OR church_id = ?
       ORDER BY church_id NULLS FIRST, id`,
      [req.churchId]
    );
    res.json({ templates });
  } catch (error) {
    // SQLite may not like NULLS FIRST
    try {
      const templates = await db.allAsync(
        `SELECT * FROM message_templates
         WHERE church_id IS NULL OR church_id = ?
         ORDER BY id`,
        [req.churchId]
      );
      res.json({ templates });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
});

router.post('/audience/preview', requirePermission('communications.manage'), async (req, res) => {
  try {
    const resolved = await resolveAudience({
      churchId: req.churchId,
      branchId: req.user.branchId,
      audienceType: req.body.audienceType,
      audienceRefId: req.body.audienceRefId,
      audienceMemberIds: req.body.audienceMemberIds
    });
    res.json(resolved);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/announcements', requirePermission('communications.manage'), async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM church_announcements
       WHERE church_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.churchId]
    );
    res.json({ announcements: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/announcements', requirePermission('communications.manage'), async (req, res) => {
  try {
    const {
      title,
      body,
      audienceType,
      audienceRefId,
      audienceMemberIds,
      channels: ch,
      status,
      scheduledAt,
      eventId
    } = req.body;
    if (!title || !body || !audienceType) {
      return res.status(400).json({ error: 'title, body, audienceType required' });
    }
    if (!AUDIENCE_TYPES.includes(audienceType)) {
      return res.status(400).json({ error: 'Invalid audience type' });
    }

    const channels = parseChannels(null, ch);
    const result = await db.runAsync(
      `INSERT INTO church_announcements (
        church_id, branch_id, title, body, audience_type, audience_ref_id, audience_member_ids,
        channels, status, scheduled_at, event_id, created_by, created_by_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        req.user.branchId,
        title,
        body,
        audienceType,
        audienceRefId || null,
        audienceMemberIds ? JSON.stringify(audienceMemberIds) : null,
        JSON.stringify(channels),
        status === 'scheduled' ? 'scheduled' : 'draft',
        scheduledAt || null,
        eventId || null,
        req.user.id,
        userType(req)
      ]
    );

    res.status(201).json({
      message: 'Announcement created',
      id: result.lastID,
      announcement: await db.getAsync('SELECT * FROM church_announcements WHERE id = ?', [result.lastID])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/announcements/:id/send', requirePermission('communications.manage'), async (req, res) => {
  try {
    const ann = await db.getAsync(
      'SELECT * FROM church_announcements WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!ann) return res.status(404).json({ error: 'Not found' });
    if (ann.status === 'sent') return res.status(400).json({ error: 'Already sent' });

    const channels = parseChannels(ann.channels);
    const settings = await getChannelSettings(req.churchId);
    const readiness = channelReadiness(settings, channels);

    let memberIds = [];
    try {
      memberIds = ann.audience_member_ids ? JSON.parse(ann.audience_member_ids) : [];
    } catch (_) {
      memberIds = [];
    }

    const resolved = await resolveAudience({
      churchId: req.churchId,
      branchId: ann.branch_id || req.user.branchId,
      audienceType: ann.audience_type,
      audienceRefId: ann.audience_ref_id,
      audienceMemberIds: memberIds
    });

    const deliveries = [];
    for (const recipient of resolved.recipients) {
      if (channels.in_app && readiness.in_app.ready) {
        await db.runAsync(
          `INSERT INTO announcement_deliveries
           (church_id, announcement_id, member_id, channel, status, detail)
           VALUES (?, ?, ?, 'in_app', 'delivered', ?)`,
          [req.churchId, ann.id, recipient.recipientKind === 'member' ? recipient.id : null, 'In-app queued']
        );
        deliveries.push({ channel: 'in_app', recipient: recipient.id });
      }
      for (const channel of ['email', 'sms', 'whatsapp']) {
        if (!channels[channel]) continue;
        const ready = readiness[channel].ready;
        const hasContact =
          channel === 'email' ? !!recipient.email : !!recipient.phone;
        const status = ready && hasContact ? 'ready' : 'skipped';
        const detail = !ready
          ? `${channel} provider not ready`
          : !hasContact
            ? `No ${channel === 'email' ? 'email' : 'phone'} on recipient`
            : `${channel} ready for dispatch`;
        await db.runAsync(
          `INSERT INTO announcement_deliveries
           (church_id, announcement_id, member_id, channel, status, detail)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            req.churchId,
            ann.id,
            recipient.recipientKind === 'member' ? recipient.id : null,
            channel,
            status,
            detail
          ]
        );
        deliveries.push({ channel, status, recipient: recipient.id });
      }
    }

    // Notify branch login (in-app) for church-wide awareness
    await createNotification(
      req.user.id,
      userType(req),
      'announcement',
      ann.title,
      `Announcement sent to ${resolved.counts.total} recipient(s)`,
      ann.id,
      'church_announcement'
    );

    await db.runAsync(
      `UPDATE church_announcements
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, recipient_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resolved.counts.total, ann.id]
    );

    res.json({
      message: 'Announcement processed',
      recipientCount: resolved.counts.total,
      readiness,
      deliveryCount: deliveries.length,
      announcement: await db.getAsync('SELECT * FROM church_announcements WHERE id = ?', [ann.id])
    });
  } catch (error) {
    console.error('Send announcement:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/announcements/:id', requirePermission('communications.manage'), async (req, res) => {
  try {
    const ann = await db.getAsync(
      'SELECT * FROM church_announcements WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!ann) return res.status(404).json({ error: 'Not found' });
    const deliveries = await db.allAsync(
      'SELECT * FROM announcement_deliveries WHERE announcement_id = ? ORDER BY id DESC LIMIT 200',
      [ann.id]
    );
    res.json({ announcement: ann, deliveries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Scan & enqueue reminders: events, birthdays, follow-ups */
router.post('/reminders/scan', requirePermission('communications.manage'), async (req, res) => {
  try {
    const settings = await getChannelSettings(req.churchId);
    const channels = {
      in_app: true,
      email: !!(settings.email_enabled && settings.email_provider_ready),
      sms: !!(settings.sms_enabled && settings.sms_provider_ready),
      whatsapp: !!(settings.whatsapp_enabled && settings.whatsapp_provider_ready)
    };
    const channelJson = JSON.stringify(channels);
    let created = 0;
    const today = new Date().toISOString().slice(0, 10);
    const mmdd = today.slice(5);

    // Event reminders
    const events = await db.allAsync(
      `SELECT * FROM events
       WHERE (church_id = ? OR branch_id IN (SELECT id FROM branches WHERE church_id = ?))
         AND reminder_enabled = 1
         AND COALESCE(status, 'published') = 'published'
         AND date >= date('now')`,
      [req.churchId, req.churchId]
    );
    for (const ev of events) {
      const existing = await db.getAsync(
        `SELECT id FROM reminder_queue
         WHERE church_id = ? AND reminder_type = 'event_reminder' AND reference_id = ? AND status = 'ready'`,
        [req.churchId, ev.id]
      );
      if (existing) continue;
      await db.runAsync(
        `INSERT INTO reminder_queue
         (church_id, branch_id, reminder_type, reference_id, reference_type, title, message, due_at, status, channels, payload)
         VALUES (?, ?, 'event_reminder', ?, 'event', ?, ?, ?, 'ready', ?, ?)`,
        [
          req.churchId,
          ev.branch_id,
          ev.id,
          `Event: ${ev.title}`,
          `${ev.title} on ${ev.date}${ev.time ? ' at ' + ev.time : ''}${ev.venue || ev.location ? ' @ ' + (ev.venue || ev.location) : ''}`,
          ev.date,
          channelJson,
          JSON.stringify({ eventId: ev.id, hoursBefore: ev.reminder_hours_before })
        ]
      );
      created++;
    }

    // Birthdays (today)
    const birthdays = await db.allAsync(
      `SELECT id, firstname, lastname, branch_id, dob FROM members
       WHERE church_id = ? AND dob IS NOT NULL AND substr(dob, 6, 5) = ?`,
      [req.churchId, mmdd]
    );
    for (const m of birthdays) {
      const existing = await db.getAsync(
        `SELECT id FROM reminder_queue
         WHERE church_id = ? AND reminder_type = 'birthday' AND reference_id = ? AND due_at = ?`,
        [req.churchId, m.id, today]
      );
      if (existing) continue;
      await db.runAsync(
        `INSERT INTO reminder_queue
         (church_id, branch_id, reminder_type, reference_id, reference_type, title, message, due_at, status, channels, payload)
         VALUES (?, ?, 'birthday', ?, 'member', ?, ?, ?, 'ready', ?, ?)`,
        [
          req.churchId,
          m.branch_id,
          m.id,
          `Birthday: ${m.firstname} ${m.lastname}`,
          `Wish ${m.firstname} ${m.lastname} a happy birthday today.`,
          today,
          channelJson,
          JSON.stringify({ memberId: m.id })
        ]
      );
      created++;
    }

    // Pastoral follow-ups due
    try {
      const followUps = await db.allAsync(
        `SELECT id, title, branch_id, follow_up_date, member_id, subject_name
         FROM pastoral_cases
         WHERE church_id = ? AND status != 'closed'
           AND follow_up_date IS NOT NULL AND follow_up_date <= ?`,
        [req.churchId, today]
      );
      for (const c of followUps) {
        const existing = await db.getAsync(
          `SELECT id FROM reminder_queue
           WHERE church_id = ? AND reminder_type = 'follow_up' AND reference_id = ? AND status = 'ready'`,
          [req.churchId, c.id]
        );
        if (existing) continue;
        await db.runAsync(
          `INSERT INTO reminder_queue
           (church_id, branch_id, reminder_type, reference_id, reference_type, title, message, due_at, status, channels, payload)
           VALUES (?, ?, 'follow_up', ?, 'pastoral_case', ?, ?, ?, 'ready', ?, ?)`,
          [
            req.churchId,
            c.branch_id,
            c.id,
            `Follow-up: ${c.title}`,
            `Pastoral follow-up due for ${c.subject_name || 'case #' + c.id}`,
            c.follow_up_date,
            channelJson,
            JSON.stringify({ caseId: c.id, memberId: c.member_id })
          ]
        );
        created++;
      }
    } catch (_) {
      /* pastoral table may be missing in odd envs */
    }

    res.json({ message: 'Reminder scan complete', created, channels });
  } catch (error) {
    console.error('Reminder scan:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reminders', requirePermission('communications.manage'), async (req, res) => {
  try {
    const status = req.query.status || 'ready';
    const reminders = await db.allAsync(
      `SELECT * FROM reminder_queue
       WHERE church_id = ? AND (? = 'all' OR status = ?)
       ORDER BY due_at ASC, id DESC
       LIMIT 100`,
      [req.churchId, status, status]
    );
    res.json({ reminders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reminders/:id/dispatch', requirePermission('communications.manage'), async (req, res) => {
  try {
    const rem = await db.getAsync(
      'SELECT * FROM reminder_queue WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!rem) return res.status(404).json({ error: 'Not found' });
    if (rem.status === 'sent') return res.status(400).json({ error: 'Already sent' });

    const settings = await getChannelSettings(req.churchId);
    const channels = parseChannels(rem.channels);
    const readiness = channelReadiness(settings, channels);

    await createNotification(
      req.user.id,
      userType(req),
      rem.reminder_type,
      rem.title,
      rem.message,
      rem.reference_id,
      rem.reference_type
    );

    await db.runAsync(
      `UPDATE reminder_queue SET status = 'sent', processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [rem.id]
    );

    res.json({
      message: 'Reminder dispatched (in-app); external channels marked by readiness',
      readiness,
      reminder: await db.getAsync('SELECT * FROM reminder_queue WHERE id = ?', [rem.id])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
