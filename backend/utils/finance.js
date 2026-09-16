const PAYMENT_METHODS = ['cash', 'bank', 'mobile_money', 'check', 'card', 'other'];
const TXN_STATUSES = ['draft', 'pending', 'posted', 'voided'];

function normalizePaymentMethod(m) {
  const v = String(m || 'cash').toLowerCase().replace(/\s+/g, '_');
  if (v === 'mobile' || v === 'momo') return 'mobile_money';
  if (v === 'cheque') return 'check';
  return PAYMENT_METHODS.includes(v) ? v : 'other';
}

module.exports = { PAYMENT_METHODS, TXN_STATUSES, normalizePaymentMethod };
