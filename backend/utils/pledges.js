const db = require('../database');
const { normalizePaymentMethod } = require('./finance');

async function nextReceiptNumber(churchId) {
  try {
    const { allocateReceiptNumber } = require('./churchSettings');
    return await allocateReceiptNumber(churchId);
  } catch (_) {
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;
    const row = await db.getAsync(
      `SELECT receipt_number FROM receipts
       WHERE church_id = ? AND receipt_number LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [churchId, `${prefix}%`]
    );
    let seq = 1;
    if (row?.receipt_number) {
      const part = row.receipt_number.split('-').pop();
      const n = parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }
}

async function createReceipt({
  churchId,
  receiptType,
  donorId,
  donorName,
  isAnonymous,
  amount,
  currency,
  paymentMethod,
  receiptDate,
  description,
  pledgeId,
  donationId,
  pledgePaymentId,
  issuedBy
}) {
  const receiptNumber = await nextReceiptNumber(churchId);
  const result = await db.runAsync(
    `INSERT INTO receipts (
      church_id, receipt_number, receipt_type, donor_id, donor_name, is_anonymous,
      amount, currency, payment_method, receipt_date, description,
      pledge_id, donation_id, pledge_payment_id, issued_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      churchId,
      receiptNumber,
      receiptType,
      donorId || null,
      isAnonymous ? 'Anonymous' : donorName || null,
      isAnonymous ? 1 : 0,
      amount,
      currency || 'USD',
      normalizePaymentMethod(paymentMethod),
      receiptDate,
      description || null,
      pledgeId || null,
      donationId || null,
      pledgePaymentId || null,
      issuedBy || null
    ]
  );
  return db.getAsync('SELECT * FROM receipts WHERE id = ?', [result.lastID]);
}

async function getChurchBranding(churchId) {
  return db.getAsync(
    `SELECT id, name, slug, logo_url, primary_color, secondary_color,
            website_url, email, phone, address, city, country
     FROM churches WHERE id = ?`,
    [churchId]
  );
}

function pledgeBalance(pledge) {
  const amount = Number(pledge.amount || 0);
  const paid = Number(pledge.amount_paid || 0);
  return Math.max(0, amount - paid);
}

module.exports = {
  nextReceiptNumber,
  createReceipt,
  getChurchBranding,
  pledgeBalance,
  normalizePaymentMethod
};
