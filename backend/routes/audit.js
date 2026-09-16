/**
 * Phase 25 — Audit log read APIs (immutable: no delete/update).
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const { ACTIONS } = require('../utils/audit');

router.use(attachRoleInfo);

router.get('/meta', requirePermission('audit.view', 'reports.view', 'settings.manage'), (req, res) => {
  res.json({
    actions: ACTIONS,
    immutable: true,
    note: 'Audit records cannot be deleted or modified by church administrators.'
  });
});

/**
 * List audit logs for the current church.
 * Query: action, resource, userId, from, to, q, limit, offset
 */
router.get('/', requirePermission('audit.view', 'reports.view', 'settings.manage'), async (req, res) => {
  try {
    const churchId = req.churchId;
    let sql = `SELECT * FROM audit_logs WHERE church_id = ?`;
    const params = [churchId];

    if (req.query.action) {
      sql += ' AND action = ?';
      params.push(req.query.action);
    }
    if (req.query.resource) {
      sql += ' AND resource = ?';
      params.push(req.query.resource);
    }
    if (req.query.userId) {
      sql += ' AND user_id = ?';
      params.push(req.query.userId);
    }
    if (req.query.from) {
      sql += ' AND date(created_at) >= date(?)';
      params.push(req.query.from);
    }
    if (req.query.to) {
      sql += ' AND date(created_at) <= date(?)';
      params.push(req.query.to);
    }
    if (req.query.q) {
      sql += ' AND (summary LIKE ? OR user_email LIKE ? OR resource_id LIKE ?)';
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as c FROM (${sql})`,
      params
    );

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = await db.allAsync(sql, params);
    res.json({
      logs,
      total: countRow?.c || 0,
      limit,
      offset,
      immutable: true
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requirePermission('audit.view', 'reports.view', 'settings.manage'), async (req, res) => {
  try {
    const row = await db.getAsync(
      'SELECT * FROM audit_logs WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!row) return res.status(404).json({ error: 'Audit record not found' });
    res.json({ log: row });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** Explicitly reject mutation attempts — immutability guarantee */
router.delete('/:id', (req, res) => {
  res.status(403).json({
    error: 'Audit records are immutable and cannot be deleted'
  });
});

router.delete('/', (req, res) => {
  res.status(403).json({
    error: 'Audit records are immutable and cannot be deleted'
  });
});

router.put('/:id', (req, res) => {
  res.status(403).json({ error: 'Audit records are immutable and cannot be modified' });
});

router.patch('/:id', (req, res) => {
  res.status(403).json({ error: 'Audit records are immutable and cannot be modified' });
});

module.exports = router;
