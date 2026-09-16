/**
 * Phase 38 — Development / demo seed data.
 *
 * Creates:
 *  - 1 Superadmin
 *  - 2 demo churches (Grace & Hope) with HQ + campus branches
 *  - Church admins + staff
 *  - Members, visitors, attendance, donations, expenses, ministries, events
 *
 * NEVER runs in production (NODE_ENV=production) unless ALLOW_DEMO_SEED=1
 * (still refuses if FORCE_PRODUCTION_SEED is unset — double guard).
 *
 * Usage:
 *   node scripts/seedDemoData.js
 *   node scripts/seedDemoData.js --force   # recreate demo tenants
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../database');
const RoleManager = require('../utils/roles');

const DEMO_MARKER = 'demo';
const CREDENTIALS_FILE = path.join(__dirname, '..', 'demo-credentials.local.json');

const CREDS = {
  superadmin: { email: 'superadmin@demo.local', password: 'DemoSuper1!', label: 'Platform Superadmin' },
  graceAdmin: { email: 'admin.grace@demo.local', password: 'DemoAdmin1!', label: 'Grace Church Admin' },
  hopeAdmin: { email: 'admin.hope@demo.local', password: 'DemoAdmin1!', label: 'Hope Church Admin' },
  graceStaff: { email: 'staff.grace@demo.local', password: 'DemoStaff1!', label: 'Grace Branch Staff' },
  hopeStaff: { email: 'staff.hope@demo.local', password: 'DemoStaff1!', label: 'Hope Branch Staff' }
};

function assertNotProduction() {
  const env = String(process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'production') {
    if (process.env.ALLOW_DEMO_SEED === '1' && process.env.FORCE_PRODUCTION_SEED === 'I_UNDERSTAND') {
      console.warn('WARNING: Seeding demo data into production (explicit override).');
      return;
    }
    console.error(
      'Refusing to seed demo data in production.\n' +
        'Demo credentials must never ship to production environments.'
    );
    process.exit(1);
  }
}

async function hash(pw) {
  return bcrypt.hash(pw, 10);
}

async function ensureRole(userId, roleCode) {
  try {
    const existing = await db.getAsync(
      `SELECT ur.id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND ur.user_type = 'branch' AND r.role_code = ? AND ur.is_active = 1`,
      [userId, roleCode]
    );
    if (!existing) {
      await RoleManager.assignRole(userId, 'branch', roleCode, null, null, null);
    }
  } catch (err) {
    console.warn(`  Role ${roleCode} for user ${userId}: ${err.message}`);
  }
}

async function wipeDemoTenants() {
  const churches = await db.allAsync(
    `SELECT id, slug FROM churches WHERE slug LIKE 'demo-%' OR email LIKE '%@demo.local'`
  );
  for (const c of churches) {
    const id = c.id;
    const tables = [
      'member_attendances',
      'attendances',
      'event_registrations',
      'events',
      'group_members',
      'group_meetings',
      'groups',
      'visitors',
      'visitor_followups',
      'finance_transactions',
      'pledges',
      'members',
      'service_types',
      'user_branch_access',
      'finance_categories',
      'finance_funds',
      'finance_accounts'
    ];
    for (const t of tables) {
      try {
        await db.runAsync(`DELETE FROM ${t} WHERE church_id = ?`, [id]);
      } catch (_) {
        /* table/column may not exist */
      }
    }
    // Branches / login accounts for this church
    try {
      await db.runAsync('DELETE FROM branches WHERE church_id = ?', [id]);
    } catch (_) { /* */ }
    await db.runAsync('DELETE FROM churches WHERE id = ?', [id]);
    console.log(`  Removed demo church ${c.slug} (id=${id})`);
  }
  // Orphan superadmin shell if marked demo
  const sa = await db.getAsync('SELECT id FROM branches WHERE email = ?', [CREDS.superadmin.email]);
  if (sa) {
    await db.runAsync('DELETE FROM branches WHERE id = ?', [sa.id]);
  }
}

async function createChurch({ name, shortName, slug, email, phone, city, color, admin }) {
  const existing = await db.getAsync('SELECT * FROM churches WHERE slug = ?', [slug]);
  if (existing) return { church: existing, reused: true };

  const result = await db.runAsync(
    `INSERT INTO churches (
      name, short_name, slug, email, phone, country, city, address,
      website_url, primary_color, secondary_color, timezone, currency, status
    ) VALUES (?, ?, ?, ?, ?, 'Liberia', ?, ?, ?, ?, ?, 'Africa/Monrovia', 'USD', 'active')`,
    [
      name,
      shortName,
      slug,
      email,
      phone,
      city,
      `${city} Demo Campus`,
      `https://${slug}.example.local`,
      color.primary,
      color.secondary
    ]
  );
  const church = await db.getAsync('SELECT * FROM churches WHERE id = ?', [result.lastID]);

  const pwd = await hash(admin.password);
  const hq = await db.runAsync(
    `INSERT INTO branches (
      branchname, branchcode, email, password, address, city, state, country, currency,
      isadmin, church_id, is_headquarters, status, phone, pastor_name, description,
      is_login_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, 'Montserrado', 'Liberia', 'USD', 1, ?, 1, 'active', ?, ?, ?, 1)`,
    [
      `${shortName} HQ`,
      `${shortName.slice(0, 3).toUpperCase()}HQ`,
      admin.email,
      pwd,
      `${city} HQ`,
      city,
      church.id,
      phone,
      `Pastor ${shortName}`,
      'Demo headquarters'
    ]
  );
  const hqId = hq.lastID;
  await ensureRole(hqId, 'PRESIDENT');

  // Second campus (no login)
  const campus = await db.runAsync(
    `INSERT INTO branches (
      branchname, branchcode, email, password, address, city, country, currency,
      isadmin, church_id, is_headquarters, status, is_login_enabled, description
    ) VALUES (?, ?, ?, ?, ?, ?, 'Liberia', 'USD', 0, ?, 0, 'active', 0, ?)`,
    [
      `${shortName} North Campus`,
      `${shortName.slice(0, 3).toUpperCase()}N`,
      `campus.${slug}@demo.local`,
      await hash('UnusedCampus1!'),
      `${city} North`,
      city,
      church.id,
      'Demo campus (login disabled)'
    ]
  );

  // Staff login account
  const staff = await db.runAsync(
    `INSERT INTO branches (
      branchname, branchcode, email, password, address, city, country, currency,
      isadmin, church_id, is_headquarters, status, is_login_enabled, description
    ) VALUES (?, ?, ?, ?, ?, ?, 'Liberia', 'USD', 0, ?, 0, 'active', 1, ?)`,
    [
      `${shortName} Staff`,
      `${shortName.slice(0, 3).toUpperCase()}ST`,
      admin.staffEmail,
      await hash(admin.staffPassword),
      `${city} Staff Desk`,
      city,
      church.id,
      'Demo branch staff'
    ]
  );
  await ensureRole(staff.lastID, 'SECRETARY');

  // Grant staff access to HQ + campus
  try {
    await db.runAsync(
      `INSERT OR IGNORE INTO user_branch_access (church_id, user_type, user_id, branch_id)
       VALUES (?, 'branch', ?, ?), (?, 'branch', ?, ?)`,
      [church.id, staff.lastID, hqId, church.id, staff.lastID, campus.lastID]
    );
  } catch (_) { /* */ }

  return {
    church,
    hqId,
    campusId: campus.lastID,
    staffId: staff.lastID,
    reused: false
  };
}

async function ensureFinanceDefaults(churchId) {
  let fund = await db.getAsync(
    `SELECT id FROM finance_funds WHERE church_id = ? AND name = 'General Fund'`,
    [churchId]
  );
  if (!fund) {
    const r = await db.runAsync(
      `INSERT INTO finance_funds (church_id, name, description) VALUES (?, 'General Fund', 'Demo operating fund')`,
      [churchId]
    );
    fund = { id: r.lastID };
  }

  let incomeCat = await db.getAsync(
    `SELECT id FROM finance_categories WHERE church_id = ? AND type = 'income' LIMIT 1`,
    [churchId]
  );
  if (!incomeCat) {
    const r = await db.runAsync(
      `INSERT INTO finance_categories (church_id, name, type, code, is_system, is_active)
       VALUES (?, 'Tithes & Offerings', 'income', 'INC-DEMO', 1, 1)`,
      [churchId]
    );
    incomeCat = { id: r.lastID };
  }

  let expenseCat = await db.getAsync(
    `SELECT id FROM finance_categories WHERE church_id = ? AND type = 'expense' LIMIT 1`,
    [churchId]
  );
  if (!expenseCat) {
    const r = await db.runAsync(
      `INSERT INTO finance_categories (church_id, name, type, code, is_system, is_active)
       VALUES (?, 'Operations', 'expense', 'EXP-DEMO', 1, 1)`,
      [churchId]
    );
    expenseCat = { id: r.lastID };
  }

  let account = await db.getAsync(
    `SELECT id FROM finance_accounts WHERE church_id = ? LIMIT 1`,
    [churchId]
  );
  if (!account) {
    const r = await db.runAsync(
      `INSERT INTO finance_accounts (church_id, name, account_type) VALUES (?, 'Cash', 'cash')`,
      [churchId]
    );
    account = { id: r.lastID };
  }

  return { fundId: fund.id, incomeCatId: incomeCat.id, expenseCatId: expenseCat.id, accountId: account.id };
}

async function ensureServiceType(churchId, branchId) {
  let st = await db.getAsync(
    `SELECT id FROM service_types WHERE church_id = ? AND branch_id = ? LIMIT 1`,
    [churchId, branchId]
  );
  if (!st) {
    try {
      const r = await db.runAsync(
        `INSERT INTO service_types (branch_id, church_id, name, category, description, is_active, qr_enabled)
         VALUES (?, ?, 'Sunday Worship', 'sunday_worship', 'Demo Sunday service', 1, 1)`,
        [branchId, churchId]
      );
      st = { id: r.lastID };
    } catch (_) {
      const r = await db.runAsync(
        `INSERT INTO service_types (branch_id, name) VALUES (?, 'Sunday Worship')`,
        [branchId]
      );
      st = { id: r.lastID };
    }
  }
  return st.id;
}

async function seedTenantData(ctx, prefix) {
  const { church, hqId, campusId } = ctx;
  const churchId = church.id;
  const fin = await ensureFinanceDefaults(churchId);
  const serviceTypeId = await ensureServiceType(churchId, hqId);

  const members = [];
  const memberSpecs = [
    { first: 'Alice', last: 'Johnson', sex: 'female', position: 'elder' },
    { first: 'Bob', last: 'Williams', sex: 'male', position: 'usher' },
    { first: 'Carol', last: 'Davis', sex: 'female', position: 'chorister' },
    { first: 'David', last: 'Brown', sex: 'male', position: 'member' },
    { first: 'Eva', last: 'Miller', sex: 'female', position: 'deaconess' }
  ];

  for (let i = 0; i < memberSpecs.length; i++) {
    const m = memberSpecs[i];
    const email = `${prefix}.member${i + 1}@demo.local`;
    const existing = await db.getAsync('SELECT id FROM members WHERE email = ?', [email]);
    if (existing) {
      members.push(existing.id);
      continue;
    }
    const branchForMember = i % 2 === 0 ? hqId : campusId || hqId;
    const r = await db.runAsync(
      `INSERT INTO members (
        branch_id, church_id, membership_id, firstname, lastname, email, phone,
        sex, position, membership_status, city, country, member_since
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, 'Liberia', date('now', '-120 days'))`,
      [
        branchForMember,
        churchId,
        `${prefix.toUpperCase()}-${1000 + i}`,
        m.first,
        m.last,
        email,
        `555-01${i}${i}`,
        m.sex,
        m.position,
        church.city || 'Monrovia'
      ]
    );
    members.push(r.lastID);
  }

  // Visitors
  for (let i = 0; i < 3; i++) {
    const email = `${prefix}.visitor${i + 1}@demo.local`;
    const exists = await db.getAsync(
      `SELECT id FROM visitors WHERE church_id = ? AND email = ?`,
      [churchId, email]
    );
    if (exists) continue;
    await db.runAsync(
      `INSERT INTO visitors (
        church_id, branch_id, firstname, lastname, phone, email, sex,
        first_visit_date, service_attended, follow_up_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now', ?), 'Sunday Worship', ?, ?)`,
      [
        churchId,
        hqId,
        ['Sam', 'Tina', 'Omar'][i],
        ['Visitor', 'Guest', 'Newcomer'][i],
        `555-88${i}0`,
        email,
        i === 1 ? 'female' : 'male',
        `-${(i + 1) * 7} days`,
        ['New', 'Contacted', 'Follow-up'][i],
        `Demo visitor for ${prefix}`
      ]
    );
  }

  // Attendance summary + member attendance
  try {
    await db.runAsync(
      `INSERT INTO attendances (branch_id, church_id, male, female, children, service_types_id, attendance_date)
       VALUES (?, ?, 12, 18, 6, ?, date('now', '-7 days'))`,
      [hqId, churchId, serviceTypeId]
    );
  } catch (_) {
    await db.runAsync(
      `INSERT INTO attendances (branch_id, male, female, children, service_types_id, attendance_date)
       VALUES (?, 12, 18, 6, ?, date('now', '-7 days'))`,
      [hqId, serviceTypeId]
    );
  }

  for (const mid of members.slice(0, 3)) {
    try {
      await db.runAsync(
        `INSERT INTO member_attendances (member_id, church_id, attendance, date, service_types_id)
         VALUES (?, ?, 'yes', date('now', '-7 days'), ?)`,
        [mid, churchId, serviceTypeId]
      );
    } catch (_) {
      await db.runAsync(
        `INSERT INTO member_attendances (member_id, attendance, date, service_types_id)
         VALUES (?, 'yes', date('now', '-7 days'), ?)`,
        [mid, serviceTypeId]
      );
    }
  }

  // Ministries / groups
  let groupId;
  const gExisting = await db.getAsync(
    `SELECT id FROM groups WHERE church_id = ? AND name = ?`,
    [churchId, 'Youth Ministry']
  );
  if (gExisting) {
    groupId = gExisting.id;
  } else {
    const g = await db.runAsync(
      `INSERT INTO groups (branch_id, church_id, name, category, description, is_active, meeting_day, meeting_time)
       VALUES (?, ?, 'Youth Ministry', 'youth', 'Demo youth fellowship', 1, 'Friday', '18:00')`,
      [hqId, churchId]
    );
    groupId = g.lastID;
  }
  if (members[0] && groupId) {
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO group_members (group_id, member_id, church_id, role)
         VALUES (?, ?, ?, 'leader')`,
        [groupId, members[0], churchId]
      );
    } catch (_) {
      await db.runAsync(
        `INSERT OR IGNORE INTO group_members (group_id, member_id) VALUES (?, ?)`,
        [groupId, members[0]]
      );
    }
  }

  // Events
  const evTitle = `${prefix} Community Outreach`;
  const evExists = await db.getAsync(
    `SELECT id FROM events WHERE church_id = ? AND title = ?`,
    [churchId, evTitle]
  );
  if (!evExists) {
    await db.runAsync(
      `INSERT INTO events (
        branch_id, church_id, title, location, venue, time, date, details, status, event_type, by_who
      ) VALUES (?, ?, ?, ?, ?, '10:00', date('now', '+14 days'), ?, 'published', 'outreach', ?)`,
      [
        hqId,
        churchId,
        evTitle,
        'Town Square',
        'Town Square',
        `Demo event for ${church.name}`,
        `Pastor ${prefix}`
      ]
    );
  }

  // Donations (income) + expenses
  await db.runAsync(
    `INSERT INTO finance_transactions (
      church_id, branch_id, txn_type, category_id, fund_id, account_id,
      amount, currency, payment_method, txn_date, member_id, donor_name, description, status
    ) VALUES (?, ?, 'income', ?, ?, ?, 250.00, 'USD', 'cash', date('now', '-3 days'), ?, ?, 'Demo Sunday offering', 'posted')`,
    [churchId, hqId, fin.incomeCatId, fin.fundId, fin.accountId, members[0] || null, `${prefix} Donor`]
  );
  await db.runAsync(
    `INSERT INTO finance_transactions (
      church_id, branch_id, txn_type, category_id, fund_id, account_id,
      amount, currency, payment_method, txn_date, description, status
    ) VALUES (?, ?, 'expense', ?, ?, ?, 75.50, 'USD', 'cash', date('now', '-2 days'), 'Demo utilities expense', 'posted')`,
    [churchId, hqId, fin.expenseCatId, fin.fundId, fin.accountId]
  );
  await db.runAsync(
    `INSERT INTO finance_transactions (
      church_id, branch_id, txn_type, category_id, fund_id, account_id,
      amount, currency, payment_method, txn_date, description, status
    ) VALUES (?, ?, 'expense', ?, ?, ?, 40.00, 'USD', 'mobile_money', date('now', '-1 days'), 'Demo supplies (pending)', 'pending')`,
    [churchId, hqId, fin.expenseCatId, fin.fundId, fin.accountId]
  );

  return { memberCount: members.length, groupId };
}

async function createSuperadmin() {
  let row = await db.getAsync('SELECT * FROM branches WHERE email = ?', [CREDS.superadmin.email]);
  if (!row) {
    // Shell church for platform admin account (not a demo tenant for isolation demos)
    let shell = await db.getAsync(`SELECT id FROM churches WHERE slug = 'demo-platform'`);
    if (!shell) {
      const cr = await db.runAsync(
        `INSERT INTO churches (name, short_name, slug, email, status, currency)
         VALUES ('Platform Shell', 'Platform', 'demo-platform', ?, 'active', 'USD')`,
        [CREDS.superadmin.email]
      );
      shell = { id: cr.lastID };
    }
    const r = await db.runAsync(
      `INSERT INTO branches (
        branchname, branchcode, email, password, city, country, currency,
        isadmin, church_id, is_platform_admin, is_headquarters, status, is_login_enabled
      ) VALUES ('Platform Admin', 'PLAT', ?, ?, 'Monrovia', 'Liberia', 'USD', 1, ?, 1, 1, 'active', 1)`,
      [CREDS.superadmin.email, await hash(CREDS.superadmin.password), shell.id]
    );
    row = await db.getAsync('SELECT * FROM branches WHERE id = ?', [r.lastID]);
  } else {
    await db.runAsync(
      'UPDATE branches SET is_platform_admin = 1, password = ?, is_login_enabled = 1 WHERE id = ?',
      [await hash(CREDS.superadmin.password), row.id]
    );
  }
  return row;
}

async function run() {
  assertNotProduction();
  const force = process.argv.includes('--force');

  console.log('Phase 38 — Demo seed data\n');

  if (force) {
    console.log('(--force) Wiping existing demo tenants…');
    await wipeDemoTenants();
  }

  const graceExists = await db.getAsync(`SELECT id FROM churches WHERE slug = 'demo-grace'`);
  const hopeExists = await db.getAsync(`SELECT id FROM churches WHERE slug = 'demo-hope'`);
  if ((graceExists || hopeExists) && !force) {
    console.log('Demo churches already present. Use --force to recreate.');
    console.log('Slugs: demo-grace, demo-hope');
    writeCredentialsFile(true);
    process.exit(0);
  }

  const sa = await createSuperadmin();
  console.log(`Superadmin ready: ${CREDS.superadmin.email} (id=${sa.id})`);

  const grace = await createChurch({
    name: 'Grace Community Church',
    shortName: 'Grace',
    slug: 'demo-grace',
    email: 'hello@demo-grace.local',
    phone: '555-1000',
    city: 'Monrovia',
    color: { primary: '#1B4F72', secondary: '#148F77' },
    admin: {
      email: CREDS.graceAdmin.email,
      password: CREDS.graceAdmin.password,
      staffEmail: CREDS.graceStaff.email,
      staffPassword: CREDS.graceStaff.password
    }
  });
  console.log(`Church Grace id=${grace.church.id} HQ=${grace.hqId}`);

  const hope = await createChurch({
    name: 'Hope Fellowship Church',
    shortName: 'Hope',
    slug: 'demo-hope',
    email: 'hello@demo-hope.local',
    phone: '555-2000',
    city: 'Gbarnga',
    color: { primary: '#6C3483', secondary: '#B9770E' },
    admin: {
      email: CREDS.hopeAdmin.email,
      password: CREDS.hopeAdmin.password,
      staffEmail: CREDS.hopeStaff.email,
      staffPassword: CREDS.hopeStaff.password
    }
  });
  console.log(`Church Hope id=${hope.church.id} HQ=${hope.hqId}`);

  const gStats = await seedTenantData(grace, 'grace');
  const hStats = await seedTenantData(hope, 'hope');
  console.log(`Seeded Grace members=${gStats.memberCount}, Hope members=${hStats.memberCount}`);

  // Isolation sanity
  const cross = await db.getAsync(
    `SELECT COUNT(*) as c FROM members WHERE church_id = ? AND email LIKE 'hope.%'`,
    [grace.church.id]
  );
  if (Number(cross?.c) > 0) {
    throw new Error('Seed isolation failure: Hope members found under Grace');
  }
  console.log('Tenant isolation check: Grace has zero Hope-prefixed members');

  writeCredentialsFile(false);
  printCredentials();
  console.log('\nDemo seed complete.');
  process.exit(0);
}

function credentialsPayload() {
  return {
    warning: 'DEMO ONLY — never use in production. File is gitignored.',
    generatedAt: new Date().toISOString(),
    accounts: [
      { ...CREDS.superadmin, role: 'superadmin' },
      { ...CREDS.graceAdmin, role: 'church_admin', church: 'demo-grace' },
      { ...CREDS.hopeAdmin, role: 'church_admin', church: 'demo-hope' },
      { ...CREDS.graceStaff, role: 'branch_staff', church: 'demo-grace' },
      { ...CREDS.hopeStaff, role: 'branch_staff', church: 'demo-hope' }
    ],
    churches: [
      { slug: 'demo-grace', name: 'Grace Community Church' },
      { slug: 'demo-hope', name: 'Hope Fellowship Church' }
    ]
  };
}

function writeCredentialsFile(existingOnly) {
  const payload = credentialsPayload();
  if (existingOnly) payload.note = 'Existing demo tenants; credentials reset not applied.';
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), CREDENTIALS_FILE)} (gitignored)`);
}

function printCredentials() {
  console.log('\n========================================');
  console.log('DEMO CREDENTIALS (development only)');
  console.log('========================================');
  for (const a of credentialsPayload().accounts) {
    console.log(`${a.label || a.role}: ${a.email} / ${a.password}`);
  }
  console.log('========================================');
  console.log('Do NOT deploy these accounts to production.');
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  run,
  CREDS,
  CREDENTIALS_FILE,
  assertNotProduction
};
