const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');
const {
  createReceipt,
  getChurchBranding,
  pledgeBalance,
  normalizePaymentMethod
} = require('../utils/pledges');

router.use(authMiddleware, requireTenant, attachRoleInfo);

async function getPledge(id, churchId) {
  return db.getAsync(
    `SELECT p.*, d.name as donor_record_name, d.donor_type, d.organization_name,
            (p.amount - COALESCE(p.amount_paid, 0)) as balance
     FROM pledges p
     LEFT JOIN donors d ON d.id = p.donor_id
     WHERE p.id = ? AND p.church_id = ?`,
    [id, churchId]
  );
}

async function maybePostFinanceIncome({
  churchId,
  branchId,
  amount,
  currency,
  paymentMethod,
  referenceNumber,
  txnDate,
  description,
  donorName,
  memberId,
  enteredBy
}) {
  try {
    const cat = await db.getAsync(
      `SELECT id FROM finance_categories
       WHERE (church_id IS NULL OR church_id = ?) AND type = 'income'
         AND (code IN ('PLEDGES','DONATIONS') OR name LIKE '%Pledge%' OR name LIKE '%Donation%')
       ORDER BY CASE WHEN code = 'PLEDGES' THEN 0 WHEN code = 'DONATIONS' THEN 1 ELSE 2 END
       LIMIT 1`,
      [churchId]
    );
    const fund = await db.getAsync(
      `SELECT id FROM finance_funds WHERE church_id = ? ORDER BY id LIMIT 1`,
      [churchId]
    );
    const account = await db.getAsync(
      `SELECT id FROM finance_accounts WHERE church_id = ? ORDER BY id LIMIT 1`,
      [churchId]
    );
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `INSERT INTO finance_transactions (
        church_id, branch_id, txn_type, category_id, fund_id, account_id,
        amount, currency, payment_method, reference_number, txn_date,
        member_id, donor_name, description, status, entered_by, approved_by, approved_at, posted_at
      ) VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)`,
      [
        churchId,
        branchId,
        cat?.id || null,
        fund?.id || null,
        account?.id || null,
        amount,
        currency || 'USD',
        normalizePaymentMethod(paymentMethod),
        referenceNumber || null,
        txnDate,
        memberId || null,
        donorName || null,
        description,
        enteredBy,
        enteredBy,
        now,
        now
      ]
    );
    return result.lastID;
  } catch (_) {
    return null;
  }
}

/** Donors */
router.get('/donors', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const { q } = req.query;
    let sql = `SELECT * FROM donors WHERE church_id = ? AND is_active = 1`;
    const params = [req.churchId];
    if (q) {
      sql += ' AND (name LIKE ? OR organization_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY name';
    res.json({ donors: await db.allAsync(sql, params) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/donors', requirePermission('finance.create'), async (req, res) => {
  try {
    const {
      donorType,
      name,
      email,
      phone,
      organizationName,
      address,
      memberId,
      notes
    } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await db.runAsync(
      `INSERT INTO donors (
        church_id, donor_type, member_id, name, email, phone, organization_name, address, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        donorType === 'organization' ? 'organization' : 'individual',
        memberId || null,
        name,
        email || null,
        phone || null,
        organizationName || null,
        address || null,
        notes || null
      ]
    );
    const donor = await db.getAsync('SELECT * FROM donors WHERE id = ?', [result.lastID]);
    res.status(201).json({ message: 'Donor created', donor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Pledges list */
router.get('/pledges', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const { status, q } = req.query;
    let sql = `SELECT p.*, d.name as donor_record_name,
                (p.amount - COALESCE(p.amount_paid, 0)) as balance
               FROM pledges p
               LEFT JOIN donors d ON d.id = p.donor_id
               WHERE p.church_id = ?`;
    const params = [req.churchId];
    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (q) {
      sql += ' AND (p.donor_name LIKE ? OR p.title LIKE ? OR d.name LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY p.created_at DESC';
    const pledges = await db.allAsync(sql, params);

    const outstanding = await db.getAsync(
      `SELECT
         COALESCE(SUM(amount - COALESCE(amount_paid, 0)), 0) as total,
         COUNT(*) as count
       FROM pledges
       WHERE church_id = ? AND status = 'active' AND (amount - COALESCE(amount_paid, 0)) > 0`,
      [req.churchId]
    );

    res.json({ pledges, outstanding });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pledges', requirePermission('finance.create'), async (req, res) => {
  try {
    const {
      donorId,
      memberId,
      donorName,
      title,
      amount,
      currency,
      frequency,
      startDate,
      endDate,
      notes
    } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be positive' });

    let name = donorName;
    if (!name && donorId) {
      const d = await db.getAsync('SELECT name FROM donors WHERE id = ? AND church_id = ?', [
        donorId,
        req.churchId
      ]);
      name = d?.name;
    }

    const { resolveCurrency } = require('../utils/currencies');
    const resolved = await resolveCurrency(req.churchId, currency);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });

    const result = await db.runAsync(
      `INSERT INTO pledges (
        church_id, branch_id, donor_id, member_id, donor_name, title, amount, currency,
        amount_paid, frequency, start_date, end_date, status, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?, ?)`,
      [
        req.churchId,
        req.user.branchId,
        donorId || null,
        memberId || null,
        name || null,
        title || 'Pledge',
        amt,
        resolved.currency,
        frequency || 'one_time',
        startDate || new Date().toISOString().slice(0, 10),
        endDate || null,
        notes || null,
        req.user.id
      ]
    );
    res.status(201).json({ message: 'Pledge created', pledge: await getPledge(result.lastID, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pledges/:id', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const pledge = await getPledge(req.params.id, req.churchId);
    if (!pledge) return res.status(404).json({ error: 'Pledge not found' });
    const payments = await db.allAsync(
      `SELECT * FROM pledge_payments WHERE pledge_id = ? AND church_id = ? ORDER BY payment_date DESC, id DESC`,
      [pledge.id, req.churchId]
    );
    res.json({ pledge, payments, balance: pledgeBalance(pledge) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Record pledge payment (partial OK) */
router.post('/pledges/:id/payments', requirePermission('finance.create'), async (req, res) => {
  try {
    const pledge = await getPledge(req.params.id, req.churchId);
    if (!pledge) return res.status(404).json({ error: 'Pledge not found' });
    if (pledge.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot pay a cancelled pledge' });
    }

    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });

    const balance = pledgeBalance(pledge);
    if (amount > balance + 0.0001) {
      return res.status(400).json({ error: `Payment exceeds outstanding balance (${balance})` });
    }

    const paymentDate = req.body.paymentDate || new Date().toISOString().slice(0, 10);
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);
    const { resolveCurrency } = require('../utils/currencies');
    const resolved = await resolveCurrency(req.churchId, req.body.currency || pledge.currency);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const currency = resolved.currency;

    const payResult = await db.runAsync(
      `INSERT INTO pledge_payments (
        church_id, pledge_id, amount, currency, payment_method, payment_date,
        reference_number, notes, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        pledge.id,
        amount,
        currency,
        paymentMethod,
        paymentDate,
        req.body.referenceNumber || null,
        req.body.notes || null,
        req.user.id
      ]
    );

    const newPaid = Number(pledge.amount_paid || 0) + amount;
    const completed = newPaid >= Number(pledge.amount) - 0.0001;
    await db.runAsync(
      `UPDATE pledges SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newPaid, completed ? 'completed' : 'active', pledge.id]
    );

    const displayName = pledge.donor_name || pledge.donor_record_name || 'Donor';
    const receipt = await createReceipt({
      churchId: req.churchId,
      receiptType: 'pledge_payment',
      donorId: pledge.donor_id,
      donorName: displayName,
      isAnonymous: false,
      amount,
      currency,
      paymentMethod,
      receiptDate: paymentDate,
      description: `Pledge payment — ${pledge.title || 'Pledge'} (#${pledge.id})`,
      pledgeId: pledge.id,
      pledgePaymentId: payResult.lastID,
      issuedBy: req.user.id
    });

    await db.runAsync('UPDATE pledge_payments SET receipt_id = ? WHERE id = ?', [
      receipt.id,
      payResult.lastID
    ]);

    const financeTxnId = await maybePostFinanceIncome({
      churchId: req.churchId,
      branchId: pledge.branch_id || req.user.branchId,
      amount,
      currency,
      paymentMethod,
      referenceNumber: req.body.referenceNumber || receipt.receipt_number,
      txnDate: paymentDate,
      description: `Pledge payment ${receipt.receipt_number}`,
      donorName: displayName,
      memberId: pledge.member_id,
      enteredBy: req.user.id
    });
    if (financeTxnId) {
      await db.runAsync('UPDATE pledge_payments SET finance_txn_id = ? WHERE id = ?', [
        financeTxnId,
        payResult.lastID
      ]);
    }

    const payment = await db.getAsync('SELECT * FROM pledge_payments WHERE id = ?', [payResult.lastID]);
    res.status(201).json({
      message: 'Payment recorded',
      payment,
      pledge: await getPledge(pledge.id, req.churchId),
      receipt
    });
  } catch (error) {
    console.error('Pledge payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/pledges/:id', requirePermission('finance.create'), async (req, res) => {
  try {
    const pledge = await getPledge(req.params.id, req.churchId);
    if (!pledge) return res.status(404).json({ error: 'Not found' });
    const status = req.body.status;
    if (status && !['active', 'completed', 'cancelled', 'defaulted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await db.runAsync(
      `UPDATE pledges SET
        title = COALESCE(?, title),
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        end_date = COALESCE(?, end_date),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.body.title ?? null, req.body.notes ?? null, status ?? null, req.body.endDate ?? null, pledge.id]
    );
    res.json({ message: 'Updated', pledge: await getPledge(pledge.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Donations (incl. anonymous) */
router.get('/donations', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const donations = await db.allAsync(
      `SELECT * FROM donations WHERE church_id = ? ORDER BY donation_date DESC, id DESC LIMIT 100`,
      [req.churchId]
    );
    res.json({ donations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/donations', requirePermission('finance.create'), async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });

    const isAnonymous = !!req.body.isAnonymous || !!req.body.anonymous;
    const donationDate = req.body.donationDate || new Date().toISOString().slice(0, 10);
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);
    const { resolveCurrency } = require('../utils/currencies');
    const resolved = await resolveCurrency(req.churchId, req.body.currency);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const currency = resolved.currency;

    let donorName = req.body.donorName;
    if (isAnonymous) donorName = 'Anonymous';
    else if (!donorName && req.body.donorId) {
      const d = await db.getAsync('SELECT name FROM donors WHERE id = ? AND church_id = ?', [
        req.body.donorId,
        req.churchId
      ]);
      donorName = d?.name;
    }

    const result = await db.runAsync(
      `INSERT INTO donations (
        church_id, branch_id, donor_id, member_id, donor_name, is_anonymous,
        amount, currency, payment_method, donation_date, category, purpose,
        reference_number, notes, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        req.user.branchId,
        req.body.donorId || null,
        req.body.memberId || null,
        donorName || null,
        isAnonymous ? 1 : 0,
        amount,
        currency,
        paymentMethod,
        donationDate,
        req.body.category || 'Donation',
        req.body.purpose || null,
        req.body.referenceNumber || null,
        req.body.notes || null,
        req.user.id
      ]
    );

    const receipt = await createReceipt({
      churchId: req.churchId,
      receiptType: 'donation',
      donorId: req.body.donorId,
      donorName: donorName || 'Donor',
      isAnonymous,
      amount,
      currency,
      paymentMethod,
      receiptDate: donationDate,
      description: req.body.purpose || req.body.category || 'Donation',
      donationId: result.lastID,
      issuedBy: req.user.id
    });

    await db.runAsync('UPDATE donations SET receipt_id = ? WHERE id = ?', [receipt.id, result.lastID]);

    const financeTxnId = await maybePostFinanceIncome({
      churchId: req.churchId,
      branchId: req.user.branchId,
      amount,
      currency,
      paymentMethod,
      referenceNumber: req.body.referenceNumber || receipt.receipt_number,
      txnDate: donationDate,
      description: `Donation ${receipt.receipt_number}`,
      donorName: isAnonymous ? 'Anonymous' : donorName,
      memberId: req.body.memberId,
      enteredBy: req.user.id
    });
    if (financeTxnId) {
      await db.runAsync('UPDATE donations SET finance_txn_id = ? WHERE id = ?', [
        financeTxnId,
        result.lastID
      ]);
    }

    const donation = await db.getAsync('SELECT * FROM donations WHERE id = ?', [result.lastID]);
    res.status(201).json({ message: 'Donation recorded', donation, receipt });
  } catch (error) {
    console.error('Donation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Receipts */
router.get('/receipts', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const receipts = await db.allAsync(
      `SELECT * FROM receipts WHERE church_id = ? ORDER BY created_at DESC LIMIT 100`,
      [req.churchId]
    );
    res.json({ receipts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/receipts/:id', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const receipt = await db.getAsync(
      'SELECT * FROM receipts WHERE id = ? AND church_id = ?',
      [req.params.id, req.churchId]
    );
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    const church = await getChurchBranding(req.churchId);
    res.json({
      receipt,
      church: church
        ? {
            name: church.name,
            logoUrl: church.logo_url
              ? church.logo_url.startsWith('/')
                ? church.logo_url
                : `/uploads/branding/${church.logo_url.split('/').pop()}`
              : null,
            primaryColor: church.primary_color,
            secondaryColor: church.secondary_color,
            website: church.website_url,
            email: church.email,
            phone: church.phone,
            address: [church.address, church.city, church.country].filter(Boolean).join(', ')
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Donor statement */
router.get('/donors/:id/statement', requirePermission('finance.view', 'finance.create'), async (req, res) => {
  try {
    const donor = await db.getAsync('SELECT * FROM donors WHERE id = ? AND church_id = ?', [
      req.params.id,
      req.churchId
    ]);
    if (!donor) return res.status(404).json({ error: 'Donor not found' });

    const pledges = await db.allAsync(
      `SELECT *, (amount - COALESCE(amount_paid, 0)) as balance FROM pledges
       WHERE church_id = ? AND donor_id = ? ORDER BY created_at DESC`,
      [req.churchId, donor.id]
    );
    const donations = await db.allAsync(
      `SELECT * FROM donations WHERE church_id = ? AND donor_id = ? ORDER BY donation_date DESC`,
      [req.churchId, donor.id]
    );
    const payments = await db.allAsync(
      `SELECT pp.*, p.title as pledge_title
       FROM pledge_payments pp
       JOIN pledges p ON p.id = pp.pledge_id
       WHERE pp.church_id = ? AND p.donor_id = ?
       ORDER BY pp.payment_date DESC`,
      [req.churchId, donor.id]
    );
    const receipts = await db.allAsync(
      `SELECT * FROM receipts WHERE church_id = ? AND donor_id = ? ORDER BY receipt_date DESC`,
      [req.churchId, donor.id]
    );

    const donated = donations.reduce((s, d) => s + Number(d.amount || 0), 0);
    const pledgedPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const outstanding = pledges
      .filter(p => p.status === 'active')
      .reduce((s, p) => s + Number(p.balance || 0), 0);

    res.json({
      donor,
      pledges,
      donations,
      payments,
      receipts,
      summary: {
        totalDonations: donated,
        totalPledgePayments: pledgedPaid,
        outstandingPledges: outstanding
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
