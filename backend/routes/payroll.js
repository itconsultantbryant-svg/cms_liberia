const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo, requireRole } = require('../middleware/roleAuth');

// List payroll runs (Finance sees branch; Admin sees all for approval)
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const role = req.primaryRole?.role_code;
    const branchId = req.user.branchId;

    let runs;
    if (role === 'PRESIDENT' || role === 'MISSION_SECRETARY') {
      runs = await db.allAsync(
        `SELECT pr.*, b.branchname as branch_name,
         sub.branchname as submitted_by_name, app.branchname as approved_by_name
         FROM payroll_runs pr
         LEFT JOIN branches b ON pr.branch_id = b.id
         LEFT JOIN branches sub ON pr.submitted_by = sub.id
         LEFT JOIN branches app ON pr.approved_by = app.id
         WHERE pr.church_id = ?
         ORDER BY pr.created_at DESC`,
        [req.churchId]
      );
    } else {
      runs = await db.allAsync(
        `SELECT pr.*, b.branchname as branch_name,
         sub.branchname as submitted_by_name, app.branchname as approved_by_name
         FROM payroll_runs pr
         LEFT JOIN branches b ON pr.branch_id = b.id
         LEFT JOIN branches sub ON pr.submitted_by = sub.id
         LEFT JOIN branches app ON pr.approved_by = app.id
         WHERE pr.church_id = ? AND pr.branch_id = ?
         ORDER BY pr.created_at DESC`,
        [req.churchId, branchId]
      );
    }

    res.json(runs);
  } catch (error) {
    console.error('Payroll list error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get single payroll run with entries
router.get('/:id', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const run = await db.getAsync(
      `SELECT pr.*, b.branchname as branch_name,
       sub.branchname as submitted_by_name, app.branchname as approved_by_name
       FROM payroll_runs pr
       LEFT JOIN branches b ON pr.branch_id = b.id
       LEFT JOIN branches sub ON pr.submitted_by = sub.id
       LEFT JOIN branches app ON pr.approved_by = app.id
       WHERE pr.id = ? AND pr.church_id = ?`,
      [req.params.id, req.churchId]
    );

    if (!run) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const role = req.primaryRole?.role_code;
    const canSeeAll = ['PRESIDENT', 'MISSION_SECRETARY', 'FINANCE_OFFICER'].includes(role);
    if (!canSeeAll && run.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const entries = await db.allAsync(
      `SELECT pe.*, s.firstname, s.lastname, s.position, s.email
       FROM payroll_entries pe
       JOIN staff s ON pe.staff_id = s.id
       WHERE pe.payroll_run_id = ?
       ORDER BY s.lastname, s.firstname`,
      [req.params.id]
    );

    res.json({ ...run, entries });
  } catch (error) {
    console.error('Payroll get error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Create payroll run (Finance Officer only)
router.post('/', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const { title, period_start, period_end, currency } = req.body;
    if (!title || !period_start || !period_end) {
      return res.status(400).json({ error: 'Title, period_start, and period_end are required' });
    }

    const { resolveCurrency } = require('../utils/currencies');
    const resolved = await resolveCurrency(req.churchId, currency);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });

    const result = await db.runAsync(
      `INSERT INTO payroll_runs (branch_id, church_id, title, period_start, period_end, status, currency)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
      [req.user.branchId, req.churchId, title, period_start, period_end, resolved.currency]
    );

    res.json({ message: 'Payroll run created', id: result.lastID });
  } catch (error) {
    console.error('Payroll create error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update payroll run (draft only)
router.put('/:id', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const run = await db.getAsync('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.branch_id !== req.user.branchId) return res.status(403).json({ error: 'Access denied' });
    if (run.status !== 'draft') return res.status(400).json({ error: 'Only draft runs can be updated' });

    const { title, period_start, period_end } = req.body;
    await db.runAsync(
      `UPDATE payroll_runs SET title = COALESCE(?, title), period_start = COALESCE(?, period_start),
       period_end = COALESCE(?, period_end), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title, period_start, period_end, req.params.id]
    );
    res.json({ message: 'Payroll run updated' });
  } catch (error) {
    console.error('Payroll update error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Add or update payroll entry (Finance Officer, draft only)
router.post('/:id/entries', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const run = await db.getAsync('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.branch_id !== req.user.branchId) return res.status(403).json({ error: 'Access denied' });
    if (run.status !== 'draft') return res.status(400).json({ error: 'Only draft runs can be modified' });

    const { staff_id, base_salary, allowances, deductions, notes } = req.body;
    if (!staff_id || base_salary == null) {
      return res.status(400).json({ error: 'staff_id and base_salary are required' });
    }

    const allowancesNum = parseFloat(allowances) || 0;
    const deductionsNum = parseFloat(deductions) || 0;
    const net = parseFloat(base_salary) + allowancesNum - deductionsNum;

    await db.runAsync(
      `INSERT INTO payroll_entries (payroll_run_id, staff_id, base_salary, allowances, deductions, net_amount, currency, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(payroll_run_id, staff_id) DO UPDATE SET
       base_salary = excluded.base_salary, allowances = excluded.allowances, deductions = excluded.deductions,
       net_amount = excluded.net_amount, notes = excluded.notes`,
      [req.params.id, staff_id, base_salary, allowancesNum, deductionsNum, net, run.currency || 'USD', notes || null]
    );

    const sumRow = await db.getAsync('SELECT COALESCE(SUM(net_amount), 0) as total FROM payroll_entries WHERE payroll_run_id = ?', [req.params.id]);
    await db.runAsync('UPDATE payroll_runs SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [sumRow.total, req.params.id]);

    res.json({ message: 'Entry saved' });
  } catch (error) {
    console.error('Payroll entry error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Remove entry from draft run
router.delete('/:id/entries/:entryId', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const run = await db.getAsync('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]);
    if (!run || run.branch_id !== req.user.branchId || run.status !== 'draft') {
      return res.status(400).json({ error: 'Cannot delete entry' });
    }
    await db.runAsync('DELETE FROM payroll_entries WHERE id = ? AND payroll_run_id = ?', [req.params.entryId, req.params.id]);
    const sumRow = await db.getAsync('SELECT COALESCE(SUM(net_amount), 0) as total FROM payroll_entries WHERE payroll_run_id = ?', [req.params.id]);
    await db.runAsync('UPDATE payroll_runs SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [sumRow.total, req.params.id]);
    res.json({ message: 'Entry removed' });
  } catch (error) {
    console.error('Payroll delete entry error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Submit for admin approval (Finance Officer)
router.post('/:id/submit', authMiddleware, requireRole('FINANCE_OFFICER'), async (req, res) => {
  try {
    const run = await db.getAsync('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.branch_id !== req.user.branchId) return res.status(403).json({ error: 'Access denied' });
    if (run.status !== 'draft') return res.status(400).json({ error: 'Only draft runs can be submitted' });

    const count = await db.getAsync('SELECT COUNT(*) as c FROM payroll_entries WHERE payroll_run_id = ?', [req.params.id]);
    if (count.c === 0) return res.status(400).json({ error: 'Add at least one staff entry before submitting' });

    await db.runAsync(
      `UPDATE payroll_runs SET status = 'submitted', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Payroll submitted for admin approval' });
  } catch (error) {
    console.error('Payroll submit error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Approve or reject (Admin: President, Mission Secretary)
router.post('/:id/review', authMiddleware, requireRole('PRESIDENT', 'MISSION_SECRETARY'), async (req, res) => {
  try {
    const { action, rejection_reason } = req.body;
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or reject' });
    }

    const run = await db.getAsync('SELECT * FROM payroll_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.status !== 'submitted') return res.status(400).json({ error: 'Only submitted runs can be reviewed' });

    if (action === 'approve') {
      await db.runAsync(
        `UPDATE payroll_runs SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, req.params.id]
      );
      res.json({ message: 'Payroll approved' });
    } else {
      await db.runAsync(
        `UPDATE payroll_runs SET status = 'rejected', approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, rejection_reason || null, req.params.id]
      );
      res.json({ message: 'Payroll rejected' });
    }
  } catch (error) {
    console.error('Payroll review error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
