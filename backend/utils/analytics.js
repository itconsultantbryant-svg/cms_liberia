/**
 * Phase 23 analytics helpers — tenant-scoped aggregations over existing tables.
 */
const db = require('../database');

function ageGroup(dob) {
  if (!dob) return 'unknown';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 'unknown';
  const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age < 13) return 'children';
  if (age < 18) return 'teens';
  if (age < 35) return 'young_adults';
  if (age < 55) return 'adults';
  return 'seniors';
}

function parseRange(query = {}) {
  const to = String(query.to || new Date().toISOString().slice(0, 10)).slice(0, 10);
  let from = query.from;
  if (!from) {
    const d = new Date(to);
    d.setMonth(d.getMonth() - 3);
    from = d.toISOString().slice(0, 10);
  }
  return { from: String(from).slice(0, 10), to };
}

function parseBranchId(query = {}) {
  if (query.branchId == null || query.branchId === '' || query.branchId === 'all') return null;
  const n = Number(query.branchId);
  return Number.isFinite(n) ? n : null;
}

async function membershipReport(churchId, { from, to, branchId }) {
  const params = [churchId];
  let where = 'WHERE church_id = ?';
  if (branchId) {
    where += ' AND branch_id = ?';
    params.push(branchId);
  }

  const total = await db.getAsync(`SELECT COUNT(*) as c FROM members ${where}`, params);
  const byStatus = await db.allAsync(
    `SELECT COALESCE(NULLIF(membership_status, ''), 'Unknown') as label, COUNT(*) as count
     FROM members ${where}
     GROUP BY COALESCE(NULLIF(membership_status, ''), 'Unknown')
     ORDER BY COUNT(*) DESC`,
    params
  );
  const byGender = await db.allAsync(
    `SELECT COALESCE(NULLIF(LOWER(sex), ''), 'unknown') as label, COUNT(*) as count
     FROM members ${where}
     GROUP BY COALESCE(NULLIF(LOWER(sex), ''), 'unknown')
     ORDER BY COUNT(*) DESC`,
    params
  );
  const byBranch = await db.allAsync(
    `SELECT COALESCE(b.branchname, 'Unassigned') as label, COUNT(m.id) as count
     FROM members m
     LEFT JOIN branches b ON b.id = m.branch_id
     WHERE m.church_id = ? ${branchId ? 'AND m.branch_id = ?' : ''}
     GROUP BY COALESCE(b.branchname, 'Unassigned')
     ORDER BY COUNT(m.id) DESC`,
    branchId ? [churchId, branchId] : [churchId]
  );

  const members = await db.allAsync(`SELECT dob FROM members ${where}`, params);
  const ageGroups = { children: 0, teens: 0, young_adults: 0, adults: 0, seniors: 0, unknown: 0 };
  for (const m of members) {
    const g = ageGroup(m.dob);
    ageGroups[g] = (ageGroups[g] || 0) + 1;
  }

  const newMembers = await db.getAsync(
    `SELECT COUNT(*) as c FROM members ${where}
     AND date(COALESCE(created_at, '1970-01-01')) >= date(?)
     AND date(COALESCE(created_at, '1970-01-01')) <= date(?)`,
    [...params, from, to]
  );

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const days = Math.max(1, Math.round((toDate - fromDate) / 86400000));
  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days);

  const prevNew = await db.getAsync(
    `SELECT COUNT(*) as c FROM members ${where}
     AND date(COALESCE(created_at, '1970-01-01')) >= date(?)
     AND date(COALESCE(created_at, '1970-01-01')) <= date(?)`,
    [...params, prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)]
  );

  const growth =
    (prevNew?.c || 0) === 0
      ? (newMembers?.c || 0) > 0
        ? 100
        : 0
      : Math.round((((newMembers?.c || 0) - (prevNew?.c || 0)) / (prevNew?.c || 1)) * 1000) / 10;

  return {
    total: total?.c || 0,
    newMembers: newMembers?.c || 0,
    previousPeriodNew: prevNew?.c || 0,
    growthPercent: growth,
    byStatus,
    byGender,
    byBranch,
    byAgeGroup: Object.entries(ageGroups).map(([label, count]) => ({ label, count }))
  };
}

async function attendanceReport(churchId, { from, to, branchId }) {
  let sql = `
    SELECT a.attendance_date as date, a.branch_id, b.branchname,
      COALESCE(a.male,0) as male, COALESCE(a.female,0) as female, COALESCE(a.children,0) as children,
      (COALESCE(a.male,0)+COALESCE(a.female,0)+COALESCE(a.children,0)) as total,
      a.service_types_id, st.name as service_name
    FROM attendances a
    LEFT JOIN branches b ON b.id = a.branch_id
    LEFT JOIN service_types st ON st.id = a.service_types_id
    WHERE (a.church_id = ? OR a.branch_id IN (SELECT id FROM branches WHERE church_id = ?))
      AND date(a.attendance_date) >= date(?) AND date(a.attendance_date) <= date(?)`;
  const params = [churchId, churchId, from, to];
  if (branchId) {
    sql += ' AND a.branch_id = ?';
    params.push(branchId);
  }
  sql += ' ORDER BY a.attendance_date';

  let rows = [];
  try {
    rows = await db.allAsync(sql, params);
  } catch (_) {
    rows = [];
  }

  const weeklyMap = {};
  const monthlyMap = {};
  const branchMap = {};
  const serviceMap = {};
  for (const r of rows) {
    const d = String(r.date).slice(0, 10);
    const week = `${d.slice(0, 7)}-W${Math.ceil(Number(d.slice(8, 10)) / 7)}`;
    const month = d.slice(0, 7);
    weeklyMap[week] = (weeklyMap[week] || 0) + Number(r.total || 0);
    monthlyMap[month] = (monthlyMap[month] || 0) + Number(r.total || 0);
    const bLabel = r.branchname || `Branch ${r.branch_id}`;
    branchMap[bLabel] = (branchMap[bLabel] || 0) + Number(r.total || 0);
    const sLabel = r.service_name || 'General';
    serviceMap[sLabel] = (serviceMap[sLabel] || 0) + Number(r.total || 0);
  }

  let checkins = [];
  try {
    let csql = `
      SELECT date(ma.date) as day, COUNT(*) as count
      FROM member_attendances ma
      JOIN members m ON m.id = ma.member_id
      WHERE m.church_id = ?
        AND date(ma.date) >= date(?) AND date(ma.date) <= date(?)
        AND ma.attendance = 'yes'`;
    const cparams = [churchId, from, to];
    if (branchId) {
      csql += ' AND m.branch_id = ?';
      cparams.push(branchId);
    }
    csql += ' GROUP BY date(ma.date) ORDER BY day';
    checkins = await db.allAsync(csql, cparams);
  } catch (_) {
    checkins = [];
  }

  const totalHeadcount = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return {
    totalHeadcount,
    sessions: rows.length,
    weekly: Object.entries(weeklyMap).map(([label, total]) => ({ label, total })),
    monthly: Object.entries(monthlyMap).map(([label, total]) => ({ label, total })),
    byBranch: Object.entries(branchMap).map(([label, total]) => ({ label, total })),
    byService: Object.entries(serviceMap).map(([label, total]) => ({ label, total })),
    trends: checkins,
    recent: rows.slice(-30)
  };
}

async function financeReport(churchId, { from, to, branchId }) {
  let where = `WHERE church_id = ? AND status = 'posted'
    AND date(txn_date) >= date(?) AND date(txn_date) <= date(?)`;
  const params = [churchId, from, to];
  if (branchId) {
    where += ' AND branch_id = ?';
    params.push(branchId);
  }

  let income = 0;
  let expense = 0;
  let byCategory = [];
  let monthly = [];

  try {
    const totals = await db.getAsync(
      `SELECT
         COALESCE(SUM(CASE WHEN txn_type = 'income' THEN amount ELSE 0 END), 0) as income,
         COALESCE(SUM(CASE WHEN txn_type = 'expense' THEN amount ELSE 0 END), 0) as expense
       FROM finance_transactions ${where}`,
      params
    );
    income = Number(totals?.income || 0);
    expense = Number(totals?.expense || 0);

    byCategory = await db.allAsync(
      `SELECT COALESCE(c.code, 'UNCATEGORIZED') as code,
              COALESCE(c.name, 'Uncategorized') as label,
              t.txn_type as type,
              COALESCE(SUM(t.amount), 0) as total
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
       WHERE t.church_id = ? AND t.status = 'posted'
         AND date(t.txn_date) >= date(?) AND date(t.txn_date) <= date(?)
         ${branchId ? 'AND t.branch_id = ?' : ''}
       GROUP BY t.txn_type, c.code, c.name
       ORDER BY total DESC`,
      params
    );

    monthly = await db.allAsync(
      `SELECT substr(txn_date, 1, 7) as month,
         COALESCE(SUM(CASE WHEN txn_type = 'income' THEN amount ELSE 0 END), 0) as income,
         COALESCE(SUM(CASE WHEN txn_type = 'expense' THEN amount ELSE 0 END), 0) as expense
       FROM finance_transactions ${where}
       GROUP BY substr(txn_date, 1, 7)
       ORDER BY month`,
      params
    );
  } catch (_) {
    /* finance tables may be incomplete */
  }

  const pick = (codes) =>
    byCategory
      .filter(r => r.type === 'income' && codes.includes(String(r.code || '').toUpperCase()))
      .reduce((s, r) => s + Number(r.total || 0), 0);

  let pledges = { pledged: 0, received: 0, outstanding: 0 };
  try {
    const p = await db.getAsync(
      `SELECT
         COALESCE(SUM(amount), 0) as pledged,
         COALESCE(SUM(amount_paid), 0) as received
       FROM pledges WHERE church_id = ? ${branchId ? 'AND branch_id = ?' : ''}`,
      branchId ? [churchId, branchId] : [churchId]
    );
    pledges = {
      pledged: Number(p?.pledged || 0),
      received: Number(p?.received || 0),
      outstanding: Math.max(0, Number(p?.pledged || 0) - Number(p?.received || 0))
    };
  } catch (_) {
    /* ignore */
  }

  let budget = null;
  try {
    budget = await db.getAsync(
      `SELECT id, name, fiscal_year, status, total_income, total_expense
       FROM budgets WHERE church_id = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
      [churchId]
    );
  } catch (_) {
    budget = null;
  }

  return {
    income,
    expense,
    net: income - expense,
    tithes: pick(['TITHES', 'TITHE']),
    offerings: pick(['OFFERINGS', 'OFFERING']),
    donations: pick(['DONATIONS', 'DONATION', 'GIFTS']),
    byCategory,
    monthly,
    pledges,
    budget,
    cashFlow: monthly.map(m => ({
      month: m.month,
      income: Number(m.income),
      expense: Number(m.expense),
      net: Number(m.income) - Number(m.expense)
    }))
  };
}

async function ministryReport(churchId, { branchId }) {
  let sql = `
    SELECT g.id, g.name, g.category, g.branch_id, b.branchname,
      (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
      (SELECT COUNT(*) FROM group_meetings mt WHERE mt.group_id = g.id) as meeting_count,
      (SELECT COALESCE(SUM(attendance_count),0) FROM group_meetings mt WHERE mt.group_id = g.id) as attendance_total,
      (SELECT COUNT(*) FROM group_announcements ga WHERE ga.group_id = g.id) as announcement_count
    FROM groups g
    LEFT JOIN branches b ON b.id = g.branch_id
    WHERE (g.church_id = ? OR g.branch_id IN (SELECT id FROM branches WHERE church_id = ?))
      AND (g.is_active = 1 OR g.is_active IS NULL)`;
  const params = [churchId, churchId];
  if (branchId) {
    sql += ' AND g.branch_id = ?';
    params.push(branchId);
  }
  sql += ' ORDER BY member_count DESC, g.name';

  const ministries = await db.allAsync(sql, params);
  return {
    totalMinistries: ministries.length,
    totalMembers: ministries.reduce((s, m) => s + Number(m.member_count || 0), 0),
    ministries
  };
}

async function overviewReport(churchId, range) {
  const [membership, attendance, finance, ministry] = await Promise.all([
    membershipReport(churchId, range),
    attendanceReport(churchId, range),
    financeReport(churchId, range),
    ministryReport(churchId, range)
  ]);
  return {
    range: { from: range.from, to: range.to, branchId: range.branchId },
    membership: {
      total: membership.total,
      newMembers: membership.newMembers,
      growthPercent: membership.growthPercent
    },
    attendance: {
      totalHeadcount: attendance.totalHeadcount,
      sessions: attendance.sessions
    },
    finance: {
      income: finance.income,
      expense: finance.expense,
      net: finance.net,
      tithes: finance.tithes,
      offerings: finance.offerings
    },
    ministry: {
      totalMinistries: ministry.totalMinistries,
      totalMembers: ministry.totalMembers
    }
  };
}

function toCsv(rows, columns) {
  const header = columns.map(c => c.label).join(',');
  const lines = (rows || []).map(row =>
    columns
      .map(c => {
        const v = row[c.key];
        const s = v == null ? '' : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

module.exports = {
  parseRange,
  parseBranchId,
  membershipReport,
  attendanceReport,
  financeReport,
  ministryReport,
  overviewReport,
  toCsv,
  ageGroup
};
