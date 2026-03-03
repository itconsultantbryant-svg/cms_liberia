const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Get inbox
router.get('/inbox', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messages = await db.allAsync(
      `SELECT m.*, b1.branchname as from_name, b2.branchname as to_name 
      FROM messaging m
      LEFT JOIN branches b1 ON m.from_id = b1.id
      LEFT JOIN branches b2 ON m.to_id = b2.id
      WHERE m.to_id = ? ORDER BY m.created_at DESC`,
      [req.user.branchId]
    );
    res.json(messages);
  } catch (error) {
    console.error('Get inbox error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message
router.post('/send', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { to_id, message } = req.body;
    
    await db.runAsync(
      'INSERT INTO messaging (from_id, to_id, message) VALUES (?, ?, ?)',
      [req.user.branchId, to_id, message]
    );
    
    res.json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

