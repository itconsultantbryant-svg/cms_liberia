/**
 * Phase 24 — Notification center APIs.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const {
  createNotification,
  notifyChurchAdmins,
  scanChurchNotifications,
  TYPES
} = require('../utils/notifications');

router.use(attachRoleInfo);

function identity(req) {
  return {
    userId: req.user.id,
    userType: req.user.userType || 'branch',
    churchId: req.churchId || req.user.churchId
  };
}

/** Unread badge count */
router.get('/unread-count', async (req, res) => {
  try {
    const { userId, userType } = identity(req);
    const row = await db.getAsync(
      `SELECT COUNT(*) as count FROM notifications
       WHERE user_id = ? AND user_type = ? AND is_read = 0`,
      [userId, userType]
    );
    res.json({ unreadCount: row?.count || 0 });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Meta / allowed types */
router.get('/meta', (req, res) => {
  res.json({
    types: TYPES,
    labels: {
      request: 'Requests',
      approval: 'Approvals',
      member: 'Membership',
      attendance: 'Attendance',
      collection: 'Collections',
      report: 'Reports',
      system: 'System',
      assignment: 'Assignments',
      event: 'Events',
      birthday: 'Birthdays',
      subscription: 'Subscription',
      announcement: 'Announcements',
      communication: 'Communications'
    }
  });
});

/**
 * Notification history
 * Query: unreadOnly, type, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    const { userId, userType } = identity(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';
    const type = req.query.type;

    let where = 'WHERE user_id = ? AND user_type = ?';
    const params = [userId, userType];
    if (unreadOnly) where += ' AND is_read = 0';
    if (type) {
      where += ' AND notification_type = ?';
      params.push(type);
    }

    const notifications = await db.allAsync(
      `SELECT * FROM notifications ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const unreadCount = await db.getAsync(
      `SELECT COUNT(*) as count FROM notifications
       WHERE user_id = ? AND user_type = ? AND is_read = 0`,
      [userId, userType]
    );

    const total = await db.getAsync(
      `SELECT COUNT(*) as count FROM notifications ${where}`,
      params
    );

    res.json({
      notifications,
      unreadCount: unreadCount?.count || 0,
      total: total?.count || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/** Mark all read — must be before /:id routes */
router.put('/read-all', async (req, res) => {
  try {
    const { userId, userType } = identity(req);
    await db.runAsync(
      `UPDATE notifications SET is_read = 1
       WHERE user_id = ? AND user_type = ? AND is_read = 0`,
      [userId, userType]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const { userId, userType } = identity(req);
    await db.runAsync(
      `UPDATE notifications SET is_read = 1
       WHERE user_id = ? AND user_type = ? AND is_read = 0`,
      [userId, userType]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** Scan / generate birthday, event, subscription alerts */
router.post('/scan', async (req, res) => {
  try {
    const churchId = req.churchId || req.user.churchId;
    const created = await scanChurchNotifications(churchId);
    res.json({ message: 'Scan complete', created });
  } catch (error) {
    console.error('Notification scan error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Church-wide system announcement */
router.post(
  '/announce',
  requirePermission('settings.manage', 'communications.manage'),
  async (req, res) => {
    try {
      const churchId = req.churchId;
      const title = (req.body.title || '').trim();
      const message = (req.body.message || '').trim();
      if (!title || !message) {
        return res.status(400).json({ error: 'title and message required' });
      }

      const audience = req.body.audience || 'admins'; // admins | all_users
      let recipients = [];
      if (audience === 'all_users') {
        recipients = await db.allAsync(
          `SELECT id FROM branches WHERE church_id = ?`,
          [churchId]
        );
      } else {
        recipients = await db.allAsync(
          `SELECT id FROM branches WHERE church_id = ? AND isadmin = 1`,
          [churchId]
        );
      }

      let count = 0;
      for (const r of recipients) {
        // eslint-disable-next-line no-await-in-loop
        await createNotification(
          r.id,
          'branch',
          'announcement',
          title,
          message,
          null,
          'announcement',
          churchId
        );
        count += 1;
      }

      res.status(201).json({ message: 'Announcement sent', recipients: count });
    } catch (error) {
      console.error('Announce error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id/read', async (req, res) => {
  try {
    const { userId, userType } = identity(req);
    const result = await db.runAsync(
      `UPDATE notifications SET is_read = 1
       WHERE id = ? AND user_id = ? AND user_type = ?`,
      [req.params.id, userId, userType]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const { userId, userType } = identity(req);
    await db.runAsync(
      `UPDATE notifications SET is_read = 1
       WHERE id = ? AND user_id = ? AND user_type = ?`,
      [req.params.id, userId, userType]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.notifyChurchAdmins = notifyChurchAdmins;
module.exports.scanChurchNotifications = scanChurchNotifications;
