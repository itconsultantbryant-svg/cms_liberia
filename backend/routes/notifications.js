const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Get notifications for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      console.error('[Notifications] No user object or user ID in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userType = req.user.userType || 'branch';
    const userId = req.user.id;

    const notifications = await db.allAsync(
      `SELECT * FROM notifications 
       WHERE user_id = ? AND user_type = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId, userType]
    );

    const unreadCount = await db.getAsync(
      `SELECT COUNT(*) as count FROM notifications 
       WHERE user_id = ? AND user_type = ? AND is_read = 0`,
      [userId, userType]
    );

    res.json({
      notifications,
      unreadCount: unreadCount?.count || 0
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Mark notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const userType = req.user.userType || 'branch';
    const userId = req.user.id;

    await db.runAsync(
      `UPDATE notifications 
       SET is_read = 1 
       WHERE id = ? AND user_id = ? AND user_type = ?`,
      [req.params.id, userId, userType]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Mark all notifications as read
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const userType = req.user.userType || 'branch';
    const userId = req.user.id;

    await db.runAsync(
      `UPDATE notifications 
       SET is_read = 1 
       WHERE user_id = ? AND user_type = ? AND is_read = 0`,
      [userId, userType]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Helper function to create notification (can be imported by other routes)
const createNotification = async (userId, userType, notificationType, title, message, referenceId = null, referenceType = null) => {
  try {
    await db.runAsync(
      `INSERT INTO notifications (user_id, user_type, notification_type, title, message, reference_id, reference_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, userType, notificationType, title, message, referenceId, referenceType]
    );
  } catch (error) {
    console.error('Create notification error:', error);
  }
};

module.exports = router;
module.exports.createNotification = createNotification;

