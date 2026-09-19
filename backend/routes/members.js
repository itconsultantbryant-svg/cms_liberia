const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireAction, attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const { isSubUser, requireSubUserPermission } = require('../middleware/subUserAuth');
const {
  MEMBERSHIP_STATUSES,
  ALLOWED_UPDATE_FIELDS,
  formatMembershipId,
  assignMembershipId,
  normalizeStatus,
  membersToCsv,
  parseCsv
} = require('../utils/members');
const { notifyChurchAdmins } = require('../utils/notifications');
const { audit } = require('../utils/audit');
const { assertCanCreate } = require('../utils/subscriptions');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function branchScope(req) {
  // Church admins can request all campuses via ?allBranches=1
  if (req.user?.isadmin && (req.query.allBranches === '1' || req.query.allBranches === 'true')) {
    return { sql: 'church_id = ?', params: [req.churchId] };
  }
  return {
    sql: 'church_id = ? AND branch_id = ?',
    params: [req.churchId, req.user.branchId]
  };
}

async function getScopedMember(req, id) {
  const churchId = req.tenant?.churchId || req.churchId;
  // Church admins: any branch in church; others: active branch only
  if (req.user?.isadmin || req.user?.isSuperadmin) {
    return db.getAsync(
      'SELECT * FROM members WHERE id = ? AND church_id = ?',
      [id, churchId]
    );
  }
  return db.getAsync(
    'SELECT * FROM members WHERE id = ? AND church_id = ? AND branch_id = ?',
    [id, churchId, req.user.branchId]
  );
}

/** Meta: statuses + field hints */
router.get('/meta', authMiddleware, (req, res) => {
  res.json({
    membershipStatuses: MEMBERSHIP_STATUSES,
    baptismStatuses: ['baptized', 'not_baptized', 'unknown']
  });
});

/** List with search, filters, pagination */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      q,
      status,
      sex,
      ministry,
      sort = 'firstname'
    } = req.query;
    const { page: pageNum, limit: pageSize, offset } = parsePagination(req.query);

    const scope = branchScope(req);
    let where = `WHERE ${scope.sql}`;
    const params = [...scope.params];

    if (q) {
      where += ` AND (
        firstname LIKE ? OR lastname LIKE ? OR middlename LIKE ? OR email LIKE ?
        OR phone LIKE ? OR membership_id LIKE ? OR occupation LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like, like);
    }
    if (status) {
      where += ' AND membership_status = ?';
      params.push(normalizeStatus(status));
    }
    if (sex) {
      where += ' AND sex = ?';
      params.push(sex);
    }
    if (ministry) {
      where += ' AND ministry LIKE ?';
      params.push(`%${ministry}%`);
    }

    const allowedSort = {
      firstname: 'firstname, lastname',
      lastname: 'lastname, firstname',
      newest: 'id DESC',
      status: 'membership_status, firstname'
    };
    const orderBy = allowedSort[sort] || allowedSort.firstname;

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM members ${where}`,
      params
    );
    // Lean list columns — avoid shipping full profile blobs on every page
    const members = await db.allAsync(
      `SELECT id, membership_id, firstname, middlename, lastname, email, phone,
              sex, membership_status, ministry, position, branch_id, church_id, photo, dob
       FROM members ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const meta = paginationMeta({ page: pageNum, limit: pageSize, total: countRow?.total || 0 });
    res.json({
      members,
      pagination: {
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        totalPages: meta.pages
      },
      // Backward-compatible flat array consumers: also expose as data
      data: members
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Export CSV */
router.get('/export', authMiddleware, attachRoleInfo, requirePermission('members.view', 'members.export'), async (req, res) => {
  try {
    const scope = branchScope(req);
    let where = `WHERE ${scope.sql}`;
    const params = [...scope.params];
    if (req.query.status) {
      where += ' AND membership_status = ?';
      params.push(normalizeStatus(req.query.status));
    }
    if (req.query.q) {
      where += ' AND (firstname LIKE ? OR lastname LIKE ? OR email LIKE ? OR membership_id LIKE ?)';
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like);
    }
    const rows = await db.allAsync(`SELECT * FROM members ${where} ORDER BY firstname, lastname`, params);
    const csv = membersToCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Import CSV or JSON body */
router.post(
  '/import',
  authMiddleware,
  attachRoleInfo,
  requirePermission('members.create'),
  upload.single('file'),
  async (req, res) => {
    try {
      let rows = [];
      if (req.file) {
        const text = fs.readFileSync(req.file.path, 'utf8');
        rows = parseCsv(text);
        fs.unlink(req.file.path, () => {});
      } else if (Array.isArray(req.body?.members)) {
        rows = req.body.members;
      } else if (typeof req.body?.csv === 'string') {
        rows = parseCsv(req.body.csv);
      } else {
        return res.status(400).json({ error: 'Provide CSV file, csv string, or members array' });
      }

      let created = 0;
      let skipped = 0;
      const errors = [];

      for (const raw of rows) {
        const firstname = raw.firstname || raw.first_name;
        const lastname = raw.lastname || raw.last_name;
        let email = raw.email;
        if (!firstname || !lastname) {
          skipped++;
          errors.push('Row missing first/last name');
          continue;
        }
        if (!email) {
          email = `import-${Date.now()}-${created + skipped}@placeholder.local`;
        }
        const existing = await db.getAsync(
          'SELECT id FROM members WHERE email = ? AND church_id = ?',
          [email, req.churchId]
        );
        if (existing) {
          skipped++;
          continue;
        }

        const result = await db.runAsync(
          `INSERT INTO members (
            branch_id, church_id, title, firstname, middlename, lastname, email, dob, phone, phone_alt,
            occupation, position, address, address2, postal, city, state, country, sex, marital_status,
            member_since, photo, member_status, membership_status, baptism_status, baptism_date,
            ministry, department, emergency_contact_name, emergency_contact_phone, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.branchId,
            req.churchId,
            raw.title || 'Mr',
            firstname,
            raw.middlename || raw.middle_name || null,
            lastname,
            email,
            raw.dob || null,
            raw.phone || null,
            raw.phone_alt || raw.alternative_phone || null,
            raw.occupation || null,
            raw.position || 'member',
            raw.address || null,
            raw.address2 || null,
            raw.postal || null,
            raw.city || null,
            raw.state || raw.county || null,
            raw.country || null,
            raw.sex || raw.gender || null,
            raw.marital_status || null,
            raw.member_since || raw.membership_date || null,
            'profile.png',
            'new',
            normalizeStatus(raw.membership_status || raw.status),
            raw.baptism_status || 'unknown',
            raw.baptism_date || null,
            raw.ministry || null,
            raw.department || null,
            raw.emergency_contact_name || null,
            raw.emergency_contact_phone || null,
            raw.notes || null
          ]
        );
        const mid = await assignMembershipId(req.churchId, result.lastID);
        await db.runAsync('UPDATE members SET membership_id = ? WHERE id = ?', [mid, result.lastID]);
        created++;
      }

      res.status(201).json({ message: 'Import complete', created, skipped, errors: errors.slice(0, 20) });
    } catch (error) {
      console.error('Import members error:', error);
      res.status(500).json({ error: error.message || 'Server error' });
    }
  }
);

/** Bulk status update / soft operations */
router.post('/bulk', authMiddleware, attachRoleInfo, requirePermission('members.update', 'members.delete'), async (req, res) => {
  try {
    const { ids, action, membershipStatus } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const placeholders = ids.map(() => '?').join(',');

    if (action === 'set_status') {
      const status = normalizeStatus(membershipStatus);
      await db.runAsync(
        `UPDATE members SET membership_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders}) AND church_id = ? AND branch_id = ?`,
        [...ids, status, req.churchId, req.user.branchId]
      );
      return res.json({ message: `Updated status to ${status}`, count: ids.length });
    }

    if (action === 'delete') {
      // Prefer workflow for single deletes; bulk hard-delete for admins with permission
      await db.runAsync(
        `DELETE FROM members WHERE id IN (${placeholders}) AND church_id = ? AND branch_id = ?`,
        [...ids, req.churchId, req.user.branchId]
      );
      return res.json({ message: 'Selected members deleted', count: ids.length });
    }

    return res.status(400).json({ error: 'action must be set_status or delete' });
  } catch (error) {
    console.error('Bulk members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Legacy bulk delete path */
router.post('/delete', authMiddleware, attachRoleInfo, requirePermission('members.delete'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM members WHERE id IN (${placeholders}) AND church_id = ? AND branch_id = ?`,
      [...ids, req.churchId, req.user.branchId]
    );
    res.json({ message: 'Selected members deleted successfully', count: ids.length });
  } catch (error) {
    console.error('Delete members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Search relatives — must be before /:id */
router.get('/search/relative/:term', authMiddleware, async (req, res) => {
  try {
    const term = `%${req.params.term}%`;
    const members = await db.allAsync(
      `SELECT id, firstname, lastname, email FROM members
       WHERE church_id = ? AND branch_id = ? AND (firstname LIKE ? OR lastname LIKE ?)`,
      [req.churchId, req.user.branchId, term, term]
    );
    res.json({ success: true, result: members.length > 0 ? members : [{ message: 'no result found' }] });
  } catch (error) {
    console.error('Search relatives error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Get single member — full dossier */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.params.id === 'new') {
      return res.status(400).json({ error: 'Use POST /api/members to create' });
    }
    let member = await getScopedMember(req, req.params.id);
    // Church admin may view any campus member
    if (!member && req.user?.isadmin) {
      member = await db.getAsync(
        'SELECT * FROM members WHERE id = ? AND church_id = ?',
        [req.params.id, req.churchId]
      );
    }
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const attendance = await db.getAsync(
      `SELECT
        SUM(CASE WHEN attendance = 'yes' THEN 1 ELSE 0 END) as yes,
        SUM(CASE WHEN attendance = 'no' THEN 1 ELSE 0 END) as no
      FROM member_attendances WHERE member_id = ?`,
      [req.params.id]
    );

    const documents = await db.allAsync(
      'SELECT id, filename, original_name, doc_type, created_at FROM member_documents WHERE member_id = ? AND church_id = ? ORDER BY created_at DESC',
      [req.params.id, req.churchId]
    );

    const households = await db.allAsync(
      `SELECT h.id, h.name, hm.relationship, hm.is_primary
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.member_id = ? AND hm.church_id = ?`,
      [req.params.id, req.churchId]
    ).catch(() => []);

    const householdPeers = [];
    for (const h of households) {
      const peers = await db
        .allAsync(
          `SELECT m.id, m.firstname, m.lastname, m.membership_id, hm.relationship
           FROM household_members hm
           JOIN members m ON m.id = hm.member_id
           WHERE hm.household_id = ? AND hm.member_id != ?`,
          [h.id, req.params.id]
        )
        .catch(() => []);
      householdPeers.push({ householdId: h.id, householdName: h.name, members: peers });
    }

    let relatives = [];
    try {
      if (member.relative) {
        relatives = typeof member.relative === 'string' ? JSON.parse(member.relative) : member.relative;
        if (!Array.isArray(relatives)) relatives = [];
      }
    } catch (_) {
      relatives = [];
    }

    const church = await db.getAsync(
      'SELECT id, name, short_name, slug, email, phone, website_url, address FROM churches WHERE id = ?',
      [req.churchId]
    ).catch(() => null);

    const branch = member.branch_id
      ? await db.getAsync('SELECT id, branchname, city, state, country FROM branches WHERE id = ?', [
          member.branch_id
        ]).catch(() => null)
      : null;

    const staffRecords = await db
      .allAsync(
        `SELECT s.id, s.position, s.employment_date, s.salary, s.currency, s.is_active,
                d.department_name
         FROM staff s
         LEFT JOIN departments d ON d.id = s.department_id
         WHERE s.church_id = ? AND (
           lower(s.email) = lower(?) OR
           (s.firstname = ? AND s.lastname = ?)
         )
         ORDER BY s.employment_date DESC NULLS LAST`,
        [req.churchId, member.email || '', member.firstname, member.lastname]
      )
      .catch(async () =>
        db
          .allAsync(
            `SELECT s.id, s.position, s.employment_date, s.salary, s.currency, s.is_active,
                    d.department_name
             FROM staff s
             LEFT JOIN departments d ON d.id = s.department_id
             WHERE s.church_id = ? AND (
               lower(s.email) = lower(?) OR
               (s.firstname = ? AND s.lastname = ?)
             )
             ORDER BY s.employment_date DESC`,
            [req.churchId, member.email || '', member.firstname, member.lastname]
          )
          .catch(() => [])
      );

    const donations = await db
      .allAsync(
        `SELECT d.id, d.amount, d.currency, d.donation_date, d.fund, d.notes, d.receipt_number
         FROM donations d
         WHERE d.church_id = ? AND d.member_id = ?
         ORDER BY d.donation_date DESC
         LIMIT 100`,
        [req.churchId, req.params.id]
      )
      .catch(() => []);

    const pledges = await db
      .allAsync(
        `SELECT p.id, p.title, p.amount, p.currency, p.status, p.start_date, p.end_date, p.fund
         FROM pledges p
         WHERE p.church_id = ? AND p.member_id = ?
         ORDER BY p.start_date DESC
         LIMIT 50`,
        [req.churchId, req.params.id]
      )
      .catch(() => []);

    const memberCollections = await db
      .allAsync(
        `SELECT mc.id, mc.amount, mc.currency, mc.collection_date, mc.collection_type, mc.notes
         FROM member_collections mc
         WHERE mc.church_id = ? AND mc.member_id = ?
         ORDER BY mc.collection_date DESC
         LIMIT 100`,
        [req.churchId, req.params.id]
      )
      .catch(() =>
        db
          .allAsync(
            `SELECT mc.id, mc.amount, mc.collection_date, mc.type as collection_type, mc.notes
             FROM member_collections mc
             WHERE mc.member_id = ?
             ORDER BY mc.collection_date DESC
             LIMIT 100`,
            [req.params.id]
          )
          .catch(() => [])
      );

    const givingSummary = {
      donationsTotal: donations.reduce((s, d) => s + (Number(d.amount) || 0), 0),
      collectionsTotal: memberCollections.reduce((s, d) => s + (Number(d.amount) || 0), 0),
      pledgesCount: pledges.length,
      donationsCount: donations.length
    };

    const linkedUser = await db
      .getAsync(
        `SELECT id, email, branchname, isadmin, is_login_enabled, status
         FROM branches WHERE church_id = ? AND lower(email) = lower(?)`,
        [req.churchId, member.email || '']
      )
      .catch(() => null);

    res.json({
      member,
      attendance: attendance || { yes: 0, no: 0 },
      documents,
      households,
      householdPeers,
      relatives,
      church: church
        ? {
            id: church.id,
            name: church.name,
            shortName: church.short_name,
            slug: church.slug,
            email: church.email,
            phone: church.phone,
            websiteUrl: church.website_url,
            address: church.address
          }
        : null,
      branch,
      staffRecords,
      financial: {
        summary: givingSummary,
        donations,
        pledges,
        collections: memberCollections
      },
      account: linkedUser
        ? {
            id: linkedUser.id,
            email: linkedUser.email,
            name: linkedUser.branchname,
            isAdmin: !!linkedUser.isadmin,
            loginEnabled: linkedUser.is_login_enabled !== 0 && linkedUser.is_login_enabled !== false,
            status: linkedUser.status || 'active'
          }
        : null
    });
  } catch (error) {
    console.error('Get member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Approve pending membership application */
router.post('/:id/approve', authMiddleware, attachRoleInfo, requirePermission('members.update'), async (req, res) => {
  try {
    const member = await db.getAsync('SELECT * FROM members WHERE id = ? AND church_id = ?', [
      req.params.id,
      req.churchId
    ]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await db.runAsync(
      `UPDATE members SET membership_status = 'Active', member_since = COALESCE(member_since, CURRENT_DATE),
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );
    await db
      .runAsync(
        `UPDATE pending_approvals SET status = 'approved', updated_at = CURRENT_TIMESTAMP
         WHERE church_id = ? AND reference_id = ? AND approval_type IN ('member', 'member_join') AND status = 'pending'`,
        [req.churchId, req.params.id]
      )
      .catch(() => {});
    await audit(req, {
      action: 'update',
      resource: 'member',
      resourceId: req.params.id,
      summary: `Membership approved: ${member.firstname} ${member.lastname}`
    });
    res.json({
      message: 'Member approved. You can now invite them to create login credentials from User Management.',
      member: { ...member, membership_status: 'Active' }
    });
  } catch (error) {
    console.error('[members/approve]', error);
    res.status(500).json({ error: error.message });
  }
});

/** Reject pending membership application */
router.post('/:id/reject', authMiddleware, attachRoleInfo, requirePermission('members.update'), async (req, res) => {
  try {
    const member = await db.getAsync('SELECT * FROM members WHERE id = ? AND church_id = ?', [
      req.params.id,
      req.churchId
    ]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await db.runAsync(
      `UPDATE members SET membership_status = 'Inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );
    const note = `\n[Rejected: ${req.body?.reason || 'Not approved'}]`;
    await db
      .runAsync(`UPDATE members SET notes = COALESCE(notes, '') || ? WHERE id = ?`, [note, req.params.id])
      .catch(async () => {
        await db.runAsync(`UPDATE members SET notes = ? WHERE id = ?`, [
          `${member.notes || ''}${note}`,
          req.params.id
        ]);
      });
    await db
      .runAsync(
        `UPDATE pending_approvals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
         WHERE church_id = ? AND reference_id = ? AND approval_type IN ('member', 'member_join') AND status = 'pending'`,
        [req.churchId, req.params.id]
      )
      .catch(() => {});
    res.json({ message: 'Membership application rejected' });
  } catch (error) {
    console.error('[members/reject]', error);
    res.status(500).json({ error: error.message });
  }
});

/** Create member */
router.post('/', authMiddleware, isSubUser, requireSubUserPermission('add_members'), attachRoleInfo, upload.single('photo'), async (req, res) => {
  try {
    const {
      title, firstname, middlename, lastname, email, dob, phone, phone_alt, occupation, position,
      address, address2, postal, city, state, country, sex, marital_status,
      member_since, wedding_anniversary, member_status, membership_status,
      baptism_status, baptism_date, ministry, department,
      emergency_contact_name, emergency_contact_phone, notes, relatives
    } = req.body;

    if (!firstname || !lastname || !email) {
      return res.status(400).json({ error: 'firstname, lastname, and email are required' });
    }

    const limitErr = await assertCanCreate(req.churchId, 'member');
    if (limitErr) return res.status(403).json({ error: limitErr });

    const existing = await db.getAsync('SELECT id FROM members WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: `Email ${email} already exists` });
    }

    const photo = req.file ? req.file.filename : 'profile.png';
    const status = normalizeStatus(membership_status || 'Active');

    const result = await db.runAsync(
      `INSERT INTO members (
        branch_id, church_id, title, firstname, middlename, lastname, email, dob, phone, phone_alt,
        occupation, position, address, address2, postal, city, state, country, sex, marital_status,
        member_since, wedding_anniversary, photo, relative, member_status, membership_status,
        baptism_status, baptism_date, ministry, department,
        emergency_contact_name, emergency_contact_phone, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.branchId, req.churchId, title || 'Mr', firstname, middlename || null, lastname, email,
        dob || null, phone || null, phone_alt || null, occupation || null, position || 'member',
        address || null, address2 || null, postal || null, city || null, state || null, country || null,
        sex || null, marital_status || null, member_since || null, wedding_anniversary || null, photo,
        relatives ? JSON.stringify(relatives) : null, member_status || 'new', status,
        baptism_status || 'unknown', baptism_date || null, ministry || null, department || null,
        emergency_contact_name || null, emergency_contact_phone || null, notes || null
      ]
    );

    const membershipId = await assignMembershipId(req.churchId, result.lastID);
    await db.runAsync('UPDATE members SET membership_id = ? WHERE id = ?', [membershipId, result.lastID]);

    await notifyChurchAdmins(
      req.churchId,
      'member',
      'New member registered',
      `${firstname} ${lastname} was added to the membership roll.`,
      result.lastID,
      'member'
    );

    await audit(req, {
      action: 'create',
      resource: 'member',
      resourceId: result.lastID,
      summary: `Member created: ${firstname} ${lastname}`,
      newValues: { email, membership_id: membershipId, membership_status: status }
    });

    if (req.userType === 'sub_user') {
      await db.runAsync(
        `INSERT INTO pending_approvals (branch_id, church_id, submitted_by, submitted_by_type, approval_type, reference_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.branchId, req.churchId, req.user.id, 'sub_user', 'member', result.lastID, 'pending']
      );
      return res.status(201).json({
        message: 'Member submitted successfully. Waiting for Resident Pastor approval.',
        id: result.lastID,
        membership_id: membershipId,
        requiresApproval: true
      });
    }

    res.status(201).json({
      message: 'Member registered successfully',
      id: result.lastID,
      membership_id: membershipId
    });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Update member */
router.put('/:id', authMiddleware, attachRoleInfo, requirePermission('members.update'), async (req, res) => {
  try {
    const member = await getScopedMember(req, req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const updates = [];
    const values = [];

    Object.keys(req.body).forEach(key => {
      if (!ALLOWED_UPDATE_FIELDS.has(key)) return;
      let val = req.body[key];
      if (key === 'membership_status') val = normalizeStatus(val);
      updates.push(`${key} = ?`);
      values.push(val);
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id, req.churchId, req.user.branchId);
    await db.runAsync(
      `UPDATE members SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND church_id = ? AND branch_id = ?`,
      values
    );

    const updated = await getScopedMember(req, req.params.id);
    await audit(req, {
      action: 'update',
      resource: 'member',
      resourceId: req.params.id,
      summary: `Member updated: ${updated?.firstname || ''} ${updated?.lastname || ''}`.trim(),
      previousValues: { id: member.id, email: member.email },
      newValues: updated
    });
    res.json({ message: 'Member updated successfully', member: updated });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Upload document */
router.post(
  '/:id/documents',
  authMiddleware,
  attachRoleInfo,
  requirePermission('members.update'),
  upload.single('document'),
  async (req, res) => {
    try {
      const member = await getScopedMember(req, req.params.id);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      if (!req.file) return res.status(400).json({ error: 'document file required' });

      const result = await db.runAsync(
        `INSERT INTO member_documents (church_id, member_id, filename, original_name, doc_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          member.id,
          req.file.filename,
          req.file.originalname,
          req.body.doc_type || 'other',
          req.user.id
        ]
      );
      res.status(201).json({
        message: 'Document uploaded',
        document: {
          id: result.lastID,
          filename: req.file.filename,
          original_name: req.file.originalname,
          doc_type: req.body.doc_type || 'other'
        }
      });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/** Delete member — may require approval workflow (Phase 8) */
router.delete('/:id', authMiddleware, attachRoleInfo, requirePermission('members.delete'), async (req, res) => {
  try {
    const member = await db.getAsync(
      'SELECT id, firstname, lastname, email FROM members WHERE id = ? AND church_id = ? AND branch_id = ?',
      [req.params.id, req.churchId, req.user.branchId]
    );
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const {
      workflowRequiresApproval,
      submitWorkflowRequest
    } = require('../utils/workflowEngine');

    const needsApproval = await workflowRequiresApproval(req.churchId, 'member_delete');
    if (needsApproval) {
      const reason = req.body?.reason || req.query?.reason || 'Member deletion requested';
      const request = await submitWorkflowRequest({
        churchId: req.churchId,
        branchId: req.user.branchId,
        actionType: 'member_delete',
        recordType: 'member',
        recordId: member.id,
        payload: { memberId: member.id, member },
        reason,
        requesterId: req.user.id,
        requesterType: req.user.userType || 'branch',
        status: 'pending'
      });
      return res.status(202).json({
        message: 'Member deletion submitted for approval',
        requiresApproval: true,
        request
      });
    }

    await db.runAsync(
      'DELETE FROM members WHERE id = ? AND church_id = ? AND branch_id = ?',
      [req.params.id, req.churchId, req.user.branchId]
    );
    await audit(req, {
      action: 'delete',
      resource: 'member',
      resourceId: member.id,
      summary: `Member deleted: ${member.firstname} ${member.lastname}`,
      previousValues: member
    });
    res.json({ message: `${member.firstname} has been deleted` });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Get member attendance */
router.get('/:id/attendance', authMiddleware, async (req, res) => {
  try {
    const member = await getScopedMember(req, req.params.id);
    if (!member && !(req.user?.isadmin)) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const attendances = await db.allAsync(
      `SELECT ma.*, st.name as service_type_name
      FROM member_attendances ma
      LEFT JOIN service_types st ON ma.service_types_id = st.id
      WHERE ma.member_id = ? ORDER BY ma.date DESC`,
      [req.params.id]
    );
    res.json(attendances);
  } catch (error) {
    console.error('Get member attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
