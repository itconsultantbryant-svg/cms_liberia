const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');

router.use(authMiddleware, requireTenant, attachRoleInfo);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/events');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const EVENT_TYPES = [
  'service',
  'conference',
  'retreat',
  'training',
  'meeting',
  'baptism',
  'wedding',
  'funeral',
  'community',
  'custom'
];

const STATUSES = ['draft', 'published', 'cancelled', 'completed'];

async function getEvent(id, churchId) {
  return db.getAsync(
    `SELECT e.*, g.name as ministry_name,
      m.firstname as organizer_firstname, m.lastname as organizer_lastname
     FROM events e
     LEFT JOIN groups g ON g.id = e.group_id
     LEFT JOIN members m ON m.id = e.organizer_member_id
     WHERE e.id = ? AND (
       e.church_id = ? OR e.branch_id IN (SELECT id FROM branches WHERE church_id = ?)
     )`,
    [id, churchId, churchId]
  );
}

function mapEvent(row) {
  if (!row) return null;
  return {
    ...row,
    start_time: row.time,
    venue: row.venue || row.location,
    organizer_name: row.organizer_name || row.by_who,
    description: row.details
  };
}

router.get('/meta', (req, res) => {
  res.json({
    eventTypes: EVENT_TYPES,
    statuses: STATUSES,
    registrationStatuses: ['registered', 'waitlist', 'cancelled']
  });
});

/** Calendar feed: events in date range */
router.get('/calendar', async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const toDate = new Date(from);
    toDate.setMonth(toDate.getMonth() + 1);
    const to = req.query.to || toDate.toISOString().slice(0, 10);

    let sql = `
      SELECT e.*, g.name as ministry_name,
        (SELECT COUNT(*) FROM event_registrations er
          WHERE er.event_id = e.id AND er.status = 'registered') as registration_count
      FROM events e
      LEFT JOIN groups g ON g.id = e.group_id
      WHERE (e.church_id = ? OR e.branch_id IN (SELECT id FROM branches WHERE church_id = ?))
        AND e.date <= ? AND COALESCE(e.end_date, e.date) >= ?
        AND COALESCE(e.status, 'published') != 'cancelled'`;
    const params = [req.churchId, req.churchId, to, from];

    if (!(req.user?.isadmin && req.query.allBranches === '1')) {
      sql += ' AND e.branch_id = ?';
      params.push(req.user.branchId);
    }
    if (req.query.eventType) {
      sql += ' AND e.event_type = ?';
      params.push(req.query.eventType);
    }
    sql += ' ORDER BY e.date ASC, e.time ASC';

    const events = await db.allAsync(sql, params);
    res.json({ events: events.map(mapEvent), from, to });
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Reminders due soon (readiness for notification phase) */
router.get('/reminders/due', async (req, res) => {
  try {
    const hours = Number(req.query.withinHours || 48);
    const now = new Date();
    const until = new Date(now.getTime() + hours * 3600 * 1000);

    const events = await db.allAsync(
      `SELECT e.* FROM events e
       WHERE (e.church_id = ? OR e.branch_id IN (SELECT id FROM branches WHERE church_id = ?))
         AND e.branch_id = ?
         AND e.reminder_enabled = 1
         AND COALESCE(e.status, 'published') = 'published'
         AND e.date >= date('now')
       ORDER BY e.date, e.time`,
      [req.churchId, req.churchId, req.user.branchId]
    );

    const due = events.filter(e => {
      const start = new Date(`${e.date}T${e.time || '00:00'}:00`);
      if (Number.isNaN(start.getTime())) return false;
      const remindAt = new Date(
        start.getTime() - (Number(e.reminder_hours_before || 24) * 3600 * 1000)
      );
      return remindAt <= until && start >= now;
    });

    res.json({ reminders: due.map(mapEvent), withinHours: hours });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy announcements (keep before /:id)
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await db.allAsync(
      'SELECT * FROM announcements WHERE branch_id = ? ORDER BY id DESC',
      [req.user.branchId]
    );
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/announcement', requirePermission('events.manage', 'communications.manage'), async (req, res) => {
  try {
    const { message, by_who, date, sdate, time, stime } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(date).toISOString().split('T')[0];
    const stopDate = new Date(sdate).toISOString().split('T')[0];
    if (startDate < today || stopDate < startDate) {
      return res.status(400).json({ error: 'Only future dates allowed' });
    }
    await db.runAsync(
      `INSERT INTO announcements (branch_id, details, by_who, start_date, stop_date, start_time, stop_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.branchId, message, by_who, startDate, stopDate, time || '', stime || '']
    );
    res.json({ message: 'Announcement successfully saved' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** List events */
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT e.*, g.name as ministry_name,
        (SELECT COUNT(*) FROM event_registrations er
          WHERE er.event_id = e.id AND er.status = 'registered') as registration_count,
        (SELECT COUNT(*) FROM event_registrations er
          WHERE er.event_id = e.id AND er.attended = 1) as attendance_count
      FROM events e
      LEFT JOIN groups g ON g.id = e.group_id
      WHERE (e.church_id = ? OR e.branch_id IN (SELECT id FROM branches WHERE church_id = ?))`;
    const params = [req.churchId, req.churchId];

    if (!(req.user?.isadmin && req.query.allBranches === '1')) {
      sql += ' AND e.branch_id = ?';
      params.push(req.user.branchId);
    }
    if (req.query.eventType) {
      sql += ' AND e.event_type = ?';
      params.push(req.query.eventType);
    }
    if (req.query.status) {
      sql += " AND COALESCE(e.status, 'published') = ?";
      params.push(req.query.status);
    } else if (req.query.includeCancelled !== '1') {
      sql += " AND COALESCE(e.status, 'published') != 'cancelled'";
    }
    if (req.query.from) {
      sql += ' AND COALESCE(e.end_date, e.date) >= ?';
      params.push(req.query.from);
    }
    if (req.query.to) {
      sql += ' AND e.date <= ?';
      params.push(req.query.to);
    }
    if (req.query.groupId) {
      sql += ' AND e.group_id = ?';
      params.push(req.query.groupId);
    }
    if (req.query.upcoming === '1') {
      sql += " AND e.date >= date('now')";
    }

    sql += ' ORDER BY e.date ASC, e.time ASC';

    const events = await db.allAsync(sql, params);
    res.json({ events: events.map(mapEvent) });
  } catch (error) {
    console.error('List events error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function createEvent(req, res) {
  try {
    const {
      title,
      location,
      venue,
      time,
      startTime,
      endTime,
      endDate,
      by_who,
      organizerName,
      organizerMemberId,
      details,
      description,
      date,
      assign,
      eventType,
      groupId,
      status,
      registrationEnabled,
      registrationCapacity,
      registrationDeadline,
      reminderEnabled,
      reminderHoursBefore,
      isAllDay
    } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'title and date are required' });
    }

    const dateStr = String(date).slice(0, 10);
    const endDateStr = endDate ? String(endDate).slice(0, 10) : dateStr;
    const start = startTime || time || null;
    const loc = venue || location || '';
    const organizer = organizerName || by_who || '';
    const desc = description || details || '';
    const type = EVENT_TYPES.includes(eventType) ? eventType : 'custom';
    const st = STATUSES.includes(status) ? status : 'published';
    const assignTo = Array.isArray(assign) ? assign.join(',') : assign || '';

    if (groupId) {
      const group = await db.getAsync(
        `SELECT id FROM groups WHERE id = ? AND (
          church_id = ? OR branch_id IN (SELECT id FROM branches WHERE church_id = ?)
        )`,
        [groupId, req.churchId, req.churchId]
      );
      if (!group) return res.status(400).json({ error: 'Invalid ministry/group' });
    }

    const result = await db.runAsync(
      `INSERT INTO events (
        branch_id, church_id, title, location, venue, time, end_time, end_date,
        assign_to, by_who, organizer_name, organizer_member_id, details,
        date, event_type, group_id, status,
        registration_enabled, registration_capacity, registration_deadline,
        reminder_enabled, reminder_hours_before, is_all_day, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.branchId,
        req.churchId,
        title,
        loc,
        loc,
        start,
        endTime || null,
        endDateStr,
        assignTo,
        organizer,
        organizer,
        organizerMemberId || null,
        desc,
        dateStr,
        type,
        groupId || null,
        st,
        registrationEnabled ? 1 : 0,
        registrationCapacity ? Number(registrationCapacity) : null,
        registrationDeadline || null,
        reminderEnabled ? 1 : 0,
        Number(reminderHoursBefore || 24),
        isAllDay ? 1 : 0,
        req.user.id
      ]
    );

    res.status(201).json({
      message: 'Event successfully saved',
      id: result.lastID,
      event: mapEvent(await getEvent(result.lastID, req.churchId))
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: error.message });
  }
}

router.post('/', requirePermission('events.manage'), createEvent);
router.post('/create', requirePermission('events.manage'), createEvent);

router.get('/:id', async (req, res) => {
  try {
    const event = await getEvent(req.params.id, req.churchId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const registrations = await db.allAsync(
      `SELECT er.*, m.firstname, m.lastname, m.email as member_email, m.phone as member_phone
       FROM event_registrations er
       LEFT JOIN members m ON m.id = er.member_id
       WHERE er.event_id = ? AND er.church_id = ?
       ORDER BY er.registered_at DESC`,
      [event.id, req.churchId]
    );
    const attachments = await db.allAsync(
      `SELECT * FROM event_attachments WHERE event_id = ? AND church_id = ? ORDER BY created_at DESC`,
      [event.id, req.churchId]
    );

    res.json({
      event: mapEvent(event),
      registrations,
      attachments,
      stats: {
        registered: registrations.filter(r => r.status === 'registered').length,
        waitlist: registrations.filter(r => r.status === 'waitlist').length,
        attended: registrations.filter(r => r.attended).length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('events.manage'), async (req, res) => {
  try {
    const event = await getEvent(req.params.id, req.churchId);
    if (!event) return res.status(404).json({ error: 'Not found' });

    const fields = {
      title: req.body.title,
      location: req.body.venue || req.body.location,
      venue: req.body.venue || req.body.location,
      time: req.body.startTime || req.body.time,
      end_time: req.body.endTime,
      end_date: req.body.endDate,
      by_who: req.body.organizerName || req.body.by_who,
      organizer_name: req.body.organizerName || req.body.by_who,
      organizer_member_id: req.body.organizerMemberId,
      details: req.body.description || req.body.details,
      date: req.body.date,
      event_type: req.body.eventType,
      group_id: req.body.groupId,
      status: req.body.status,
      registration_enabled:
        req.body.registrationEnabled != null ? (req.body.registrationEnabled ? 1 : 0) : undefined,
      registration_capacity: req.body.registrationCapacity,
      registration_deadline: req.body.registrationDeadline,
      reminder_enabled:
        req.body.reminderEnabled != null ? (req.body.reminderEnabled ? 1 : 0) : undefined,
      reminder_hours_before: req.body.reminderHoursBefore,
      is_all_day: req.body.isAllDay != null ? (req.body.isAllDay ? 1 : 0) : undefined
    };

    if (fields.event_type && !EVENT_TYPES.includes(fields.event_type)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }
    if (fields.status && !STATUSES.includes(fields.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });

    values.push(event.id);
    await db.runAsync(`UPDATE events SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    res.json({ message: 'Updated', event: mapEvent(await getEvent(event.id, req.churchId)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/register', async (req, res) => {
  try {
    const event = await getEvent(req.params.id, req.churchId);
    if (!event) return res.status(404).json({ error: 'Not found' });
    if (!event.registration_enabled) {
      return res.status(400).json({ error: 'Registration is not enabled for this event' });
    }
    if (event.status === 'cancelled' || event.status === 'completed') {
      return res.status(400).json({ error: 'Event is not open for registration' });
    }
    if (event.registration_deadline) {
      const today = new Date().toISOString().slice(0, 10);
      if (today > event.registration_deadline) {
        return res.status(400).json({ error: 'Registration deadline has passed' });
      }
    }

    const memberId = req.body.memberId || req.body.member_id || null;
    const guestName = req.body.guestName || req.body.guest_name || null;
    if (!memberId && !guestName) {
      return res.status(400).json({ error: 'memberId or guestName required' });
    }

    if (memberId) {
      const member = await db.getAsync('SELECT id FROM members WHERE id = ? AND church_id = ?', [
        memberId,
        req.churchId
      ]);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      const existing = await db.getAsync(
        `SELECT id FROM event_registrations WHERE event_id = ? AND member_id = ? AND status != 'cancelled'`,
        [event.id, memberId]
      );
      if (existing) return res.status(400).json({ error: 'Already registered' });
    }

    const registeredCount = await db.getAsync(
      `SELECT COUNT(*) as c FROM event_registrations WHERE event_id = ? AND status = 'registered'`,
      [event.id]
    );
    let status = 'registered';
    if (
      event.registration_capacity &&
      (registeredCount?.c || 0) >= Number(event.registration_capacity)
    ) {
      status = 'waitlist';
    }

    const result = await db.runAsync(
      `INSERT INTO event_registrations (
        church_id, event_id, member_id, guest_name, guest_email, guest_phone, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        event.id,
        memberId,
        guestName,
        req.body.guestEmail || req.body.guest_email || null,
        req.body.guestPhone || req.body.guest_phone || null,
        status,
        req.body.notes || null
      ]
    );

    res.status(201).json({
      message: status === 'waitlist' ? 'Added to waitlist' : 'Registered',
      registration: await db.getAsync('SELECT * FROM event_registrations WHERE id = ?', [result.lastID])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/registrations/:regId', requirePermission('events.manage'), async (req, res) => {
  try {
    const event = await getEvent(req.params.id, req.churchId);
    if (!event) return res.status(404).json({ error: 'Not found' });
    const reg = await db.getAsync(
      'SELECT * FROM event_registrations WHERE id = ? AND event_id = ? AND church_id = ?',
      [req.params.regId, event.id, req.churchId]
    );
    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    const updates = [];
    const values = [];
    if (req.body.status && ['registered', 'waitlist', 'cancelled'].includes(req.body.status)) {
      updates.push('status = ?');
      values.push(req.body.status);
    }
    if (req.body.attended != null) {
      updates.push('attended = ?');
      values.push(req.body.attended ? 1 : 0);
    }
    if (req.body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(req.body.notes);
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    values.push(reg.id);
    await db.runAsync(`UPDATE event_registrations SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({
      message: 'Updated',
      registration: await db.getAsync('SELECT * FROM event_registrations WHERE id = ?', [reg.id])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/attendance', requirePermission('events.manage'), async (req, res) => {
  try {
    const event = await getEvent(req.params.id, req.churchId);
    if (!event) return res.status(404).json({ error: 'Not found' });
    const ids = Array.isArray(req.body.registrationIds) ? req.body.registrationIds : [];
    const attended = req.body.attended !== false;
    if (!ids.length) return res.status(400).json({ error: 'registrationIds required' });

    for (const id of ids) {
      await db.runAsync(
        `UPDATE event_registrations SET attended = ? WHERE id = ? AND event_id = ? AND church_id = ?`,
        [attended ? 1 : 0, id, event.id, req.churchId]
      );
    }
    const count = await db.getAsync(
      `SELECT COUNT(*) as c FROM event_registrations WHERE event_id = ? AND attended = 1`,
      [event.id]
    );
    res.json({ message: 'Attendance updated', attendanceCount: count?.c || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/:id/attachments',
  requirePermission('events.manage'),
  upload.single('attachment'),
  async (req, res) => {
    try {
      const event = await getEvent(req.params.id, req.churchId);
      if (!event) return res.status(404).json({ error: 'Not found' });
      if (!req.file) return res.status(400).json({ error: 'attachment required' });
      const result = await db.runAsync(
        `INSERT INTO event_attachments (church_id, event_id, filename, original_name, uploaded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.churchId, event.id, req.file.filename, req.file.originalname, req.user.id]
      );
      res.status(201).json({
        message: 'Uploaded',
        attachment: {
          id: result.lastID,
          filename: req.file.filename,
          original_name: req.file.originalname,
          url: `/uploads/events/${req.file.filename}`
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete('/:id', requirePermission('events.manage'), async (req, res) => {
  try {
    const event = await getEvent(req.params.id, req.churchId);
    if (!event) return res.status(404).json({ error: 'Not found' });
    if (req.query.hard === '1') {
      await db.runAsync('DELETE FROM events WHERE id = ?', [event.id]);
      return res.json({ message: 'Event successfully deleted' });
    }
    await db.runAsync(`UPDATE events SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      event.id
    ]);
    res.json({ message: 'Event cancelled' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
