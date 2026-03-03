const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Get all branches
router.get('/', authMiddleware, async (req, res) => {
  try {
    const branches = await db.allAsync('SELECT id, branchname, branchcode, email, address, city, state, country, currency FROM branches');
    res.json(branches);
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get service types
router.get('/tools/service-type', authMiddleware, async (req, res) => {
  try {
    const types = await db.allAsync('SELECT * FROM service_types WHERE branch_id = ?', [req.user.branchId]);
    res.json(types);
  } catch (error) {
    console.error('Get service types error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get collection types
router.get('/tools/collection-type', authMiddleware, async (req, res) => {
  try {
    const types = await db.allAsync('SELECT * FROM collections_types WHERE branch_id = ?', [req.user.branchId]);
    res.json(types);
  } catch (error) {
    console.error('Get collection types error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create/Update service type
router.post('/tools/service-type', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, name } = req.body;
    
    if (id) {
      await db.runAsync('UPDATE service_types SET name = ? WHERE id = ? AND branch_id = ?', [name, id, req.user.branchId]);
      res.json({ message: 'Service type updated' });
    } else {
      const result = await db.runAsync('INSERT INTO service_types (branch_id, name) VALUES (?, ?)', [req.user.branchId, name]);
      res.json({ message: 'Service type created', id: result.lastID });
    }
  } catch (error) {
    console.error('Save service type error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create/Update collection type
router.post('/tools/collection-type', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, name } = req.body;
    
    if (id) {
      await db.runAsync('UPDATE collections_types SET name = ? WHERE id = ? AND branch_id = ?', [name, id, req.user.branchId]);
      res.json({ message: 'Collection type updated' });
    } else {
      const result = await db.runAsync('INSERT INTO collections_types (branch_id, name) VALUES (?, ?)', [req.user.branchId, name]);
      res.json({ message: 'Collection type created', id: result.lastID });
    }
  } catch (error) {
    console.error('Save collection type error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete service type
router.delete('/tools/service-type/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM service_types WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    res.json({ message: 'Service type deleted' });
  } catch (error) {
    console.error('Delete service type error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete collection type
router.delete('/tools/collection-type/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM collections_types WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    res.json({ message: 'Collection type deleted' });
  } catch (error) {
    console.error('Delete collection type error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

