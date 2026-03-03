const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');

// Get all staff for a Resident Pastor
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const userRole = req.primaryRole?.role_code;
    const branchId = req.user.branchId;

    let staff;
    
    if (userRole === 'RESIDENT_PASTOR' || userRole === 'RESIDENT_PASTOR_HQ') {
      // Resident Pastor sees their own staff
      staff = await db.allAsync(
        `SELECT s.*, d.department_name
         FROM staff s
         LEFT JOIN departments d ON s.department_id = d.id
         WHERE s.resident_pastor_id = ? AND s.is_active = 1
         ORDER BY s.position, s.lastname, s.firstname`,
        [req.user.id]
      );
    } else if (userRole === 'PRESIDENT' || userRole === 'MISSION_SECRETARY' || userRole === 'FINANCE_OFFICER') {
      // Admin and Finance Officer can see all staff
      staff = await db.allAsync(
        `SELECT s.*, d.department_name, b.branchname as pastor_name
         FROM staff s
         LEFT JOIN departments d ON s.department_id = d.id
         LEFT JOIN branches b ON s.resident_pastor_id = b.id
         WHERE s.is_active = 1
         ORDER BY s.resident_pastor_id, s.position, s.lastname, s.firstname`,
        []
      );
    } else {
      // Others see only their branch staff
      staff = await db.allAsync(
        `SELECT s.*, d.department_name
         FROM staff s
         LEFT JOIN departments d ON s.department_id = d.id
         WHERE s.branch_id = ? AND s.is_active = 1
         ORDER BY s.position, s.lastname, s.firstname`,
        [branchId]
      );
    }

    res.json(staff);
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get single staff member
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const staff = await db.getAsync(
      `SELECT s.*, d.department_name, b.branchname as pastor_name
       FROM staff s
       LEFT JOIN departments d ON s.department_id = d.id
       LEFT JOIN branches b ON s.resident_pastor_id = b.id
       WHERE s.id = ?`,
      [req.params.id]
    );

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    res.json(staff);
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Create staff (Resident Pastor or Finance Officer)
router.post('/', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'FINANCE_OFFICER'), async (req, res) => {
  try {
    const {
      firstname,
      lastname,
      email,
      phone,
      position,
      department_id,
      employment_date,
      salary,
      currency,
      address,
      city,
      state,
      country,
      notes,
      resident_pastor_id
    } = req.body;

    if (!firstname || !lastname || !position) {
      return res.status(400).json({ error: 'First name, last name, and position are required' });
    }

    const pastorId = resident_pastor_id || req.user.id;

    const result = await db.runAsync(
      `INSERT INTO staff (branch_id, resident_pastor_id, firstname, lastname, email, phone, position, 
       department_id, employment_date, salary, currency, address, city, state, country, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.branchId,
        pastorId,
        firstname,
        lastname,
        email || null,
        phone || null,
        position,
        department_id || null,
        employment_date || null,
        salary || null,
        currency || 'USD',
        address || null,
        city || null,
        state || null,
        country || null,
        notes || null
      ]
    );

    res.json({
      message: 'Staff member added successfully',
      staffId: result.lastID
    });
  } catch (error) {
    console.error('Create staff error:', error);
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update staff (Resident Pastor or Finance Officer)
router.put('/:id', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'FINANCE_OFFICER'), async (req, res) => {
  try {
    const staff = await db.getAsync(
      'SELECT * FROM staff WHERE id = ?',
      [req.params.id]
    );

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const isPastor = ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'].includes(req.primaryRole?.role_code);
    if (isPastor && staff.resident_pastor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own staff' });
    }

    const {
      firstname,
      lastname,
      email,
      phone,
      position,
      department_id,
      employment_date,
      salary,
      currency,
      address,
      city,
      state,
      country,
      notes,
      is_active
    } = req.body;

    await db.runAsync(
      `UPDATE staff 
       SET firstname = COALESCE(?, firstname),
           lastname = COALESCE(?, lastname),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           position = COALESCE(?, position),
           department_id = ?,
           employment_date = COALESCE(?, employment_date),
           salary = COALESCE(?, salary),
           currency = COALESCE(?, currency),
           address = COALESCE(?, address),
           city = COALESCE(?, city),
           state = COALESCE(?, state),
           country = COALESCE(?, country),
           notes = COALESCE(?, notes),
           is_active = COALESCE(?, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        firstname, lastname, email, phone, position, department_id || null,
        employment_date, salary, currency, address, city, state, country,
        notes, is_active, req.params.id
      ]
    );

    res.json({ message: 'Staff member updated successfully' });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Delete staff (deactivate) - Resident Pastor or Finance Officer
router.delete('/:id', authMiddleware, requireRole('RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'FINANCE_OFFICER'), async (req, res) => {
  try {
    const staff = await db.getAsync(
      'SELECT * FROM staff WHERE id = ?',
      [req.params.id]
    );

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const isPastor = ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'].includes(req.primaryRole?.role_code);
    if (isPastor && staff.resident_pastor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only deactivate your own staff' });
    }

    await db.runAsync('UPDATE staff SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ message: 'Staff member deactivated successfully' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

