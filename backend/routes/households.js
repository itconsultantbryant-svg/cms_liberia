const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission, hasPermission } = require('../utils/rbac');
const { RELATIONSHIPS, normalizeRelationship } = require('../utils/households');
const { parsePagination, paginationMeta } = require('../utils/pagination');

router.use(authMiddleware, requireTenant, attachRoleInfo);

async function getHouseholdOr404(id, churchId) {
  return db.getAsync('SELECT * FROM households WHERE id = ? AND church_id = ?', [id, churchId]);
}

async function loadMembers(householdId, churchId) {
  return db.allAsync(
    `SELECT hm.*, m.firstname, m.middlename, m.lastname, m.email, m.phone,
            m.membership_id, m.membership_status, m.sex, m.dob, m.photo
     FROM household_members hm
     JOIN members m ON m.id = hm.member_id
     WHERE hm.household_id = ? AND hm.church_id = ?
     ORDER BY
       CASE hm.relationship
         WHEN 'head' THEN 1
         WHEN 'spouse' THEN 2
         WHEN 'child' THEN 3
         WHEN 'dependent' THEN 4
         ELSE 5
       END,
       m.firstname`,
    [householdId, churchId]
  );
}

async function givingForMembers(memberIds, churchId) {
  if (!memberIds.length) return { total: 0, entries: [] };
  const placeholders = memberIds.map(() => '?').join(',');
  const entries = await db.allAsync(
    `SELECT mc.id, mc.member_id, mc.amount, mc.date_collected,
            m.firstname, m.lastname, m.membership_id,
            ct.name as collection_type
     FROM member_collections mc
     JOIN members m ON m.id = mc.member_id
     LEFT JOIN collections_types ct ON ct.id = mc.collections_types_id
     WHERE mc.member_id IN (${placeholders}) AND m.church_id = ?
     ORDER BY mc.date_collected DESC, mc.id DESC
     LIMIT 100`,
    [...memberIds, churchId]
  );

  let total = 0;
  for (const e of entries) {
    const amt = Number(e.amount || 0);
    if (!Number.isNaN(amt)) total += amt;
  }
  return { total, entries };
}

router.get('/meta', (req, res) => {
  res.json({ relationships: RELATIONSHIPS });
});

/** List households */
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    const { page: pageNum, limit: pageSize, offset } = parsePagination(req.query);
    let where = 'WHERE h.church_id = ?';
    const params = [req.churchId];

    if (!req.user?.isadmin) {
      where += ' AND (h.branch_id = ? OR h.branch_id IS NULL)';
      params.push(req.user.branchId);
    }

    if (q) {
      where += ` AND (h.name LIKE ? OR h.address LIKE ? OR h.city LIKE ? OR h.phone LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM households h ${where}`,
      params
    );

    const households = await db.allAsync(
      `SELECT h.*,
        (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = h.id) as member_count,
        m.firstname as head_firstname, m.lastname as head_lastname
       FROM households h
       LEFT JOIN members m ON m.id = h.head_member_id
       ${where}
       ORDER BY h.name
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const meta = paginationMeta({ page: pageNum, limit: pageSize, total: countRow?.total || 0 });
    res.json({
      households,
      pagination: {
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        totalPages: meta.pages
      }
    });
  } catch (error) {
    console.error('List households error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Create household */
router.post('/', requirePermission('members.create', 'members.update'), async (req, res) => {
  try {
    const { name, address, city, state, country, phone, notes, headMemberId, members } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await db.runAsync(
      `INSERT INTO households
        (church_id, branch_id, name, address, city, state, country, phone, notes, head_member_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        req.user.branchId,
        name,
        address || null,
        city || null,
        state || null,
        country || null,
        phone || null,
        notes || null,
        headMemberId || null
      ]
    );
    const householdId = result.lastID;

    const toAdd = Array.isArray(members) ? [...members] : [];
    if (headMemberId && !toAdd.some(m => Number(m.memberId || m.member_id) === Number(headMemberId))) {
      toAdd.unshift({ memberId: headMemberId, relationship: 'head' });
    }

    for (const item of toAdd) {
      const memberId = item.memberId || item.member_id;
      if (!memberId) continue;
      const member = await db.getAsync(
        'SELECT id FROM members WHERE id = ? AND church_id = ?',
        [memberId, req.churchId]
      );
      if (!member) continue;
      const relationship = normalizeRelationship(
        item.relationship || (Number(memberId) === Number(headMemberId) ? 'head' : 'other')
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO household_members
          (church_id, household_id, member_id, relationship, is_primary_contact, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          householdId,
          memberId,
          relationship,
          relationship === 'head' ? 1 : 0,
          item.notes || null
        ]
      );
      if (relationship === 'head') {
        await db.runAsync('UPDATE households SET head_member_id = ? WHERE id = ?', [
          memberId,
          householdId
        ]);
      }
    }

    const household = await getHouseholdOr404(householdId, req.churchId);
    const householdMembers = await loadMembers(householdId, req.churchId);
    res.status(201).json({ message: 'Household created', household, members: householdMembers });
  } catch (error) {
    console.error('Create household error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Lookup household(s) for a member — before /:id */
router.get('/by-member/:memberId', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT h.*, hm.relationship
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.member_id = ? AND hm.church_id = ?`,
      [req.params.memberId, req.churchId]
    );
    res.json({ households: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Get household profile (+ optional giving) */
router.get('/:id', async (req, res) => {
  try {
    const household = await getHouseholdOr404(req.params.id, req.churchId);
    if (!household) return res.status(404).json({ error: 'Household not found' });

    const members = await loadMembers(household.id, req.churchId);
    let giving = null;
    const canSeeGiving =
      req.user?.isadmin ||
      (await hasPermission(req.user, 'finance.view', req.churchId)) ||
      (await hasPermission(req.user, 'collections.manage', req.churchId));
    if (canSeeGiving) {
      giving = await givingForMembers(
        members.map(m => m.member_id),
        req.churchId
      );
    }

    res.json({ household, members, giving, relationships: RELATIONSHIPS });
  } catch (error) {
    console.error('Get household error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Update household */
router.put('/:id', requirePermission('members.update'), async (req, res) => {
  try {
    const household = await getHouseholdOr404(req.params.id, req.churchId);
    if (!household) return res.status(404).json({ error: 'Household not found' });

    const fields = ['name', 'address', 'city', 'state', 'country', 'phone', 'notes', 'head_member_id'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      const key = f === 'head_member_id' ? (req.body.headMemberId != null ? 'headMemberId' : 'head_member_id') : f;
      if (req.body[key] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id, req.churchId);
    await db.runAsync(
      `UPDATE households SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND church_id = ?`,
      values
    );

    const updated = await getHouseholdOr404(req.params.id, req.churchId);
    res.json({ message: 'Household updated', household: updated });
  } catch (error) {
    console.error('Update household error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Delete household */
router.delete('/:id', requirePermission('members.delete', 'members.update'), async (req, res) => {
  try {
    const household = await getHouseholdOr404(req.params.id, req.churchId);
    if (!household) return res.status(404).json({ error: 'Household not found' });
    await db.runAsync('DELETE FROM households WHERE id = ? AND church_id = ?', [
      req.params.id,
      req.churchId
    ]);
    res.json({ message: 'Household deleted' });
  } catch (error) {
    console.error('Delete household error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Add member to household */
router.post('/:id/members', requirePermission('members.update'), async (req, res) => {
  try {
    const household = await getHouseholdOr404(req.params.id, req.churchId);
    if (!household) return res.status(404).json({ error: 'Household not found' });

    const memberId = req.body.memberId || req.body.member_id;
    const relationship = normalizeRelationship(req.body.relationship);
    if (!memberId) return res.status(400).json({ error: 'memberId is required' });

    const member = await db.getAsync(
      'SELECT id FROM members WHERE id = ? AND church_id = ?',
      [memberId, req.churchId]
    );
    if (!member) return res.status(404).json({ error: 'Member not found in this church' });

    try {
      await db.runAsync(
        `INSERT INTO household_members
          (church_id, household_id, member_id, relationship, is_primary_contact, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          household.id,
          memberId,
          relationship,
          relationship === 'head' || req.body.isPrimaryContact ? 1 : 0,
          req.body.notes || null
        ]
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(400).json({ error: 'Member already in this household' });
      }
      throw err;
    }

    if (relationship === 'head') {
      await db.runAsync(
        `UPDATE household_members SET relationship = 'other', is_primary_contact = 0
         WHERE household_id = ? AND member_id != ? AND relationship = 'head'`,
        [household.id, memberId]
      );
      await db.runAsync('UPDATE households SET head_member_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        memberId,
        household.id
      ]);
    }

    const members = await loadMembers(household.id, req.churchId);
    res.status(201).json({ message: 'Member added', members });
  } catch (error) {
    console.error('Add household member error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Update member relationship */
router.patch('/:id/members/:memberId', requirePermission('members.update'), async (req, res) => {
  try {
    const household = await getHouseholdOr404(req.params.id, req.churchId);
    if (!household) return res.status(404).json({ error: 'Household not found' });

    const existing = await db.getAsync(
      'SELECT * FROM household_members WHERE household_id = ? AND member_id = ? AND church_id = ?',
      [household.id, req.params.memberId, req.churchId]
    );
    if (!existing) return res.status(404).json({ error: 'Member not in household' });

    const relationship = req.body.relationship
      ? normalizeRelationship(req.body.relationship)
      : existing.relationship;

    await db.runAsync(
      `UPDATE household_members SET relationship = ?, is_primary_contact = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        relationship,
        relationship === 'head' || req.body.isPrimaryContact ? 1 : 0,
        req.body.notes != null ? req.body.notes : null,
        existing.id
      ]
    );

    if (relationship === 'head') {
      await db.runAsync(
        `UPDATE household_members SET relationship = 'other', is_primary_contact = 0
         WHERE household_id = ? AND member_id != ? AND relationship = 'head'`,
        [household.id, req.params.memberId]
      );
      await db.runAsync('UPDATE households SET head_member_id = ? WHERE id = ?', [
        req.params.memberId,
        household.id
      ]);
    } else if (Number(household.head_member_id) === Number(req.params.memberId)) {
      await db.runAsync('UPDATE households SET head_member_id = NULL WHERE id = ?', [household.id]);
    }

    const members = await loadMembers(household.id, req.churchId);
    res.json({ message: 'Member updated', members });
  } catch (error) {
    console.error('Update household member error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Remove member from household */
router.delete('/:id/members/:memberId', requirePermission('members.update'), async (req, res) => {
  try {
    const household = await getHouseholdOr404(req.params.id, req.churchId);
    if (!household) return res.status(404).json({ error: 'Household not found' });

    await db.runAsync(
      'DELETE FROM household_members WHERE household_id = ? AND member_id = ? AND church_id = ?',
      [household.id, req.params.memberId, req.churchId]
    );

    if (Number(household.head_member_id) === Number(req.params.memberId)) {
      await db.runAsync('UPDATE households SET head_member_id = NULL WHERE id = ?', [household.id]);
    }

    const members = await loadMembers(household.id, req.churchId);
    res.json({ message: 'Member removed', members });
  } catch (error) {
    console.error('Remove household member error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
