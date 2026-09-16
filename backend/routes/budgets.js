const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');

router.use(authMiddleware, requireTenant, attachRoleInfo);

const STATUSES = ['draft', 'submitted', 'approved', 'active', 'closed'];

async function getBudget(id, churchId) {
  return db.getAsync('SELECT * FROM budgets WHERE id = ? AND church_id = ?', [id, churchId]);
}

async function loadLines(budgetId, churchId) {
  return db.allAsync(
    `SELECT bl.*, c.name as category_name, c.code as category_code
     FROM budget_lines bl
     LEFT JOIN finance_categories c ON c.id = bl.category_id
     WHERE bl.budget_id = ? AND bl.church_id = ?
     ORDER BY bl.line_type, bl.id`,
    [budgetId, churchId]
  );
}

async function recalcTotals(budgetId) {
  const sums = await db.getAsync(
    `SELECT
       COALESCE(SUM(CASE WHEN line_type = 'income' THEN amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN line_type = 'expense' THEN amount ELSE 0 END), 0) as expense
     FROM budget_lines WHERE budget_id = ?`,
    [budgetId]
  );
  await db.runAsync(
    `UPDATE budgets SET total_income = ?, total_expense = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [sums?.income || 0, sums?.expense || 0, budgetId]
  );
  return sums;
}

async function varianceForBudget(budget, churchId) {
  const lines = await loadLines(budget.id, churchId);
  const report = [];

  for (const line of lines) {
    let actual = 0;
    if (line.category_id) {
      const row = await db.getAsync(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM finance_transactions
         WHERE church_id = ? AND status = 'posted'
           AND category_id = ? AND txn_type = ?
           AND txn_date >= ? AND txn_date <= ?`,
        [churchId, line.category_id, line.line_type, budget.period_start, budget.period_end]
      );
      actual = Number(row?.total || 0);
    } else {
      const row = await db.getAsync(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM finance_transactions
         WHERE church_id = ? AND status = 'posted'
           AND txn_type = ?
           AND txn_date >= ? AND txn_date <= ?`,
        [churchId, line.line_type, budget.period_start, budget.period_end]
      );
      actual = Number(row?.total || 0);
    }

    const budgeted = Number(line.amount || 0);
    // Income: actual - budgeted (positive = over goal)
    // Expense: budgeted - actual (positive = under budget / favorable)
    const variance =
      line.line_type === 'expense' ? budgeted - actual : actual - budgeted;

    report.push({
      lineId: line.id,
      categoryId: line.category_id,
      categoryName: line.category_name || line.label || 'Uncategorized',
      lineType: line.line_type,
      budgeted,
      actual,
      variance,
      variancePct: budgeted ? (variance / budgeted) * 100 : null
    });
  }

  const totals = {
    budgetedIncome: lines.filter(l => l.line_type === 'income').reduce((s, l) => s + Number(l.amount || 0), 0),
    budgetedExpense: lines.filter(l => l.line_type === 'expense').reduce((s, l) => s + Number(l.amount || 0), 0),
    actualIncome: report.filter(r => r.lineType === 'income').reduce((s, r) => s + r.actual, 0),
    actualExpense: report.filter(r => r.lineType === 'expense').reduce((s, r) => s + r.actual, 0)
  };
  totals.incomeVariance = totals.actualIncome - totals.budgetedIncome;
  totals.expenseVariance = totals.budgetedExpense - totals.actualExpense;
  totals.netBudgeted = totals.budgetedIncome - totals.budgetedExpense;
  totals.netActual = totals.actualIncome - totals.actualExpense;

  return { lines: report, totals };
}

router.get('/meta', (req, res) => {
  res.json({ statuses: STATUSES, workflow: STATUSES });
});

router.get('/', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const { status, year } = req.query;
    let sql = 'SELECT * FROM budgets WHERE church_id = ?';
    const params = [req.churchId];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (year) {
      sql += ' AND fiscal_year = ?';
      params.push(parseInt(year, 10));
    }
    if (!req.user?.isadmin && req.query.allBranches !== '1') {
      sql += ' AND (branch_id = ? OR branch_id IS NULL)';
      params.push(req.user.branchId);
    }
    sql += ' ORDER BY fiscal_year DESC, id DESC';
    res.json({ budgets: await db.allAsync(sql, params) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requirePermission('finance.create'), async (req, res) => {
  try {
    const {
      name,
      fiscalYear,
      periodStart,
      periodEnd,
      currency,
      notes,
      branchId,
      churchWide,
      lines
    } = req.body;

    const year = parseInt(fiscalYear || new Date().getFullYear(), 10);
    const start = periodStart || `${year}-01-01`;
    const end = periodEnd || `${year}-12-31`;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { resolveCurrency } = require('../utils/currencies');
    const resolved = await resolveCurrency(req.churchId, currency);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });

    const result = await db.runAsync(
      `INSERT INTO budgets (
        church_id, branch_id, name, fiscal_year, period_start, period_end,
        status, currency, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [
        req.churchId,
        churchWide ? null : branchId || req.user.branchId,
        name,
        year,
        start,
        end,
        resolved.currency,
        notes || null,
        req.user.id
      ]
    );

    if (Array.isArray(lines)) {
      for (const line of lines) {
        const amt = Number(line.amount || 0);
        if (amt < 0) continue;
        await db.runAsync(
          `INSERT INTO budget_lines (church_id, budget_id, category_id, line_type, label, amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.churchId,
            result.lastID,
            line.categoryId || null,
            line.lineType === 'income' ? 'income' : 'expense',
            line.label || null,
            amt,
            line.notes || null
          ]
        );
      }
      await recalcTotals(result.lastID);
    }

    const budget = await getBudget(result.lastID, req.churchId);
    res.status(201).json({
      message: 'Budget created',
      budget,
      lines: await loadLines(result.lastID, req.churchId)
    });
  } catch (error) {
    console.error('Create budget error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const budget = await getBudget(req.params.id, req.churchId);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const lines = await loadLines(budget.id, req.churchId);
    const variance =
      budget.status === 'active' || budget.status === 'closed' || budget.status === 'approved'
        ? await varianceForBudget(budget, req.churchId)
        : null;
    res.json({ budget, lines, variance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Replace lines — only while draft */
router.put('/:id/lines', requirePermission('finance.create'), async (req, res) => {
  try {
    const budget = await getBudget(req.params.id, req.churchId);
    if (!budget) return res.status(404).json({ error: 'Not found' });
    if (budget.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft budgets can edit lines' });
    }
    const lines = req.body.lines;
    if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines array required' });

    await db.runAsync('DELETE FROM budget_lines WHERE budget_id = ? AND church_id = ?', [
      budget.id,
      req.churchId
    ]);
    for (const line of lines) {
      await db.runAsync(
        `INSERT INTO budget_lines (church_id, budget_id, category_id, line_type, label, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          budget.id,
          line.categoryId || null,
          line.lineType === 'income' ? 'income' : 'expense',
          line.label || null,
          Number(line.amount || 0),
          line.notes || null
        ]
      );
    }
    await recalcTotals(budget.id);
    res.json({
      message: 'Lines updated',
      budget: await getBudget(budget.id, req.churchId),
      lines: await loadLines(budget.id, req.churchId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('finance.create'), async (req, res) => {
  try {
    const budget = await getBudget(req.params.id, req.churchId);
    if (!budget) return res.status(404).json({ error: 'Not found' });
    if (budget.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft budgets can be edited' });
    }
    await db.runAsync(
      `UPDATE budgets SET
        name = COALESCE(?, name),
        notes = COALESCE(?, notes),
        period_start = COALESCE(?, period_start),
        period_end = COALESCE(?, period_end),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        req.body.name ?? null,
        req.body.notes ?? null,
        req.body.periodStart ?? null,
        req.body.periodEnd ?? null,
        budget.id
      ]
    );
    res.json({ message: 'Updated', budget: await getBudget(budget.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function transition(req, res, fromStatuses, toStatus, extra = {}) {
  try {
    const budget = await getBudget(req.params.id, req.churchId);
    if (!budget) return res.status(404).json({ error: 'Not found' });
    if (!fromStatuses.includes(budget.status)) {
      return res.status(400).json({
        error: `Cannot move to ${toStatus} from ${budget.status}`
      });
    }
    const now = new Date().toISOString();
    const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const vals = [toStatus];
    if (extra.submitted) {
      sets.push('submitted_by = ?', 'submitted_at = ?');
      vals.push(req.user.id, now);
    }
    if (extra.approved) {
      sets.push('approved_by = ?', 'approved_at = ?');
      vals.push(req.user.id, now);
    }
    if (extra.activated) {
      sets.push('activated_at = ?');
      vals.push(now);
      // Only one active budget per church+year
      await db.runAsync(
        `UPDATE budgets SET status = 'closed', closed_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE church_id = ? AND fiscal_year = ? AND status = 'active' AND id != ?`,
        [now, req.churchId, budget.fiscal_year, budget.id]
      );
    }
    if (extra.closed) {
      sets.push('closed_at = ?');
      vals.push(now);
    }
    vals.push(budget.id);
    await db.runAsync(`UPDATE budgets SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({
      message: `Budget ${toStatus}`,
      budget: await getBudget(budget.id, req.churchId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

router.post('/:id/submit', requirePermission('finance.create'), (req, res) =>
  transition(req, res, ['draft'], 'submitted', { submitted: true })
);

router.post('/:id/approve', requirePermission('finance.approve'), (req, res) =>
  transition(req, res, ['submitted'], 'approved', { approved: true })
);

router.post('/:id/activate', requirePermission('finance.approve'), (req, res) =>
  transition(req, res, ['approved'], 'active', { activated: true })
);

router.post('/:id/close', requirePermission('finance.approve'), (req, res) =>
  transition(req, res, ['active', 'approved'], 'closed', { closed: true })
);

router.post('/:id/reopen-draft', requirePermission('finance.create'), (req, res) =>
  transition(req, res, ['submitted'], 'draft', {})
);

/** Variance report */
router.get('/:id/variance', requirePermission('finance.view', 'reports.view'), async (req, res) => {
  try {
    const budget = await getBudget(req.params.id, req.churchId);
    if (!budget) return res.status(404).json({ error: 'Not found' });
    const variance = await varianceForBudget(budget, req.churchId);
    res.json({ budget, variance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
