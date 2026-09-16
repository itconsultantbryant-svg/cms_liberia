const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { isSubUser, requireSubUserPermission } = require('../middleware/subUserAuth');
const { requirePermission } = require('../utils/rbac');

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function parseDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

async function resolveMember(churchId, { memberId, membershipId, member_id, membership_id }) {
  const id = memberId || member_id;
  const mid = membershipId || membership_id;
  if (id) {
    return db.getAsync('SELECT * FROM members WHERE id = ? AND church_id = ?', [id, churchId]);
  }
  if (mid) {
    return db.getAsync(
      'SELECT * FROM members WHERE membership_id = ? AND church_id = ?',
      [mid, churchId]
    );
  }
  return null;
}

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

// Mark attendance (member selection)
router.post('/mark', authMiddleware, attachRoleInfo, requirePermission('attendance.manage'), async (req, res) => {
  try {
    const { date, attendance, type, serviceId } = req.body;
    const serviceTypesId = type || serviceId;
    if (!date || !serviceTypesId) {
      return res.status(400).json({ error: 'date and service type are required' });
    }
    if (new Date(date) > new Date()) {
      return res.status(400).json({ error: "Can't save attendance for a future date" });
    }

    const member = await resolveMember(req.churchId, req.body);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const dateStr = parseDate(date);
    const existing = await db.getAsync(
      `SELECT id FROM member_attendances
       WHERE date = ? AND member_id = ? AND service_types_id = ?`,
      [dateStr, member.id, serviceTypesId]
    );
    if (existing) {
      await db.runAsync(
        `UPDATE member_attendances SET attendance = ?, check_in_method = ?
         WHERE id = ?`,
        [attendance || 'yes', req.body.method || 'manual', existing.id]
      );
      return res.json({ message: 'Attendance updated', id: existing.id });
    }

    const result = await db.runAsync(
      `INSERT INTO member_attendances
        (member_id, attendance, date, service_types_id, church_id, branch_id, check_in_method)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        member.id,
        attendance || 'yes',
        dateStr,
        serviceTypesId,
        req.churchId,
        member.branch_id || req.user.branchId,
        req.body.method || 'manual'
      ]
    );
    res.json({ message: 'Attendance marked successfully', id: result.lastID });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Check-in by membership ID or QR token (QR-ready) */
router.post('/check-in', authMiddleware, attachRoleInfo, requirePermission('attendance.manage'), async (req, res) => {
  try {
    let serviceId = req.body.serviceId || req.body.type;
    let dateStr = req.body.date ? parseDate(req.body.date) : todayStr();

    if (req.body.token) {
      try {
        const raw = Buffer.from(req.body.token, 'base64url').toString('utf8');
        const parsed = JSON.parse(raw);
        if (Number(parsed.c) !== Number(req.churchId)) {
          return res.status(403).json({ error: 'QR token church mismatch' });
        }
        serviceId = parsed.s;
        dateStr = parsed.d || dateStr;
      } catch (_) {
        return res.status(400).json({ error: 'Invalid QR token' });
      }
    }

    if (!serviceId) return res.status(400).json({ error: 'serviceId or token required' });

    const member = await resolveMember(req.churchId, req.body);
    if (!member) return res.status(404).json({ error: 'Member not found (provide memberId or membershipId)' });

    const existing = await db.getAsync(
      `SELECT id FROM member_attendances
       WHERE date = ? AND member_id = ? AND service_types_id = ?`,
      [dateStr, member.id, serviceId]
    );
    if (existing) {
      return res.json({ message: 'Already checked in', already: true, id: existing.id });
    }

    const result = await db.runAsync(
      `INSERT INTO member_attendances
        (member_id, attendance, date, service_types_id, church_id, branch_id, check_in_method)
       VALUES (?, 'yes', ?, ?, ?, ?, ?)`,
      [
        member.id,
        dateStr,
        serviceId,
        req.churchId,
        member.branch_id || req.user.branchId,
        req.body.token ? 'qr' : req.body.method || 'membership_id'
      ]
    );

    res.status(201).json({
      message: 'Checked in',
      id: result.lastID,
      member: {
        id: member.id,
        membership_id: member.membership_id,
        name: `${member.firstname} ${member.lastname}`
      }
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark bulk attendance (per date + service)
router.post('/mark-bulk', authMiddleware, attachRoleInfo, requirePermission('attendance.manage'), async (req, res) => {
  try {
    const { date, members, type, serviceId } = req.body;
    const serviceTypesId = type || serviceId;
    if (!date || !serviceTypesId || !Array.isArray(members)) {
      return res.status(400).json({ error: 'date, service type, and members[] required' });
    }
    if (new Date(date) > new Date()) {
      return res.status(400).json({ error: "Can't save attendance for a future date" });
    }

    const dateStr = parseDate(date);
    let saved = 0;
    let updated = 0;

    for (const row of members) {
      const memberId = row.id || row.memberId || row.member_id;
      if (!memberId) continue;
      const member = await db.getAsync(
        'SELECT id, branch_id FROM members WHERE id = ? AND church_id = ?',
        [memberId, req.churchId]
      );
      if (!member) continue;

      const att = row.attendance || 'yes';
      const existing = await db.getAsync(
        `SELECT id FROM member_attendances
         WHERE date = ? AND member_id = ? AND service_types_id = ?`,
        [dateStr, member.id, serviceTypesId]
      );
      if (existing) {
        await db.runAsync(
          `UPDATE member_attendances SET attendance = ?, check_in_method = 'bulk' WHERE id = ?`,
          [att, existing.id]
        );
        updated++;
      } else {
        await db.runAsync(
          `INSERT INTO member_attendances
            (member_id, attendance, date, service_types_id, church_id, branch_id, check_in_method)
           VALUES (?, ?, ?, ?, ?, ?, 'bulk')`,
          [member.id, att, dateStr, serviceTypesId, req.churchId, member.branch_id || req.user.branchId]
        );
        saved++;
      }
    }

    res.json({ message: 'Bulk attendance saved', saved, updated });
  } catch (error) {
    console.error('Mark bulk attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save attendance (summary headcount)
router.post('/submit', authMiddleware, isSubUser, requireSubUserPermission('record_attendance'), async (req, res) => {
  try {
    const { date, male, female, children, type, serviceId } = req.body;
    const serviceTypesId = type || serviceId;

    if (!date || !serviceTypesId) {
      return res.status(400).json({ error: 'date and service type are required' });
    }
    if (new Date(date) > new Date()) {
      return res.status(400).json({ error: "Can't save attendance for a future date" });
    }

    const dateStr = parseDate(date);

    const existing = await db.getAsync(
      `SELECT id FROM attendances
       WHERE attendance_date = ? AND branch_id = ? AND service_types_id = ?`,
      [dateStr, req.user.branchId, serviceTypesId]
    );

    if (existing) {
      await db.runAsync(
        `UPDATE attendances SET male = ?, female = ?, children = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [male || 0, female || 0, children || 0, existing.id]
      );
      return res.json({ message: 'Attendance updated', id: existing.id });
    }

    const result = await db.runAsync(
      `INSERT INTO attendances
        (branch_id, church_id, male, female, children, service_types_id, attendance_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.branchId, req.churchId, male || 0, female || 0, children || 0, serviceTypesId, dateStr]
    );

    if (req.userType === 'sub_user') {
      await db.runAsync(
        `INSERT INTO pending_approvals (branch_id, church_id, submitted_by, submitted_by_type, approval_type, reference_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.branchId, req.churchId, req.user.id, 'sub_user', 'attendance', result.lastID, 'pending']
      );
      return res.json({
        message: 'Attendance submitted successfully. Waiting for Resident Pastor approval.',
        requiresApproval: true
      });
    }

    res.json({ message: 'Attendance successfully saved', id: result.lastID });
  } catch (error) {
    console.error('Submit attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get attendance by date
router.get('/view/:date', authMiddleware, async (req, res) => {
  try {
    const dateStr = parseDate(req.params.date);
    const attendance = await db.getAsync(
      `SELECT a.*, st.name as service_type_name
      FROM attendances a
      LEFT JOIN service_types st ON a.service_types_id = st.id
      WHERE a.attendance_date = ? AND a.branch_id = ?`,
      [dateStr, req.user.branchId]
    );

    if (!attendance) {
      return res.status(404).json({ error: 'No attendance data for this date' });
    }

    res.json({ attendance });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all attendances (summary)
router.get('/view', authMiddleware, async (req, res) => {
  try {
    const attendances = await db.allAsync(
      `SELECT a.*, st.name as service_type_name
      FROM attendances a
      LEFT JOIN service_types st ON a.service_types_id = st.id
      WHERE a.branch_id = ? ORDER BY a.attendance_date DESC`,
      [req.user.branchId]
    );
    res.json(attendances);
  } catch (error) {
    console.error('Get attendances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Member-level attendance for a date/service */
router.get('/members', authMiddleware, async (req, res) => {
  try {
    const { date, serviceId } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const dateStr = parseDate(date);
    let sql = `
      SELECT ma.*, m.firstname, m.lastname, m.membership_id, m.sex, m.ministry, st.name as service_name
      FROM member_attendances ma
      JOIN members m ON m.id = ma.member_id
      LEFT JOIN service_types st ON st.id = ma.service_types_id
      WHERE ma.date = ? AND m.church_id = ?`;
    const params = [dateStr, req.churchId];
    if (serviceId) {
      sql += ' AND ma.service_types_id = ?';
      params.push(serviceId);
    }
    if (!req.user?.isadmin) {
      sql += ' AND m.branch_id = ?';
      params.push(req.user.branchId);
    }
    sql += ' ORDER BY m.firstname, m.lastname';
    const rows = await db.allAsync(sql, params);
    res.json({ records: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get attendance analysis (legacy)
router.get('/analysis', authMiddleware, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const monthly = await db.allAsync(
      `SELECT
        SUM(male) as male,
        SUM(female) as female,
        SUM(children) as children,
        strftime('%m', attendance_date) as month
      FROM attendances
      WHERE strftime('%Y', attendance_date) = ? AND branch_id = ?
      GROUP BY month`,
      [currentYear.toString(), req.user.branchId]
    );
    const weekly = await db.allAsync(
      `SELECT
        SUM(male) as male,
        SUM(female) as female,
        SUM(children) as children,
        strftime('%w', attendance_date) as day
      FROM attendances
      WHERE attendance_date >= date('now', '-7 days') AND branch_id = ?
      GROUP BY day`,
      [req.user.branchId]
    );
    res.json({ monthly, weekly });
  } catch (error) {
    console.error('Get attendance analysis error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get attendance stats (legacy monthly)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await db.allAsync(
      `SELECT
        COUNT(id) as total,
        SUM(male) as male,
        SUM(female) as female,
        SUM(children) as children,
        strftime('%m', attendance_date) as month
      FROM attendances
      WHERE attendance_date >= date('now', '-12 months') AND branch_id = ?
      GROUP BY month`,
      [req.user.branchId]
    );
    res.json(stats);
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Detailed stats: groupBy = service|date|branch|gender|age_group|ministry|month|quarter|year
 */
router.get('/stats/detailed', authMiddleware, async (req, res) => {
  try {
    const groupBy = (req.query.groupBy || 'service').toLowerCase();
    const year = req.query.year || new Date().getFullYear().toString();
    const from = req.query.from;
    const to = req.query.to;

    let dateFilter = 'm.church_id = ?';
    const params = [req.churchId];
    if (from) {
      dateFilter += ' AND ma.date >= ?';
      params.push(from);
    }
    if (to) {
      dateFilter += ' AND ma.date <= ?';
      params.push(to);
    }
    if (!from && !to) {
      dateFilter += ` AND strftime('%Y', ma.date) = ?`;
      params.push(year);
    }
    if (!req.user?.isadmin) {
      dateFilter += ' AND m.branch_id = ?';
      params.push(req.user.branchId);
    }
    if (req.query.branchId && req.user?.isadmin) {
      dateFilter += ' AND m.branch_id = ?';
      params.push(req.query.branchId);
    }
    if (req.query.serviceId) {
      dateFilter += ' AND ma.service_types_id = ?';
      params.push(req.query.serviceId);
    }

    dateFilter += ` AND ma.attendance = 'yes'`;

    // Headcount summary from attendances table
    const headcount = await db.getAsync(
      `SELECT
         COALESCE(SUM(male),0) as male,
         COALESCE(SUM(female),0) as female,
         COALESCE(SUM(children),0) as children,
         COALESCE(SUM(male+female+children),0) as total
       FROM attendances a
       WHERE a.church_id = ? OR a.branch_id IN (SELECT id FROM branches WHERE church_id = ?)`,
      [req.churchId, req.churchId]
    ).catch(() => ({ male: 0, female: 0, children: 0, total: 0 }));

    let rows = [];

    if (groupBy === 'gender') {
      rows = await db.allAsync(
        `SELECT m.sex as key, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}
         GROUP BY m.sex`,
        params
      );
    } else if (groupBy === 'ministry') {
      rows = await db.allAsync(
        `SELECT COALESCE(NULLIF(m.ministry,''), 'Unassigned') as key, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}
         GROUP BY key
         ORDER BY present DESC`,
        params
      );
    } else if (groupBy === 'branch') {
      rows = await db.allAsync(
        `SELECT b.branchname as key, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         LEFT JOIN branches b ON b.id = m.branch_id
         WHERE ${dateFilter}
         GROUP BY m.branch_id
         ORDER BY present DESC`,
        params
      );
    } else if (groupBy === 'date') {
      rows = await db.allAsync(
        `SELECT ma.date as key, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}
         GROUP BY ma.date
         ORDER BY ma.date DESC`,
        params
      );
    } else if (groupBy === 'month') {
      rows = await db.allAsync(
        `SELECT strftime('%Y-%m', ma.date) as key, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}
         GROUP BY key
         ORDER BY key`,
        params
      );
    } else if (groupBy === 'quarter') {
      rows = await db.allAsync(
        `SELECT (strftime('%Y', ma.date) || '-Q' || ((CAST(strftime('%m', ma.date) AS INTEGER)-1)/3 + 1)) as key,
                COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}
         GROUP BY key
         ORDER BY key`,
        params
      );
    } else if (groupBy === 'year') {
      rows = await db.allAsync(
        `SELECT strftime('%Y', ma.date) as key, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}
         GROUP BY key
         ORDER BY key`,
        params
      );
    } else if (groupBy === 'age_group') {
      const members = await db.allAsync(
        `SELECT m.dob
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         WHERE ${dateFilter}`,
        params
      );
      const buckets = {};
      for (const m of members) {
        const g = ageGroup(m.dob);
        buckets[g] = (buckets[g] || 0) + 1;
      }
      rows = Object.entries(buckets).map(([key, present]) => ({ key, present }));
    } else {
      // service (default)
      rows = await db.allAsync(
        `SELECT st.name as key, st.category, COUNT(*) as present
         FROM member_attendances ma
         JOIN members m ON m.id = ma.member_id
         LEFT JOIN service_types st ON st.id = ma.service_types_id
         WHERE ${dateFilter}
         GROUP BY ma.service_types_id
         ORDER BY present DESC`,
        params
      );
    }

    res.json({ groupBy, year, rows, headcount });
  } catch (error) {
    console.error('Detailed stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
