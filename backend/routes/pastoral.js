const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');
const { createNotification } = require('../utils/notifications');

router.use(authMiddleware, requireTenant, attachRoleInfo);

const CASE_TYPES = [
  'prayer_request',
  'counseling',
  'home_visit',
  'hospital_visit',
  'bereavement',
  'welfare',
  'follow_up'
];

const STATUSES = ['open', 'in_progress', 'on_hold', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const VISIT_TYPES = ['home', 'hospital', 'other'];

function userType(req) {
  return req.userType || req.user.userType || 'branch';
}

async function getCase(id, churchId) {
  return db.getAsync(
    `SELECT pc.*,
      m.firstname as member_firstname, m.lastname as member_lastname, m.membership_id
     FROM pastoral_cases pc
     LEFT JOIN members m ON m.id = pc.member_id
     WHERE pc.id = ? AND pc.church_id = ?`,
    [id, churchId]
  );
}

router.get('/meta', requirePermission('pastoral.view', 'pastoral.manage'), (req, res) => {
  res.json({
    caseTypes: CASE_TYPES,
    statuses: STATUSES,
    priorities: PRIORITIES,
    visitTypes: VISIT_TYPES,
    noteTypes: ['note', 'counseling_note', 'follow_up']
  });
});

router.get('/', requirePermission('pastoral.view', 'pastoral.manage'), async (req, res) => {
  try {
    let sql = `
      SELECT pc.*,
        m.firstname as member_firstname, m.lastname as member_lastname,
        (SELECT COUNT(*) FROM pastoral_notes n WHERE n.case_id = pc.id) as note_count,
        (SELECT COUNT(*) FROM pastoral_visits v WHERE v.case_id = pc.id) as visit_count
      FROM pastoral_cases pc
      LEFT JOIN members m ON m.id = pc.member_id
      WHERE pc.church_id = ?`;
    const params = [req.churchId];

    if (!(req.user?.isadmin && req.query.allBranches === '1')) {
      sql += ' AND pc.branch_id = ?';
      params.push(req.user.branchId);
    }
    if (req.query.caseType) {
      sql += ' AND pc.case_type = ?';
      params.push(req.query.caseType);
    }
    if (req.query.status) {
      sql += ' AND pc.status = ?';
      params.push(req.query.status);
    } else if (req.query.includeClosed !== '1') {
      sql += " AND pc.status != 'closed'";
    }
    if (req.query.assignedToMe === '1') {
      sql += ' AND pc.assigned_to_user_id = ? AND pc.assigned_to_user_type = ?';
      params.push(req.user.id, userType(req));
    }
    if (req.query.q) {
      sql += ' AND (pc.title LIKE ? OR pc.subject_name LIKE ? OR pc.summary LIKE ?)';
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }

    sql += ' ORDER BY CASE pc.priority WHEN \'urgent\' THEN 1 WHEN \'high\' THEN 2 WHEN \'normal\' THEN 3 ELSE 4 END, pc.updated_at DESC';

    const cases = await db.allAsync(sql, params);
    res.json({ cases });
  } catch (error) {
    console.error('List pastoral cases:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requirePermission('pastoral.manage'), async (req, res) => {
  try {
    const {
      caseType,
      title,
      summary,
      memberId,
      subjectName,
      status,
      priority,
      assignedToUserId,
      assignedToUserType,
      followUpDate
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title required' });
    if (!CASE_TYPES.includes(caseType)) {
      return res.status(400).json({ error: 'Invalid case type' });
    }
    if (!memberId && !subjectName) {
      return res.status(400).json({ error: 'memberId or subjectName required' });
    }
    if (memberId) {
      const member = await db.getAsync('SELECT id FROM members WHERE id = ? AND church_id = ?', [
        memberId,
        req.churchId
      ]);
      if (!member) return res.status(404).json({ error: 'Member not found' });
    }

    const result = await db.runAsync(
      `INSERT INTO pastoral_cases (
        church_id, branch_id, case_type, title, summary, member_id, subject_name,
        status, priority, confidentiality, assigned_to_user_id, assigned_to_user_type,
        follow_up_date, created_by, created_by_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confidential', ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        req.user.branchId,
        caseType,
        title,
        summary || null,
        memberId || null,
        subjectName || null,
        STATUSES.includes(status) ? status : 'open',
        PRIORITIES.includes(priority) ? priority : 'normal',
        assignedToUserId || req.user.id,
        assignedToUserType || userType(req),
        followUpDate || null,
        req.user.id,
        userType(req)
      ]
    );

    const assigneeId = assignedToUserId || req.user.id;
    const assigneeType = assignedToUserType || userType(req);
    if (assigneeId && Number(assigneeId) !== Number(req.user.id)) {
      await createNotification(
        assigneeId,
        assigneeType,
        'assignment',
        'New pastoral assignment',
        `You were assigned pastoral case: "${title}"`,
        result.lastID,
        'pastoral_case',
        req.churchId
      );
    }

    res.status(201).json({
      message: 'Pastoral case created',
      id: result.lastID,
      case: await getCase(result.lastID, req.churchId)
    });
  } catch (error) {
    console.error('Create pastoral case:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requirePermission('pastoral.view', 'pastoral.manage'), async (req, res) => {
  try {
    const careCase = await getCase(req.params.id, req.churchId);
    if (!careCase) return res.status(404).json({ error: 'Case not found' });

    const notes = await db.allAsync(
      `SELECT * FROM pastoral_notes WHERE case_id = ? AND church_id = ? ORDER BY created_at DESC`,
      [careCase.id, req.churchId]
    );
    const visits = await db.allAsync(
      `SELECT * FROM pastoral_visits WHERE case_id = ? AND church_id = ? ORDER BY visit_date DESC, id DESC`,
      [careCase.id, req.churchId]
    );

    res.json({ case: careCase, notes, visits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('pastoral.manage'), async (req, res) => {
  try {
    const careCase = await getCase(req.params.id, req.churchId);
    if (!careCase) return res.status(404).json({ error: 'Not found' });

    const fields = {
      case_type: req.body.caseType,
      title: req.body.title,
      summary: req.body.summary,
      member_id: req.body.memberId,
      subject_name: req.body.subjectName,
      status: req.body.status,
      priority: req.body.priority,
      assigned_to_user_id: req.body.assignedToUserId,
      assigned_to_user_type: req.body.assignedToUserType,
      follow_up_date: req.body.followUpDate
    };

    if (fields.case_type && !CASE_TYPES.includes(fields.case_type)) {
      return res.status(400).json({ error: 'Invalid case type' });
    }
    if (fields.status && !STATUSES.includes(fields.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (fields.priority && !PRIORITIES.includes(fields.priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });

    if (req.body.status === 'closed' && careCase.status !== 'closed') {
      updates.push('closed_at = CURRENT_TIMESTAMP');
    }
    if (req.body.status && req.body.status !== 'closed') {
      updates.push('closed_at = NULL');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(careCase.id);
    await db.runAsync(`UPDATE pastoral_cases SET ${updates.join(', ')} WHERE id = ?`, values);

    res.json({ message: 'Updated', case: await getCase(careCase.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/notes', requirePermission('pastoral.manage'), async (req, res) => {
  try {
    const careCase = await getCase(req.params.id, req.churchId);
    if (!careCase) return res.status(404).json({ error: 'Not found' });
    if (!req.body.body) return res.status(400).json({ error: 'body required' });

    const noteType = ['note', 'counseling_note', 'follow_up'].includes(req.body.noteType)
      ? req.body.noteType
      : 'note';

    const result = await db.runAsync(
      `INSERT INTO pastoral_notes (church_id, case_id, note_type, body, is_sensitive, created_by, created_by_type)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [req.churchId, careCase.id, noteType, req.body.body, req.user.id, userType(req)]
    );
    await db.runAsync('UPDATE pastoral_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      careCase.id
    ]);

    res.status(201).json({
      message: 'Note added',
      note: await db.getAsync('SELECT * FROM pastoral_notes WHERE id = ?', [result.lastID])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/visits', requirePermission('pastoral.manage'), async (req, res) => {
  try {
    const careCase = await getCase(req.params.id, req.churchId);
    if (!careCase) return res.status(404).json({ error: 'Not found' });

    const visitType = VISIT_TYPES.includes(req.body.visitType) ? req.body.visitType : 'home';
    const visitDate = req.body.visitDate || new Date().toISOString().slice(0, 10);

    const result = await db.runAsync(
      `INSERT INTO pastoral_visits (
        church_id, case_id, visit_type, visit_date, visit_time, location, notes,
        visited_by_user_id, visited_by_user_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        careCase.id,
        visitType,
        visitDate,
        req.body.visitTime || null,
        req.body.location || null,
        req.body.notes || null,
        req.user.id,
        userType(req)
      ]
    );
    await db.runAsync('UPDATE pastoral_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      careCase.id
    ]);

    // Auto-link case type for visit kinds when still prayer/follow-up
    res.status(201).json({
      message: 'Visit recorded',
      visit: await db.getAsync('SELECT * FROM pastoral_visits WHERE id = ?', [result.lastID])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requirePermission('pastoral.manage'), async (req, res) => {
  try {
    const careCase = await getCase(req.params.id, req.churchId);
    if (!careCase) return res.status(404).json({ error: 'Not found' });
    if (req.query.hard === '1') {
      await db.runAsync('DELETE FROM pastoral_cases WHERE id = ?', [careCase.id]);
      return res.json({ message: 'Case deleted' });
    }
    await db.runAsync(
      `UPDATE pastoral_cases SET status = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [careCase.id]
    );
    res.json({ message: 'Case closed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
