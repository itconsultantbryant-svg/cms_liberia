const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');
const { formatMembershipId, normalizeStatus } = require('../utils/members');
const { FOLLOW_UP_STATUSES, normalizeFollowUpStatus } = require('../utils/visitors');
const { parsePagination, paginationMeta } = require('../utils/pagination');

router.use(authMiddleware, requireTenant, attachRoleInfo);

async function getVisitor(id, churchId) {
  return db.getAsync('SELECT * FROM visitors WHERE id = ? AND church_id = ?', [id, churchId]);
}

async function logFollowup(churchId, visitorId, fromStatus, toStatus, notes, createdBy) {
  await db.runAsync(
    `INSERT INTO visitor_followups (church_id, visitor_id, from_status, to_status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [churchId, visitorId, fromStatus || null, toStatus, notes || null, createdBy || null]
  );
}

router.get('/meta', (req, res) => {
  res.json({
    followUpStatuses: FOLLOW_UP_STATUSES,
    pipeline: FOLLOW_UP_STATUSES
  });
});

/** List / search / filter */
router.get('/', async (req, res) => {
  try {
    const { q, status, assignedTo } = req.query;
    let where = 'WHERE v.church_id = ?';
    const params = [req.churchId];

    if (!req.user?.isadmin) {
      where += ' AND (v.branch_id = ? OR v.branch_id IS NULL)';
      params.push(req.user.branchId);
    }
    if (q) {
      where += ` AND (
        v.firstname LIKE ? OR v.lastname LIKE ? OR v.phone LIKE ? OR v.email LIKE ?
        OR v.invited_by LIKE ? OR v.service_attended LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }
    if (status) {
      where += ' AND v.follow_up_status = ?';
      params.push(normalizeFollowUpStatus(status));
    }
    if (assignedTo) {
      where += ' AND v.assigned_to = ?';
      params.push(assignedTo);
    }

    const { page: pageNum, limit: pageSize, offset } = parsePagination(req.query);

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM visitors v ${where}`,
      params
    );

    const visitors = await db.allAsync(
      `SELECT v.*,
        a.branchname as assigned_name,
        a.email as assigned_email
       FROM visitors v
       LEFT JOIN branches a ON a.id = v.assigned_to
       ${where}
       ORDER BY
         CASE v.follow_up_status
           WHEN 'New' THEN 1
           WHEN 'Contacted' THEN 2
           WHEN 'Follow-up' THEN 3
           WHEN 'Interested' THEN 4
           WHEN 'Converted' THEN 5
           ELSE 6
         END,
         v.first_visit_date DESC,
         v.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Pipeline counts
    const counts = await db.allAsync(
      `SELECT follow_up_status as status, COUNT(*) as count
       FROM visitors WHERE church_id = ? GROUP BY follow_up_status`,
      [req.churchId]
    );

    const meta = paginationMeta({ page: pageNum, limit: pageSize, total: countRow?.total || 0 });
    res.json({
      visitors,
      pagination: {
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        totalPages: meta.pages
      },
      pipeline: FOLLOW_UP_STATUSES.map(s => ({
        status: s,
        count: counts.find(c => c.status === s)?.count || 0
      }))
    });
  } catch (error) {
    console.error('List visitors error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Create visitor */
router.post('/', requirePermission('members.create', 'members.update'), async (req, res) => {
  try {
    const {
      firstname, middlename, lastname, phone, email, sex,
      address, city, state, country, firstVisitDate, first_visit_date,
      invitedBy, invited_by, invitedByMemberId, invited_by_member_id,
      serviceAttended, service_attended, prayerRequest, prayer_request,
      followUpStatus, follow_up_status, assignedTo, assigned_to, notes
    } = req.body;

    if (!firstname || !lastname) {
      return res.status(400).json({ error: 'firstname and lastname are required' });
    }

    const status = normalizeFollowUpStatus(followUpStatus || follow_up_status || 'New');
    const result = await db.runAsync(
      `INSERT INTO visitors (
        church_id, branch_id, firstname, middlename, lastname, phone, email, sex,
        address, city, state, country, first_visit_date, invited_by, invited_by_member_id,
        service_attended, prayer_request, follow_up_status, assigned_to, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        req.user.branchId,
        firstname,
        middlename || null,
        lastname,
        phone || null,
        email || null,
        sex || null,
        address || null,
        city || null,
        state || null,
        country || null,
        firstVisitDate || first_visit_date || new Date().toISOString().slice(0, 10),
        invitedBy || invited_by || null,
        invitedByMemberId || invited_by_member_id || null,
        serviceAttended || service_attended || null,
        prayerRequest || prayer_request || null,
        status,
        assignedTo || assigned_to || null,
        notes || null
      ]
    );

    await logFollowup(req.churchId, result.lastID, null, status, 'Visitor registered', req.user.id);
    const visitor = await getVisitor(result.lastID, req.churchId);
    res.status(201).json({ message: 'Visitor registered', visitor });
  } catch (error) {
    console.error('Create visitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Get one */
router.get('/:id', async (req, res) => {
  try {
    const visitor = await getVisitor(req.params.id, req.churchId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });

    const history = await db.allAsync(
      `SELECT vf.*, b.branchname as created_by_name
       FROM visitor_followups vf
       LEFT JOIN branches b ON b.id = vf.created_by
       WHERE vf.visitor_id = ? AND vf.church_id = ?
       ORDER BY vf.created_at DESC`,
      [visitor.id, req.churchId]
    );

    let convertedMember = null;
    if (visitor.converted_member_id) {
      convertedMember = await db.getAsync(
        'SELECT id, membership_id, firstname, lastname, email FROM members WHERE id = ? AND church_id = ?',
        [visitor.converted_member_id, req.churchId]
      );
    }

    res.json({ visitor, history, convertedMember, followUpStatuses: FOLLOW_UP_STATUSES });
  } catch (error) {
    console.error('Get visitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Update visitor fields */
router.put('/:id', requirePermission('members.update', 'members.create'), async (req, res) => {
  try {
    const visitor = await getVisitor(req.params.id, req.churchId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });

    const map = {
      firstname: 'firstname',
      middlename: 'middlename',
      lastname: 'lastname',
      phone: 'phone',
      email: 'email',
      sex: 'sex',
      address: 'address',
      city: 'city',
      state: 'state',
      country: 'country',
      firstVisitDate: 'first_visit_date',
      first_visit_date: 'first_visit_date',
      invitedBy: 'invited_by',
      invited_by: 'invited_by',
      invitedByMemberId: 'invited_by_member_id',
      invited_by_member_id: 'invited_by_member_id',
      serviceAttended: 'service_attended',
      service_attended: 'service_attended',
      prayerRequest: 'prayer_request',
      prayer_request: 'prayer_request',
      assignedTo: 'assigned_to',
      assigned_to: 'assigned_to',
      notes: 'notes'
    };

    const updates = [];
    const values = [];
    for (const [bodyKey, col] of Object.entries(map)) {
      if (req.body[bodyKey] !== undefined) {
        if (updates.some(u => u.startsWith(`${col} =`))) continue;
        updates.push(`${col} = ?`);
        values.push(req.body[bodyKey]);
      }
    }

    if (req.body.followUpStatus !== undefined || req.body.follow_up_status !== undefined) {
      const next = normalizeFollowUpStatus(req.body.followUpStatus || req.body.follow_up_status);
      if (next !== visitor.follow_up_status) {
        updates.push('follow_up_status = ?');
        values.push(next);
        await logFollowup(
          req.churchId,
          visitor.id,
          visitor.follow_up_status,
          next,
          req.body.followUpNotes || req.body.notes || null,
          req.user.id
        );
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(visitor.id, req.churchId);
    await db.runAsync(
      `UPDATE visitors SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      values
    );

    res.json({ message: 'Visitor updated', visitor: await getVisitor(visitor.id, req.churchId) });
  } catch (error) {
    console.error('Update visitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Advance / set follow-up status */
router.post('/:id/follow-up', requirePermission('members.update', 'members.create'), async (req, res) => {
  try {
    const visitor = await getVisitor(req.params.id, req.churchId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });

    const toStatus = normalizeFollowUpStatus(req.body.status || req.body.toStatus);
    const assignedTo = req.body.assignedTo !== undefined ? req.body.assignedTo : visitor.assigned_to;

    await db.runAsync(
      `UPDATE visitors SET follow_up_status = ?, assigned_to = COALESCE(?, assigned_to),
        notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      [toStatus, assignedTo, req.body.notes || null, visitor.id, req.churchId]
    );

    await logFollowup(
      req.churchId,
      visitor.id,
      visitor.follow_up_status,
      toStatus,
      req.body.notes || null,
      req.user.id
    );

    res.json({
      message: `Status set to ${toStatus}`,
      visitor: await getVisitor(visitor.id, req.churchId)
    });
  } catch (error) {
    console.error('Follow-up error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Convert visitor → member (no re-entry of core fields) */
router.post('/:id/convert', requirePermission('members.create'), async (req, res) => {
  try {
    const visitor = await getVisitor(req.params.id, req.churchId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });
    if (visitor.converted_member_id) {
      return res.status(400).json({
        error: 'Visitor already converted',
        memberId: visitor.converted_member_id
      });
    }
    if (visitor.follow_up_status === 'Closed') {
      return res.status(400).json({ error: 'Closed visitors cannot be converted' });
    }

    let email = visitor.email || req.body.email;
    if (!email) {
      email = `visitor-${visitor.id}-${Date.now()}@placeholder.local`;
    }

    const existing = await db.getAsync(
      'SELECT id FROM members WHERE email = ? AND church_id = ?',
      [email, req.churchId]
    );
    if (existing) {
      return res.status(400).json({ error: `Email ${email} already belongs to a member` });
    }

    const result = await db.runAsync(
      `INSERT INTO members (
        branch_id, church_id, title, firstname, middlename, lastname, email, phone,
        address, city, state, country, sex, photo, member_status, membership_status,
        member_since, notes, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        visitor.branch_id || req.user.branchId,
        req.churchId,
        'Mr',
        visitor.firstname,
        visitor.middlename || null,
        visitor.lastname,
        email,
        visitor.phone || null,
        visitor.address || null,
        visitor.city || null,
        visitor.state || null,
        visitor.country || null,
        visitor.sex || null,
        'profile.png',
        'new',
        normalizeStatus(req.body.membershipStatus || 'Active'),
        visitor.first_visit_date || new Date().toISOString().slice(0, 10),
        [
          visitor.prayer_request ? `Prayer: ${visitor.prayer_request}` : null,
          visitor.notes,
          visitor.invited_by ? `Invited by: ${visitor.invited_by}` : null,
          visitor.service_attended ? `First service: ${visitor.service_attended}` : null
        ]
          .filter(Boolean)
          .join('\n') || null,
        'member'
      ]
    );

    const membershipId = formatMembershipId(req.churchId, result.lastID);
    await db.runAsync('UPDATE members SET membership_id = ? WHERE id = ?', [
      membershipId,
      result.lastID
    ]);

    const convertedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE visitors SET
        follow_up_status = 'Converted',
        converted_member_id = ?,
        converted_at = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result.lastID, convertedAt, visitor.id]
    );

    await logFollowup(
      req.churchId,
      visitor.id,
      visitor.follow_up_status,
      'Converted',
      `Converted to member #${result.lastID}`,
      req.user.id
    );

    const member = await db.getAsync('SELECT * FROM members WHERE id = ?', [result.lastID]);
    res.status(201).json({
      message: 'Visitor converted to member',
      visitor: await getVisitor(visitor.id, req.churchId),
      member,
      membership_id: membershipId
    });
  } catch (error) {
    console.error('Convert visitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Delete visitor */
router.delete('/:id', requirePermission('members.delete', 'members.update'), async (req, res) => {
  try {
    const visitor = await getVisitor(req.params.id, req.churchId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });
    await db.runAsync('DELETE FROM visitors WHERE id = ? AND church_id = ?', [
      visitor.id,
      req.churchId
    ]);
    res.json({ message: 'Visitor deleted' });
  } catch (error) {
    console.error('Delete visitor error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
