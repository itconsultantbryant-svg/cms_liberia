const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const { audit } = require('../utils/audit');

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
         WHERE s.church_id = ? AND s.resident_pastor_id = ? AND s.is_active = 1
         ORDER BY s.position, s.lastname, s.firstname`,
        [req.churchId, req.user.id]
      );
    } else if (userRole === 'PRESIDENT' || userRole === 'MISSION_SECRETARY' || userRole === 'FINANCE_OFFICER') {
      // Admin and Finance Officer can see all staff in their church
      staff = await db.allAsync(
        `SELECT s.*, d.department_name, b.branchname as pastor_name
         FROM staff s
         LEFT JOIN departments d ON s.department_id = d.id
         LEFT JOIN branches b ON s.resident_pastor_id = b.id
         WHERE s.church_id = ? AND s.is_active = 1
         ORDER BY s.resident_pastor_id, s.position, s.lastname, s.firstname`,
        [req.churchId]
      );
    } else {
      // Others see only their branch staff
      staff = await db.allAsync(
        `SELECT s.*, d.department_name
         FROM staff s
         LEFT JOIN departments d ON s.department_id = d.id
         WHERE s.church_id = ? AND s.branch_id = ? AND s.is_active = 1
         ORDER BY s.position, s.lastname, s.firstname`,
        [req.churchId, branchId]
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

// Create staff (Resident Pastor, Finance Officer, or church admin with staff.manage)
router.post('/', authMiddleware, attachRoleInfo, requirePermission('staff.manage'), async (req, res) => {
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

    const { resolveCurrency } = require('../utils/currencies');
    const resolved = await resolveCurrency(req.churchId, currency);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });

    const result = await db.runAsync(
      `INSERT INTO staff (branch_id, church_id, resident_pastor_id, firstname, lastname, email, phone, position,
       job_title, department_id, employment_date, salary, currency, address, city, state, country, notes, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
      [
        req.body.branch_id || req.user.branchId,
        req.churchId,
        pastorId,
        firstname,
        lastname,
        email || null,
        phone || null,
        position,
        req.body.job_title || position,
        department_id || null,
        employment_date || null,
        salary || null,
        resolved.currency,
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

// Update staff
router.put('/:id', authMiddleware, attachRoleInfo, requirePermission('staff.manage'), async (req, res) => {
  try {
    const staff = await db.getAsync(
      'SELECT * FROM staff WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const isPastor = ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'].includes(req.primaryRole?.role_code);
    if (isPastor && staff.resident_pastor_id !== req.user.id && !req.user.isadmin) {
      return res.status(403).json({ error: 'You can only update your own staff' });
    }

    const {
      firstname,
      lastname,
      email,
      phone,
      position,
      job_title,
      department_id,
      employment_date,
      salary,
      currency,
      address,
      city,
      state,
      country,
      notes,
      is_active,
      status,
      branch_id
    } = req.body;

    const nextStatus = status || (is_active === 0 || is_active === false ? 'suspended' : undefined);
    const nextActive =
      nextStatus === 'suspended' ? 0 : nextStatus === 'active' ? 1 : is_active;

    await db.runAsync(
      `UPDATE staff 
       SET firstname = COALESCE(?, firstname),
           lastname = COALESCE(?, lastname),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           position = COALESCE(?, position),
           job_title = COALESCE(?, job_title),
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
           status = COALESCE(?, status),
           branch_id = COALESCE(?, branch_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      [
        firstname, lastname, email, phone, position, job_title || position, department_id || null,
        employment_date, salary, currency, address, city, state, country,
        notes, nextActive, nextStatus, branch_id, req.params.id, req.churchId
      ]
    );

    res.json({ message: 'Staff member updated successfully' });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/:id/suspend', authMiddleware, attachRoleInfo, requirePermission('staff.manage'), async (req, res) => {
  try {
    await db.runAsync(
      `UPDATE staff SET status = 'suspended', is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      [req.params.id, req.churchId]
    );
    await audit(req, {
      action: 'suspend',
      resource: 'staff',
      resourceId: req.params.id,
      summary: 'Staff suspended'
    });
    res.json({ message: 'Staff suspended' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/activate', authMiddleware, attachRoleInfo, requirePermission('staff.manage'), async (req, res) => {
  try {
    await db.runAsync(
      `UPDATE staff SET status = 'active', is_active = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      [req.params.id, req.churchId]
    );
    await audit(req, {
      action: 'activate',
      resource: 'staff',
      resourceId: req.params.id,
      summary: 'Staff activated'
    });
    res.json({ message: 'Staff activated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete staff (deactivate)
router.delete('/:id', authMiddleware, attachRoleInfo, requirePermission('staff.manage'), async (req, res) => {
  try {
    const staff = await db.getAsync(
      'SELECT * FROM staff WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const isPastor = ['RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ'].includes(req.primaryRole?.role_code);
    if (isPastor && staff.resident_pastor_id !== req.user.id && !req.user.isadmin) {
      return res.status(403).json({ error: 'You can only deactivate your own staff' });
    }

    await db.runAsync(
      `UPDATE staff SET is_active = 0, status = 'suspended', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      [req.params.id, req.churchId]
    );
    res.json({ message: 'Staff member deactivated successfully' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

