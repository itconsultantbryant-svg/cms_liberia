const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Get all groups
router.get('/', authMiddleware, async (req, res) => {
  try {
    const groups = await db.allAsync(
      'SELECT g.*, COUNT(gm.id) as member_count FROM groups g LEFT JOIN group_members gm ON g.id = gm.group_id WHERE g.branch_id = ? GROUP BY g.id',
      [req.user.branchId]
    );
    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single group
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const members = await db.allAsync(
      `SELECT m.* FROM members m
      INNER JOIN group_members gm ON m.id = gm.member_id
      WHERE gm.group_id = ?`,
      [req.params.id]
    );
    
    res.json({ group, members });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create group
router.post('/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const result = await db.runAsync(
      'INSERT INTO groups (branch_id, name) VALUES (?, ?)',
      [req.user.branchId, name]
    );
    
    res.json({ message: 'Group created successfully', id: result.lastID });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add member to group
router.post('/:id/add', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { member_id } = req.body;
    
    // Check if already in group
    const existing = await db.getAsync(
      'SELECT id FROM group_members WHERE group_id = ? AND member_id = ?',
      [req.params.id, member_id]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Member already in group' });
    }
    
    await db.runAsync(
      'INSERT INTO group_members (group_id, member_id) VALUES (?, ?)',
      [req.params.id, member_id]
    );
    
    res.json({ message: 'Member added to group successfully' });
  } catch (error) {
    console.error('Add member to group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove member from group
router.delete('/:id/member/:memberId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync(
      'DELETE FROM group_members WHERE group_id = ? AND member_id = ?',
      [req.params.id, req.params.memberId]
    );
    res.json({ message: 'Member removed from group successfully' });
  } catch (error) {
    console.error('Remove member from group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete group
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM groups WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

