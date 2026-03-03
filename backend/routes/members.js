const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireAction, attachRoleInfo } = require('../middleware/roleAuth');
const { isSubUser, requireSubUserPermission } = require('../middleware/subUserAuth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
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

const upload = multer({ storage, limits: { fileSize: 2048000 } });

// Get all members
router.get('/', authMiddleware, async (req, res) => {
  try {
    const members = await db.allAsync(
      'SELECT * FROM members WHERE branch_id = ? ORDER BY firstname, lastname',
      [req.user.branchId]
    );
    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single member
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const member = await db.getAsync(
      'SELECT * FROM members WHERE id = ? AND branch_id = ?',
      [req.params.id, req.user.branchId]
    );
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Get attendance stats
    const attendance = await db.getAsync(
      `SELECT 
        SUM(CASE WHEN attendance = 'yes' THEN 1 ELSE 0 END) as yes,
        SUM(CASE WHEN attendance = 'no' THEN 1 ELSE 0 END) as no
      FROM member_attendances WHERE member_id = ?`,
      [req.params.id]
    );
    
    res.json({ member, attendance: attendance || { yes: 0, no: 0 } });
  } catch (error) {
    console.error('Get member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create member (supports sub-user submission with approval)
router.post('/', authMiddleware, isSubUser, requireSubUserPermission('add_members'), attachRoleInfo, upload.single('photo'), async (req, res) => {
  try {
    const {
      title, firstname, lastname, email, dob, phone, occupation, position,
      address, address2, postal, city, state, country, sex, marital_status,
      member_since, wedding_anniversary, member_status, relatives
    } = req.body;
    
    // Check if email exists
    const existing = await db.getAsync('SELECT id FROM members WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: `Email ${email} already exists` });
    }
    
    const photo = req.file ? req.file.filename : 'profile.png';
    
    // If submitted by sub-user, create pending approval
    if (req.userType === 'sub_user') {
      // Insert member but mark as pending
      const result = await db.runAsync(
        `INSERT INTO members (branch_id, title, firstname, lastname, email, dob, phone, occupation, 
          position, address, address2, postal, city, state, country, sex, marital_status, 
          member_since, wedding_anniversary, photo, relative, member_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.branchId, title, firstname, lastname, email, dob, phone, occupation,
          position || 'member', address, address2, postal, city, state, country,
          sex, marital_status, member_since, wedding_anniversary, photo,
          relatives ? JSON.stringify(relatives) : null, member_status || 'old'
        ]
      );

      // Create pending approval
      await db.runAsync(
        `INSERT INTO pending_approvals (branch_id, submitted_by, submitted_by_type, approval_type, reference_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.branchId, req.user.id, 'sub_user', 'member', result.lastID, 'pending']
      );
      
      return res.json({ 
        message: 'Member submitted successfully. Waiting for Resident Pastor approval.',
        id: result.lastID,
        requiresApproval: true
      });
    }
    
    // Regular user (Resident Pastor or admin) - direct creation
    const result = await db.runAsync(
      `INSERT INTO members (branch_id, title, firstname, lastname, email, dob, phone, occupation, 
        position, address, address2, postal, city, state, country, sex, marital_status, 
        member_since, wedding_anniversary, photo, relative, member_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.branchId, title, firstname, lastname, email, dob, phone, occupation,
        position || 'member', address, address2, postal, city, state, country,
        sex, marital_status, member_since, wedding_anniversary, photo,
        relatives ? JSON.stringify(relatives) : null, member_status || 'old'
      ]
    );
    
    res.json({ message: 'Member registered successfully', id: result.lastID });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update member
router.put('/:id', authMiddleware, attachRoleInfo, requireAction('edit_member'), async (req, res) => {
  try {
    const member = await db.getAsync('SELECT id FROM members WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const updates = [];
    const values = [];
    
    Object.keys(req.body).forEach(key => {
      if (key !== 'id' && key !== '_token' && key !== 'action') {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.params.id, req.user.branchId);
    await db.runAsync(
      `UPDATE members SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND branch_id = ?`,
      values
    );
    
    res.json({ message: 'Member updated successfully' });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete member
router.delete('/:id', authMiddleware, attachRoleInfo, requireAction('delete_member'), async (req, res) => {
  try {
    const member = await db.getAsync('SELECT firstname FROM members WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    await db.runAsync('DELETE FROM members WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branchId]);
    res.json({ message: `${member.firstname} has been deleted` });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete multiple members
router.post('/delete', authMiddleware, attachRoleInfo, requireAction('delete_member'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM members WHERE id IN (${placeholders}) AND branch_id = ?`,
      [...ids, req.user.branchId]
    );
    
    res.json({ message: 'Selected members deleted successfully' });
  } catch (error) {
    console.error('Delete members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get member attendance
router.get('/:id/attendance', authMiddleware, async (req, res) => {
  try {
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

// Search relatives
router.get('/search/relative/:term', authMiddleware, async (req, res) => {
  try {
    const term = `%${req.params.term}%`;
    const members = await db.allAsync(
      'SELECT id, firstname, lastname, email FROM members WHERE branch_id = ? AND (firstname LIKE ? OR lastname LIKE ?)',
      [req.user.branchId, term, term]
    );
    res.json({ success: true, result: members.length > 0 ? members : [{ message: 'no result found' }] });
  } catch (error) {
    console.error('Search relatives error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

