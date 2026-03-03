const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Get all events
router.get('/', authMiddleware, async (req, res) => {
  try {
    const events = await db.allAsync(
      'SELECT * FROM events WHERE branch_id = ? ORDER BY date ASC',
      [req.user.branchId]
    );
    res.json(events);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create event
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, location, time, by_who, details, date, assign } = req.body;
    
    if (!title || !location || !time || !by_who || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const dateStr = new Date(date).toISOString().split('T')[0];
    const assignTo = Array.isArray(assign) ? assign.join(',') : assign || '';
    
    const result = await db.runAsync(
      'INSERT INTO events (branch_id, title, location, time, assign_to, by_who, details, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.branchId, title, location, time, assignTo, by_who, details || '', dateStr]
    );
    
    res.json({ message: 'Event successfully saved', id: result.lastID });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete event
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM events WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    res.json({ message: 'Event successfully deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get announcements
router.get('/announcements', authMiddleware, async (req, res) => {
  try {
    const announcements = await db.allAsync(
      'SELECT * FROM announcements WHERE branch_id = ? ORDER BY id DESC',
      [req.user.branchId]
    );
    res.json(announcements);
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create announcement
router.post('/announcement', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { message, by_who, date, sdate, time, stime } = req.body;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(date).toISOString().split('T')[0];
    const stopDate = new Date(sdate).toISOString().split('T')[0];
    
    if (startDate < today || stopDate < startDate) {
      return res.status(400).json({ error: 'Only future dates allowed' });
    }
    
    await db.runAsync(
      'INSERT INTO announcements (branch_id, details, by_who, start_date, stop_date, start_time, stop_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.branchId, message, by_who, startDate, stopDate, time || '', stime || '']
    );
    
    res.json({ message: 'Announcement successfully saved' });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

