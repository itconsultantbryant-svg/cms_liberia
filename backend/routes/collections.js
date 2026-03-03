const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { isSubUser, requireSubUserPermission } = require('../middleware/subUserAuth');

// Get collections page data
router.get('/offering', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const members = await db.allAsync('SELECT id, firstname, lastname FROM members WHERE branch_id = ?', [req.user.branchId]);
    const services = await db.allAsync('SELECT * FROM service_types WHERE branch_id = ?', [req.user.branchId]);
    const collections = await db.allAsync('SELECT * FROM collections_types WHERE branch_id = ?', [req.user.branchId]);
    const branch = await db.getAsync('SELECT currency FROM branches WHERE id = ?', [req.user.branchId]);
    
    res.json({ members, services, collections, currency: branch?.currency || 'USD' });
  } catch (error) {
    console.error('Get offering data error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save branch collection - supports sub-user submission with approval
router.post('/save', authMiddleware, isSubUser, requireSubUserPermission('record_collections'), async (req, res) => {
  try {
    const { date_collected, type, ...amounts } = req.body;
    
    if (new Date(date_collected) > new Date()) {
      return res.status(400).json({ error: "Can't save collection for a future date" });
    }
    
    const dateStr = new Date(date_collected).toISOString().split('T')[0];
    
    // Check if already exists
    const existing = await db.getAsync(
      'SELECT id FROM collections WHERE date = ? AND branch_id = ?',
      [dateStr, req.user.branchId]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Collection for this date already exists' });
    }
    
    // Get all collection types
    const collectionTypes = await db.allAsync('SELECT * FROM collections_types WHERE branch_id = ?', [req.user.branchId]);
    
    // Insert collections - get the first collection ID for approval tracking
    let firstCollectionId = null;
    for (const cType of collectionTypes) {
      const amount = amounts[cType.name] || 0;
      const result = await db.runAsync(
        'INSERT INTO collections (branch_id, collections_types_id, service_types_id, amount, date) VALUES (?, ?, ?, ?, ?)',
        [req.user.branchId, cType.id, type, amount, dateStr]
      );
      if (!firstCollectionId) {
        firstCollectionId = result.lastID;
      }
    }
    
    // If submitted by sub-user, create pending approval
    if (req.userType === 'sub_user' && firstCollectionId) {
      await db.runAsync(
        `INSERT INTO pending_approvals (branch_id, submitted_by, submitted_by_type, approval_type, reference_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.branchId, req.user.id, 'sub_user', 'collection', firstCollectionId, 'pending']
      );
      
      return res.json({ 
        message: 'Collection submitted successfully. Waiting for Resident Pastor approval.',
        requiresApproval: true
      });
    }
    
    res.json({ message: 'Branch Collection Successfully Saved' });
  } catch (error) {
    console.error('Save collection error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save member collection
router.post('/member', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { date_collected, type, member_id, ...amounts } = req.body;
    
    if (new Date(date_collected) > new Date()) {
      return res.status(400).json({ error: "Can't save collection for a future date" });
    }
    
    const dateStr = new Date(date_collected).toISOString().split('T')[0];
    
    // Check if already exists
    const existing = await db.getAsync(
      'SELECT id FROM member_collections WHERE date_collected = ? AND branch_id = ?',
      [dateStr, req.user.branchId]
    );
    
    if (existing) {
      return res.status(400).json({ error: 'Member collection for this date already exists' });
    }
    
    // Get all collection types
    const collectionTypes = await db.allAsync('SELECT * FROM collections_types WHERE branch_id = ?', [req.user.branchId]);
    
    // Insert collections for each member
    const memberIds = Array.isArray(member_id) ? member_id : [member_id];
    
    for (const memberId of memberIds) {
      for (const cType of collectionTypes) {
        const amount = amounts[cType.name]?.[memberIds.indexOf(memberId)] || amounts[cType.name] || 0;
        await db.runAsync(
          'INSERT INTO member_collections (branch_id, member_id, collections_types_id, service_types_id, amount, date_collected) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.branchId, memberId, cType.id, type, amount, dateStr]
        );
      }
    }
    
    res.json({ message: 'Member Collection Successfully Saved' });
  } catch (error) {
    console.error('Save member collection error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get collection report
router.get('/report', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const collections = await db.allAsync('SELECT * FROM collections_types WHERE branch_id = ?', [req.user.branchId]);
    res.json(collections);
  } catch (error) {
    console.error('Get collection report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get collection history
router.get('/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { branch, member } = req.query;
    
    let history = [];
    if (branch) {
      history = await db.allAsync(
        `SELECT c.*, ct.name as collection_type_name, st.name as service_type_name 
        FROM collections c
        LEFT JOIN collections_types ct ON c.collections_types_id = ct.id
        LEFT JOIN service_types st ON c.service_types_id = st.id
        WHERE c.branch_id = ? ORDER BY c.date DESC`,
        [req.user.branchId]
      );
    } else if (member) {
      history = await db.allAsync(
        `SELECT mc.*, m.firstname, m.lastname, ct.name as collection_type_name, st.name as service_type_name 
        FROM member_collections mc
        LEFT JOIN members m ON mc.member_id = m.id
        LEFT JOIN collections_types ct ON mc.collections_types_id = ct.id
        LEFT JOIN service_types st ON mc.service_types_id = st.id
        WHERE mc.branch_id = ? ORDER BY mc.date_collected DESC`,
        [req.user.branchId]
      );
    }
    
    res.json(history);
  } catch (error) {
    console.error('Get collection history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get collection analysis
router.get('/analysis', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const collections = await db.allAsync(
      `SELECT c.*, ct.name as collection_type_name, st.name as service_type_name 
      FROM collections c
      LEFT JOIN collections_types ct ON c.collections_types_id = ct.id
      LEFT JOIN service_types st ON c.service_types_id = st.id
      WHERE c.branch_id = ? ORDER BY c.date DESC`,
      [req.user.branchId]
    );
    
    res.json(collections);
  } catch (error) {
    console.error('Get collection analysis error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get collection stats
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await db.allAsync(
      `SELECT 
        strftime('%m', date) as month,
        collections_types_id,
        SUM(amount) as total
      FROM collections 
      WHERE date >= date('now', '-12 months') AND branch_id = ? 
      GROUP BY month, collections_types_id`,
      [req.user.branchId]
    );
    
    res.json(stats);
  } catch (error) {
    console.error('Get collection stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

