const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');

router.use(authMiddleware, requireTenant, attachRoleInfo);

const CATEGORIES = [
  'sunday_worship',
  'midweek',
  'prayer',
  'youth',
  'special',
  'conference',
  'custom'
];

router.get('/meta', (req, res) => {
  res.json({ categories: CATEGORIES });
});

router.get('/templates', async (req, res) => {
  try {
    const templates = await db.allAsync('SELECT * FROM service_templates ORDER BY id');
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** List services for active branch (admins can pass allBranches) */
router.get('/', async (req, res) => {
  try {
    let sql = `SELECT * FROM service_types WHERE church_id = ?`;
    const params = [req.churchId];
    if (!(req.user?.isadmin && (req.query.allBranches === '1' || req.query.allBranches === 'true'))) {
      sql += ' AND branch_id = ?';
      params.push(req.user.branchId);
    }
    if (req.query.active !== '0') {
      sql += ' AND (is_active = 1 OR is_active IS NULL)';
    }
    sql += ' ORDER BY name';
    const services = await db.allAsync(sql, params);
    res.json({ services });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requirePermission('attendance.manage', 'settings.manage'), async (req, res) => {
  try {
    const { name, category, description, qrEnabled } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await db.runAsync(
      `INSERT INTO service_types (branch_id, church_id, name, category, description, is_active, qr_enabled)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        req.user.branchId,
        req.churchId,
        name,
        category && CATEGORIES.includes(category) ? category : 'custom',
        description || null,
        qrEnabled === false ? 0 : 1
      ]
    );
    const service = await db.getAsync('SELECT * FROM service_types WHERE id = ?', [result.lastID]);
    res.status(201).json({ message: 'Service created', service });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Seed defaults for current branch if empty */
router.post('/seed-defaults', requirePermission('attendance.manage', 'settings.manage'), async (req, res) => {
  try {
    const existing = await db.getAsync(
      'SELECT COUNT(*) as c FROM service_types WHERE branch_id = ? AND church_id = ?',
      [req.user.branchId, req.churchId]
    );
    if ((existing?.c || 0) > 0 && !req.body.force) {
      return res.json({ message: 'Services already exist', seeded: 0 });
    }
    const templates = await db.allAsync('SELECT * FROM service_templates ORDER BY id');
    let seeded = 0;
    for (const t of templates) {
      const has = await db.getAsync(
        'SELECT id FROM service_types WHERE branch_id = ? AND name = ?',
        [req.user.branchId, t.name]
      );
      if (has) continue;
      await db.runAsync(
        `INSERT INTO service_types (branch_id, church_id, name, category, description, is_active, qr_enabled)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [req.user.branchId, req.churchId, t.name, t.category, t.description]
      );
      seeded++;
    }
    res.json({ message: 'Defaults seeded', seeded });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('attendance.manage', 'settings.manage'), async (req, res) => {
  try {
    const service = await db.getAsync(
      'SELECT * FROM service_types WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const name = req.body.name !== undefined ? req.body.name : service.name;
    const category =
      req.body.category !== undefined && CATEGORIES.includes(req.body.category)
        ? req.body.category
        : service.category;
    const description = req.body.description !== undefined ? req.body.description : service.description;
    const isActive = req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : service.is_active;
    const qrEnabled = req.body.qrEnabled !== undefined ? (req.body.qrEnabled ? 1 : 0) : service.qr_enabled;

    await db.runAsync(
      `UPDATE service_types SET name = ?, category = ?, description = ?, is_active = ?, qr_enabled = ?
       WHERE id = ? AND church_id = ?`,
      [name, category, description, isActive, qrEnabled, service.id, req.churchId]
    );
    res.json({
      message: 'Service updated',
      service: await db.getAsync('SELECT * FROM service_types WHERE id = ?', [service.id])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requirePermission('attendance.manage', 'settings.manage'), async (req, res) => {
  try {
    // Soft-deactivate to preserve attendance FKs
    const result = await db.runAsync(
      `UPDATE service_types SET is_active = 0 WHERE id = ? AND church_id = ?`,
      [req.params.id, req.churchId]
    );
    if (!result.changes) return res.status(404).json({ error: 'Service not found' });
    res.json({ message: 'Service deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** QR check-in payload (readiness — client can render QR from this) */
router.get('/:id/qr-payload', async (req, res) => {
  try {
    const service = await db.getAsync(
      'SELECT * FROM service_types WHERE id = ? AND church_id = ? AND (is_active = 1 OR is_active IS NULL)',
      [req.params.id, req.churchId]
    );
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.qr_enabled === 0) {
      return res.status(400).json({ error: 'QR check-in disabled for this service' });
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    res.json({
      payload: {
        type: 'attendance_checkin',
        v: 1,
        churchId: req.churchId,
        branchId: service.branch_id,
        serviceId: service.id,
        serviceName: service.name,
        date
      },
      // Opaque token string for QR encoding
      token: Buffer.from(
        JSON.stringify({
          c: req.churchId,
          b: service.branch_id,
          s: service.id,
          d: date
        })
      ).toString('base64url')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
