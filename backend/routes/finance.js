const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');
const { PAYMENT_METHODS, normalizePaymentMethod } = require('../utils/finance');
const { audit } = require('../utils/audit');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { resolveCurrency, listForChurch, getDefaultCurrency } = require('../utils/currencies');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

router.use(authMiddleware, requireTenant, attachRoleInfo);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/finance');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

async function ensureChurchDefaults(churchId) {
  const fund = await db.getAsync(
    `SELECT id FROM finance_funds WHERE church_id = ? AND name = 'General Fund'`,
    [churchId]
  );
  if (!fund) {
    await db.runAsync(
      `INSERT INTO finance_funds (church_id, name, description) VALUES (?, 'General Fund', 'Primary operating fund')`,
      [churchId]
    );
  }
  const acct = await db.getAsync(
    `SELECT id FROM finance_accounts WHERE church_id = ? AND name = 'Cash'`,
    [churchId]
  );
  if (!acct) {
    await db.runAsync(
      `INSERT INTO finance_accounts (church_id, name, account_type) VALUES (?, 'Cash', 'cash')`,
      [churchId]
    );
  }
}

async function getTxn(id, churchId) {
  return db.getAsync(
    `SELECT t.*,
      c.name as category_name, c.type as category_type,
      f.name as fund_name, a.name as account_name,
      m.firstname as member_firstname, m.lastname as member_lastname,
      e.branchname as entered_by_name, ap.branchname as approved_by_name
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.category_id
     LEFT JOIN finance_funds f ON f.id = t.fund_id
     LEFT JOIN finance_accounts a ON a.id = t.account_id
     LEFT JOIN members m ON m.id = t.member_id
     LEFT JOIN branches e ON e.id = t.entered_by
     LEFT JOIN branches ap ON ap.id = t.approved_by
     WHERE t.id = ? AND t.church_id = ?`,
    [id, churchId]
  );
}

router.get('/meta', async (req, res) => {
  try {
    const currenciesList = await listForChurch(req.churchId);
    const defaultCurrency = await getDefaultCurrency(req.churchId);
    res.json({
      paymentMethods: PAYMENT_METHODS,
      statuses: ['draft', 'pending', 'posted', 'voided'],
      txnTypes: ['income', 'expense'],
      currencies: currenciesList,
      defaultCurrency
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Categories (platform defaults + church) */
router.get('/categories', async (req, res) => {
  try {
    const type = req.query.type;
    let sql = `SELECT * FROM finance_categories
               WHERE (church_id IS NULL OR church_id = ?) AND is_active = 1`;
    const params = [req.churchId];
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY type, name';
    res.json({ categories: await db.allAsync(sql, params) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/funds', async (req, res) => {
  try {
    await ensureChurchDefaults(req.churchId);
    const funds = await db.allAsync(
      `SELECT * FROM finance_funds WHERE church_id = ? AND is_active = 1 ORDER BY name`,
      [req.churchId]
    );
    res.json({ funds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/accounts', async (req, res) => {
  try {
    await ensureChurchDefaults(req.churchId);
    const accounts = await db.allAsync(
      `SELECT * FROM finance_accounts WHERE church_id = ? AND is_active = 1 ORDER BY name`,
      [req.churchId]
    );
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Dashboard summary */
router.get('/dashboard', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear().toString();

    const totals = await db.getAsync(
      `SELECT
         COALESCE(SUM(CASE WHEN txn_type = 'income' AND status = 'posted' THEN amount ELSE 0 END), 0) as income,
         COALESCE(SUM(CASE WHEN txn_type = 'expense' AND status = 'posted' THEN amount ELSE 0 END), 0) as expenses
       FROM finance_transactions
       WHERE church_id = ? AND strftime('%Y', txn_date) = ?`,
      [req.churchId, year]
    );

    const byMonth = await db.allAsync(
      `SELECT strftime('%Y-%m', txn_date) as month,
         COALESCE(SUM(CASE WHEN txn_type = 'income' AND status = 'posted' THEN amount ELSE 0 END), 0) as income,
         COALESCE(SUM(CASE WHEN txn_type = 'expense' AND status = 'posted' THEN amount ELSE 0 END), 0) as expenses
       FROM finance_transactions
       WHERE church_id = ? AND strftime('%Y', txn_date) = ?
       GROUP BY month
       ORDER BY month`,
      [req.churchId, year]
    );

    const donationTrends = await db.allAsync(
      `SELECT strftime('%Y-%m', t.txn_date) as month, COALESCE(SUM(t.amount), 0) as total
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
       WHERE t.church_id = ? AND t.status = 'posted' AND t.txn_type = 'income'
         AND (c.code IN ('DONATIONS','PLEDGES','TITHES','OFFERINGS') OR c.name LIKE '%Donation%' OR c.name LIKE '%Tithe%' OR c.name LIKE '%Offering%')
         AND strftime('%Y', t.txn_date) = ?
       GROUP BY month
       ORDER BY month`,
      [req.churchId, year]
    );

    const pending = await db.getAsync(
      `SELECT COUNT(*) as count FROM finance_transactions
       WHERE church_id = ? AND status IN ('draft', 'pending')`,
      [req.churchId]
    );

    // Real outstanding pledges (Phase 14)
    const outstandingPledges = await db
      .getAsync(
        `SELECT
           COALESCE(SUM(amount - COALESCE(amount_paid, 0)), 0) as total,
           COUNT(*) as count
         FROM pledges
         WHERE church_id = ? AND status = 'active' AND (amount - COALESCE(amount_paid, 0)) > 0`,
        [req.churchId]
      )
      .catch(() => ({ total: 0, count: 0 }));

    // Live budget performance from active budget (Phase 15)
    let budgetPerformance = { budgeted: 0, actual: totals?.expenses || 0, variance: 0, budgetId: null };
    try {
      const active = await db.getAsync(
        `SELECT * FROM budgets
         WHERE church_id = ? AND status = 'active' AND fiscal_year = ?
         ORDER BY id DESC LIMIT 1`,
        [req.churchId, parseInt(year, 10)]
      );
      if (active) {
        const actualExp = await db.getAsync(
          `SELECT COALESCE(SUM(amount), 0) as total FROM finance_transactions
           WHERE church_id = ? AND status = 'posted' AND txn_type = 'expense'
             AND txn_date >= ? AND txn_date <= ?`,
          [req.churchId, active.period_start, active.period_end]
        );
        const budgeted = Number(active.total_expense || 0);
        const actual = Number(actualExp?.total || 0);
        budgetPerformance = {
          budgetId: active.id,
          budgetName: active.name,
          budgeted,
          actual,
          variance: budgeted - actual
        };
      }
    } catch (_) {
      /* budgets table may not exist yet during migrate race */
    }

    const income = Number(totals?.income || 0);
    const expenses = Number(totals?.expenses || 0);

    res.json({
      year,
      income,
      expenses,
      net: income - expenses,
      byMonth,
      donationTrends,
      pendingCount: pending?.count || 0,
      outstandingPledges,
      budgetPerformance
    });
  } catch (error) {
    console.error('Finance dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** List transactions */
router.get('/transactions', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const { type, status, from, to, q } = req.query;
    const { page: pageNum, limit: pageSize, offset } = parsePagination(req.query);
    let where = 'WHERE t.church_id = ?';
    const params = [req.churchId];
    if (type) {
      where += ' AND t.txn_type = ?';
      params.push(type);
    }
    if (status) {
      where += ' AND t.status = ?';
      params.push(status);
    }
    if (from) {
      where += ' AND t.txn_date >= ?';
      params.push(from);
    }
    if (to) {
      where += ' AND t.txn_date <= ?';
      params.push(to);
    }
    if (q) {
      where += ' AND (t.description LIKE ? OR t.reference_number LIKE ? OR t.donor_name LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (!req.user?.isadmin && req.query.allBranches !== '1') {
      where += ' AND (t.branch_id = ? OR t.branch_id IS NULL)';
      params.push(req.user.branchId);
    }

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM finance_transactions t ${where}`,
      params
    );
    const transactions = await db.allAsync(
      `SELECT t.*, c.name as category_name, f.name as fund_name
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
       LEFT JOIN finance_funds f ON f.id = t.fund_id
       ${where}
       ORDER BY t.txn_date DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const meta = paginationMeta({ page: pageNum, limit: pageSize, total: countRow?.total || 0 });
    res.json({
      transactions,
      pagination: {
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        totalPages: meta.pages
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Create transaction (draft or pending) */
router.post(
  '/transactions',
  requirePermission('finance.create', 'expenses.create'),
  upload.single('attachment'),
  async (req, res) => {
    try {
      await ensureChurchDefaults(req.churchId);
      const {
        txnType,
        categoryId,
        fundId,
        accountId,
        amount,
        currency,
        paymentMethod,
        referenceNumber,
        txnDate,
        memberId,
        donorName,
        description,
        status
      } = req.body;

      const type = txnType === 'expense' ? 'expense' : 'income';
      const amt = Number(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be positive' });
      if (!txnDate) return res.status(400).json({ error: 'txnDate is required' });

      let fund = fundId;
      let account = accountId;
      if (!fund) {
        const f = await db.getAsync(
          `SELECT id FROM finance_funds WHERE church_id = ? ORDER BY id LIMIT 1`,
          [req.churchId]
        );
        fund = f?.id;
      }
      if (!account) {
        const a = await db.getAsync(
          `SELECT id FROM finance_accounts WHERE church_id = ? ORDER BY id LIMIT 1`,
          [req.churchId]
        );
        account = a?.id;
      }

      const initialStatus = status === 'pending' ? 'pending' : 'draft';
      const attachment = req.file ? `finance/${req.file.filename}` : null;
      const resolved = await resolveCurrency(req.churchId, currency);
      if (!resolved.ok) return res.status(400).json({ error: resolved.error });

      const result = await db.runAsync(
        `INSERT INTO finance_transactions (
          church_id, branch_id, txn_type, category_id, fund_id, account_id,
          amount, currency, payment_method, reference_number, txn_date,
          member_id, donor_name, description, attachment_url, status, entered_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          req.user.branchId,
          type,
          categoryId || null,
          fund || null,
          account || null,
          amt,
          resolved.currency,
          normalizePaymentMethod(paymentMethod),
          referenceNumber || null,
          txnDate,
          memberId || null,
          donorName || null,
          description || null,
          attachment,
          initialStatus,
          req.user.id
        ]
      );

      res.status(201).json({
        message: 'Transaction created',
        transaction: await getTxn(result.lastID, req.churchId)
      });
      await audit(req, {
        action: 'financial_change',
        resource: 'finance_transaction',
        resourceId: result.lastID,
        summary: `Finance ${type} created (${initialStatus})`,
        newValues: { amount: amt, txnType: type, status: initialStatus, txnDate }
      });
    } catch (error) {
      console.error('Create finance txn error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/transactions/:id', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const transaction = await getTxn(req.params.id, req.churchId);
    if (!transaction) return res.status(404).json({ error: 'Not found' });
    const adjustments = await db.allAsync(
      `SELECT * FROM finance_adjustments WHERE original_txn_id = ? AND church_id = ?`,
      [transaction.id, req.churchId]
    );
    res.json({ transaction, adjustments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Update draft only — never silently alter posted */
router.put('/transactions/:id', requirePermission('finance.create'), async (req, res) => {
  try {
    const txn = await getTxn(req.params.id, req.churchId);
    if (!txn) return res.status(404).json({ error: 'Not found' });
    if (txn.status === 'posted' || txn.status === 'voided') {
      return res.status(400).json({
        error: 'Posted/voided transactions cannot be edited. Use adjustment or reversal.'
      });
    }

    const fields = {
      category_id: req.body.categoryId,
      fund_id: req.body.fundId,
      account_id: req.body.accountId,
      amount: req.body.amount != null ? Number(req.body.amount) : undefined,
      currency: req.body.currency,
      payment_method: req.body.paymentMethod
        ? normalizePaymentMethod(req.body.paymentMethod)
        : undefined,
      reference_number: req.body.referenceNumber,
      txn_date: req.body.txnDate,
      member_id: req.body.memberId,
      donor_name: req.body.donorName,
      description: req.body.description
    };

    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(txn.id, req.churchId);
    await db.runAsync(
      `UPDATE finance_transactions SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      values
    );
    res.json({ message: 'Updated', transaction: await getTxn(txn.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Submit draft → pending */
router.post('/transactions/:id/submit', requirePermission('finance.create'), async (req, res) => {
  try {
    const txn = await getTxn(req.params.id, req.churchId);
    if (!txn) return res.status(404).json({ error: 'Not found' });
    if (txn.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft transactions can be submitted' });
    }
    await db.runAsync(
      `UPDATE finance_transactions SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [txn.id]
    );
    res.json({ message: 'Submitted for approval', transaction: await getTxn(txn.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Approve & post */
router.post(
  '/transactions/:id/post',
  requirePermission('finance.approve', 'expenses.approve'),
  async (req, res) => {
    try {
      const txn = await getTxn(req.params.id, req.churchId);
      if (!txn) return res.status(404).json({ error: 'Not found' });
      if (txn.status !== 'draft' && txn.status !== 'pending') {
        return res.status(400).json({ error: `Cannot post transaction in status ${txn.status}` });
      }
      const now = new Date().toISOString();
      await db.runAsync(
        `UPDATE finance_transactions SET
          status = 'posted', approved_by = ?, approved_at = ?, posted_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [req.user.id, now, now, txn.id]
      );
      await audit(req, {
        action: 'approve',
        resource: 'finance_transaction',
        resourceId: txn.id,
        summary: `Finance transaction posted`,
        previousValues: { status: txn.status },
        newValues: { status: 'posted', amount: txn.amount, txn_type: txn.txn_type }
      });
      res.json({ message: 'Transaction posted', transaction: await getTxn(txn.id, req.churchId) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Reverse a posted transaction (creates opposite posted txn + marks original voided)
 * Never silently alters the original amounts.
 */
router.post(
  '/transactions/:id/reverse',
  requirePermission('finance.approve'),
  async (req, res) => {
    try {
      const txn = await getTxn(req.params.id, req.churchId);
      if (!txn) return res.status(404).json({ error: 'Not found' });
      if (txn.status !== 'posted') {
        return res.status(400).json({ error: 'Only posted transactions can be reversed' });
      }
      if (txn.reversal_of_id) {
        return res.status(400).json({ error: 'Cannot reverse a reversal entry' });
      }

      const reason = req.body.reason || 'Reversal';
      const opposite = txn.txn_type === 'income' ? 'expense' : 'income';
      const now = new Date().toISOString();

      const rev = await db.runAsync(
        `INSERT INTO finance_transactions (
          church_id, branch_id, txn_type, category_id, fund_id, account_id,
          amount, currency, payment_method, reference_number, txn_date,
          member_id, donor_name, description, status, entered_by, approved_by,
          approved_at, posted_at, reversal_of_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          txn.branch_id,
          opposite,
          txn.category_id,
          txn.fund_id,
          txn.account_id,
          txn.amount,
          txn.currency,
          txn.payment_method,
          txn.reference_number ? `REV-${txn.reference_number}` : `REV-${txn.id}`,
          txn.txn_date,
          txn.member_id,
          txn.donor_name,
          `REVERSAL: ${reason} (of #${txn.id})`,
          req.user.id,
          req.user.id,
          now,
          now,
          txn.id
        ]
      );

      await db.runAsync(
        `UPDATE finance_transactions SET status = 'voided', voided_at = ?, void_reason = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [now, reason, txn.id]
      );

      await db.runAsync(
        `INSERT INTO finance_adjustments (church_id, original_txn_id, adjustment_txn_id, reason, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.churchId, txn.id, rev.lastID, reason, req.user.id]
      );

      res.status(201).json({
        message: 'Transaction reversed',
        original: await getTxn(txn.id, req.churchId),
        reversal: await getTxn(rev.lastID, req.churchId)
      });
      await audit(req, {
        action: 'financial_change',
        resource: 'finance_transaction',
        resourceId: txn.id,
        summary: `Finance transaction reversed: ${reason}`,
        previousValues: { id: txn.id, amount: txn.amount, status: txn.status },
        newValues: { reversalId: rev.lastID, reason }
      });
    } catch (error) {
      console.error('Reverse error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Adjustment: create a new posted correcting entry linked to original (original stays posted)
 */
router.post(
  '/transactions/:id/adjust',
  requirePermission('finance.approve'),
  async (req, res) => {
    try {
      const txn = await getTxn(req.params.id, req.churchId);
      if (!txn) return res.status(404).json({ error: 'Not found' });
      if (txn.status !== 'posted') {
        return res.status(400).json({ error: 'Only posted transactions can be adjusted' });
      }

      const amount = Number(req.body.amount);
      if (!amount || amount === 0) {
        return res.status(400).json({ error: 'adjustment amount required (non-zero)' });
      }
      const reason = req.body.reason || 'Adjustment';
      const txnType = req.body.txnType || txn.txn_type;
      const now = new Date().toISOString();

      const adj = await db.runAsync(
        `INSERT INTO finance_transactions (
          church_id, branch_id, txn_type, category_id, fund_id, account_id,
          amount, currency, payment_method, reference_number, txn_date,
          description, status, entered_by, approved_by, approved_at, posted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)`,
        [
          req.churchId,
          txn.branch_id,
          txnType === 'expense' ? 'expense' : 'income',
          req.body.categoryId || txn.category_id,
          txn.fund_id,
          txn.account_id,
          Math.abs(amount),
          txn.currency,
          txn.payment_method,
          req.body.referenceNumber || `ADJ-${txn.id}`,
          req.body.txnDate || txn.txn_date,
          `ADJUSTMENT of #${txn.id}: ${reason}`,
          req.user.id,
          req.user.id,
          now,
          now
        ]
      );

      await db.runAsync(
        `INSERT INTO finance_adjustments (church_id, original_txn_id, adjustment_txn_id, reason, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.churchId, txn.id, adj.lastID, reason, req.user.id]
      );

      res.status(201).json({
        message: 'Adjustment posted',
        original: txn,
        adjustment: await getTxn(adj.lastID, req.churchId)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
