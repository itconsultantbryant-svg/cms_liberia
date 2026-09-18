const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requireTenant } = require('../middleware/tenant');
const { requirePermission } = require('../utils/rbac');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

router.use(authMiddleware, requireTenant, attachRoleInfo);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/ministries');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const CATEGORIES = [
  'choir',
  'youth',
  'women',
  'men',
  'children',
  'evangelism',
  'media',
  'ushering',
  'prayer',
  'custom'
];

async function getGroup(id, churchId) {
  return db.getAsync(
    `SELECT g.*,
      lm.firstname as leader_firstname, lm.lastname as leader_lastname,
      am.firstname as assistant_firstname, am.lastname as assistant_lastname
     FROM groups g
     LEFT JOIN members lm ON lm.id = g.leader_member_id
     LEFT JOIN members am ON am.id = g.assistant_leader_member_id
     WHERE g.id = ? AND (g.church_id = ? OR g.branch_id IN (SELECT id FROM branches WHERE church_id = ?))`,
    [id, churchId, churchId]
  );
}

async function loadMembers(groupId) {
  return db.allAsync(
    `SELECT gm.*, m.firstname, m.lastname, m.email, m.phone, m.membership_id, m.membership_status
     FROM group_members gm
     JOIN members m ON m.id = gm.member_id
     WHERE gm.group_id = ?
     ORDER BY
       CASE gm.role WHEN 'leader' THEN 1 WHEN 'assistant' THEN 2 ELSE 3 END,
       m.firstname`,
    [groupId]
  );
}

router.get('/meta', (req, res) => {
  res.json({ categories: CATEGORIES, roles: ['leader', 'assistant', 'member'] });
});

router.get('/templates', async (req, res) => {
  try {
    const templates = await db.allAsync('SELECT * FROM ministry_templates ORDER BY id');
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** List ministries/groups */
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT g.*,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
        lm.firstname as leader_firstname, lm.lastname as leader_lastname
      FROM groups g
      LEFT JOIN members lm ON lm.id = g.leader_member_id
      WHERE (g.church_id = ? OR g.branch_id IN (SELECT id FROM branches WHERE church_id = ?))`;
    const params = [req.churchId, req.churchId];

    if (!(req.user?.isadmin && req.query.allBranches === '1')) {
      sql += ' AND g.branch_id = ?';
      params.push(req.user.branchId);
    }
    if (req.query.category) {
      sql += ' AND g.category = ?';
      params.push(req.query.category);
    }
    if (req.query.active !== '0') {
      sql += ' AND (g.is_active = 1 OR g.is_active IS NULL)';
    }
    sql += ' ORDER BY g.name';

    const groups = await db.allAsync(sql, params);
    res.json({ groups, ministries: groups });
  } catch (error) {
    console.error('List ministries error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Seed defaults */
router.post('/seed-defaults', requirePermission('groups.manage', 'settings.manage'), async (req, res) => {
  try {
    const templates = await db.allAsync('SELECT * FROM ministry_templates ORDER BY id');
    let seeded = 0;
    for (const t of templates) {
      const exists = await db.getAsync(
        'SELECT id FROM groups WHERE branch_id = ? AND name = ?',
        [req.user.branchId, t.name]
      );
      if (exists) continue;
      await db.runAsync(
        `INSERT INTO groups (branch_id, church_id, name, category, description, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [req.user.branchId, req.churchId, t.name, t.category, t.description]
      );
      seeded++;
    }
    res.json({ message: 'Defaults seeded', seeded });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Create — keep /create for legacy */
async function createMinistry(req, res) {
  try {
    const {
      name,
      category,
      description,
      leaderMemberId,
      assistantLeaderMemberId,
      meetingDay,
      meetingTime,
      meetingLocation
    } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await db.runAsync(
      `INSERT INTO groups (
        branch_id, church_id, name, category, description,
        leader_member_id, assistant_leader_member_id,
        meeting_day, meeting_time, meeting_location, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        req.user.branchId,
        req.churchId,
        name,
        category && CATEGORIES.includes(category) ? category : 'custom',
        description || null,
        leaderMemberId || null,
        assistantLeaderMemberId || null,
        meetingDay || null,
        meetingTime || null,
        meetingLocation || null
      ]
    );

    // Auto-add leader/assistant as members
    if (leaderMemberId) {
      await db.runAsync(
        `INSERT OR IGNORE INTO group_members (group_id, member_id, role, church_id) VALUES (?, ?, 'leader', ?)`,
        [result.lastID, leaderMemberId, req.churchId]
      );
    }
    if (assistantLeaderMemberId) {
      await db.runAsync(
        `INSERT OR IGNORE INTO group_members (group_id, member_id, role, church_id) VALUES (?, ?, 'assistant', ?)`,
        [result.lastID, assistantLeaderMemberId, req.churchId]
      );
    }

    res.status(201).json({
      message: 'Ministry created',
      id: result.lastID,
      group: await getGroup(result.lastID, req.churchId)
    });
  } catch (error) {
    console.error('Create ministry error:', error);
    res.status(500).json({ error: error.message });
  }
}

router.post('/', requirePermission('groups.manage'), createMinistry);
router.post('/create', requirePermission('groups.manage'), createMinistry);

router.get('/:id', async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Ministry not found' });

    const members = await loadMembers(group.id);
    const meetings = await db.allAsync(
      `SELECT * FROM group_meetings WHERE group_id = ? AND church_id = ? ORDER BY meeting_date DESC LIMIT 50`,
      [group.id, req.churchId]
    );
    const announcements = await db.allAsync(
      `SELECT * FROM group_announcements WHERE group_id = ? AND church_id = ? ORDER BY created_at DESC LIMIT 50`,
      [group.id, req.churchId]
    );
    const documents = await db.allAsync(
      `SELECT * FROM group_documents WHERE group_id = ? AND church_id = ? ORDER BY created_at DESC`,
      [group.id, req.churchId]
    );

    let events = [];
    try {
      events = await db.allAsync(
        `SELECT * FROM events WHERE group_id = ? AND church_id = ?
         ORDER BY date DESC LIMIT 20`,
        [group.id, req.churchId]
      );
      if (!events.length) {
        events = await db.allAsync(
          `SELECT * FROM events WHERE branch_id = ? AND (title LIKE ? OR title LIKE ?)
           ORDER BY id DESC LIMIT 20`,
          [group.branch_id, `%${group.name}%`, `%${group.category || ''}%`]
        );
      }
    } catch (_) { /* ignore */ }

    res.json({ group, members, meetings, announcements, documents, events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('groups.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });

    const fields = {
      name: req.body.name,
      category: req.body.category,
      description: req.body.description,
      leader_member_id: req.body.leaderMemberId,
      assistant_leader_member_id: req.body.assistantLeaderMemberId,
      meeting_day: req.body.meetingDay,
      meeting_time: req.body.meetingTime,
      meeting_location: req.body.meetingLocation,
      is_active: req.body.isActive != null ? (req.body.isActive ? 1 : 0) : undefined
    };

    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });

    values.push(group.id);
    await db.runAsync(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`, values);

    if (req.body.leaderMemberId) {
      await db.runAsync(
        `INSERT OR IGNORE INTO group_members (group_id, member_id, role, church_id) VALUES (?, ?, 'leader', ?)`,
        [group.id, req.body.leaderMemberId, req.churchId]
      );
      await db.runAsync(
        `UPDATE group_members SET role = 'leader' WHERE group_id = ? AND member_id = ?`,
        [group.id, req.body.leaderMemberId]
      );
    }

    res.json({ message: 'Updated', group: await getGroup(group.id, req.churchId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/members', requirePermission('groups.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    const memberId = req.body.memberId || req.body.member_id;
    const role = ['leader', 'assistant', 'member'].includes(req.body.role) ? req.body.role : 'member';
    if (!memberId) return res.status(400).json({ error: 'memberId required' });

    const member = await db.getAsync('SELECT id FROM members WHERE id = ? AND church_id = ?', [
      memberId,
      req.churchId
    ]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    try {
      await db.runAsync(
        `INSERT INTO group_members (group_id, member_id, role, church_id) VALUES (?, ?, ?, ?)`,
        [group.id, memberId, role, req.churchId]
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(400).json({ error: 'Member already in ministry' });
      }
      throw err;
    }

    if (role === 'leader') {
      await db.runAsync('UPDATE groups SET leader_member_id = ? WHERE id = ?', [memberId, group.id]);
    }
    if (role === 'assistant') {
      await db.runAsync('UPDATE groups SET assistant_leader_member_id = ? WHERE id = ?', [
        memberId,
        group.id
      ]);
    }

    res.status(201).json({ message: 'Member added', members: await loadMembers(group.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Legacy add path */
router.post('/:id/add', requirePermission('groups.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    const memberId = req.body.member_id || req.body.memberId;
    if (!memberId) return res.status(400).json({ error: 'member_id required' });
    const existing = await db.getAsync(
      'SELECT id FROM group_members WHERE group_id = ? AND member_id = ?',
      [group.id, memberId]
    );
    if (existing) return res.status(400).json({ error: 'Member already in group' });
    await db.runAsync(
      `INSERT INTO group_members (group_id, member_id, role, church_id) VALUES (?, ?, 'member', ?)`,
      [group.id, memberId, req.churchId]
    );
    res.json({ message: 'Member added to group successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/members/:memberId', requirePermission('groups.manage'), async (req, res) => {
  try {
    const role = req.body.role;
    if (!['leader', 'assistant', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    await db.runAsync(
      `UPDATE group_members SET role = ? WHERE group_id = ? AND member_id = ?`,
      [role, group.id, req.params.memberId]
    );
    if (role === 'leader') {
      await db.runAsync('UPDATE groups SET leader_member_id = ? WHERE id = ?', [
        req.params.memberId,
        group.id
      ]);
    }
    if (role === 'assistant') {
      await db.runAsync('UPDATE groups SET assistant_leader_member_id = ? WHERE id = ?', [
        req.params.memberId,
        group.id
      ]);
    }
    res.json({ message: 'Role updated', members: await loadMembers(group.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/members/:memberId', requirePermission('groups.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    await db.runAsync('DELETE FROM group_members WHERE group_id = ? AND member_id = ?', [
      group.id,
      req.params.memberId
    ]);
    if (Number(group.leader_member_id) === Number(req.params.memberId)) {
      await db.runAsync('UPDATE groups SET leader_member_id = NULL WHERE id = ?', [group.id]);
    }
    if (Number(group.assistant_leader_member_id) === Number(req.params.memberId)) {
      await db.runAsync('UPDATE groups SET assistant_leader_member_id = NULL WHERE id = ?', [group.id]);
    }
    res.json({ message: 'Removed', members: await loadMembers(group.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/meetings', requirePermission('groups.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    const meetingDate = req.body.meetingDate || new Date().toISOString().slice(0, 10);
    const result = await db.runAsync(
      `INSERT INTO group_meetings (church_id, group_id, meeting_date, title, notes, attendance_count, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.churchId,
        group.id,
        meetingDate,
        req.body.title || 'Meeting',
        req.body.notes || null,
        Number(req.body.attendanceCount || 0),
        req.user.id
      ]
    );
    const meeting = await db.getAsync('SELECT * FROM group_meetings WHERE id = ?', [result.lastID]);
    res.status(201).json({ message: 'Meeting recorded', meeting });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/announcements', requirePermission('groups.manage', 'communications.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    if (!req.body.title) return res.status(400).json({ error: 'title required' });
    const result = await db.runAsync(
      `INSERT INTO group_announcements (church_id, group_id, title, body, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [req.churchId, group.id, req.body.title, req.body.body || null, req.user.id]
    );
    res.status(201).json({
      message: 'Announcement posted',
      announcement: await db.getAsync('SELECT * FROM group_announcements WHERE id = ?', [result.lastID])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/:id/documents',
  requirePermission('groups.manage'),
  upload.single('document'),
  async (req, res) => {
    try {
      const group = await getGroup(req.params.id, req.churchId);
      if (!group) return res.status(404).json({ error: 'Not found' });
      if (!req.file) return res.status(400).json({ error: 'document required' });
      const result = await db.runAsync(
        `INSERT INTO group_documents (church_id, group_id, filename, original_name, doc_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          group.id,
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
          url: `/uploads/ministries/${req.file.filename}`
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete('/:id', requirePermission('groups.manage'), async (req, res) => {
  try {
    const group = await getGroup(req.params.id, req.churchId);
    if (!group) return res.status(404).json({ error: 'Not found' });
    // Soft deactivate preferred
    if (req.query.hard === '1') {
      await db.runAsync('DELETE FROM groups WHERE id = ?', [group.id]);
      return res.json({ message: 'Deleted' });
    }
    await db.runAsync('UPDATE groups SET is_active = 0 WHERE id = ?', [group.id]);
    res.json({ message: 'Deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
