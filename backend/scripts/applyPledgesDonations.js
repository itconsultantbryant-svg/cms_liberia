/**
 * Phase 14: Pledges, donations, receipts tables.
 */
const db = require('../database');

async function apply() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      donor_type TEXT NOT NULL DEFAULT 'individual'
        CHECK(donor_type IN ('individual', 'organization')),
      member_id INTEGER,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      organization_name TEXT,
      address TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS pledges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      donor_id INTEGER,
      member_id INTEGER,
      donor_name TEXT,
      title TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      amount_paid REAL DEFAULT 0,
      frequency TEXT DEFAULT 'one_time'
        CHECK(frequency IN ('one_time', 'weekly', 'monthly', 'quarterly', 'yearly')),
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'completed', 'cancelled', 'defaulted')),
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS pledge_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      pledge_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_method TEXT DEFAULT 'cash',
      payment_date TEXT NOT NULL,
      reference_number TEXT,
      notes TEXT,
      receipt_id INTEGER,
      finance_txn_id INTEGER,
      recorded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      branch_id INTEGER,
      donor_id INTEGER,
      member_id INTEGER,
      donor_name TEXT,
      is_anonymous INTEGER DEFAULT 0,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_method TEXT DEFAULT 'cash',
      donation_date TEXT NOT NULL,
      category TEXT DEFAULT 'Donation',
      purpose TEXT,
      reference_number TEXT,
      notes TEXT,
      receipt_id INTEGER,
      finance_txn_id INTEGER,
      recorded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL,
      receipt_type TEXT NOT NULL CHECK(receipt_type IN ('donation', 'pledge_payment')),
      donor_id INTEGER,
      donor_name TEXT,
      is_anonymous INTEGER DEFAULT 0,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_method TEXT,
      receipt_date TEXT NOT NULL,
      description TEXT,
      pledge_id INTEGER,
      donation_id INTEGER,
      pledge_payment_id INTEGER,
      issued_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(church_id, receipt_number)
    )
  `);

  try {
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_pledges_church_status ON pledges(church_id, status)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_donations_church_date ON donations(church_id, donation_date)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_receipts_number ON receipts(receipt_number)');
  } catch (_) { /* ignore */ }

  console.log('Pledges & donations schema ensure complete.');
  process.exit(0);
}

apply().catch(err => {
  console.error(err);
  process.exit(1);
});
