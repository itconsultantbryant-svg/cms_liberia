const express = require('express');
const router = express.Router();
const db = require('../database');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission, hasPermission } = require('../utils/rbac');
const {
  createUpload,
  registerStoredFile,
  accessUrl,
  ensureChurchRoot
} = require('../utils/fileStorage');

router.use(attachRoleInfo);

const upload = {
  single: (field) => {
    const mw = createUpload({ category: 'documents', field });
    return (req, res, next) => {
      ensureChurchRoot(req.churchId);
      mw(req, res, next);
    };
  }
};

const CATEGORIES = [
  'church',
  'policies',
  'financial',
  'member',
  'minutes',
  'reports',
  'certificates',
  'evidence'
];

function userType(req) {
  return req.userType || req.user.userType || 'branch';
}

async function canViewFinancial(req) {
  return hasPermission(req.user, 'finance.view', req.churchId) ||
    hasPermission(req.user, 'documents.manage', req.churchId) ||
    !!req.user.isadmin;
}

async function getDocument(id, churchId) {
  return db.getAsync(
    `SELECT d.*, m.firstname as member_firstname, m.lastname as member_lastname,
      g.name as ministry_name
     FROM church_documents d
     LEFT JOIN members m ON m.id = d.member_id
     LEFT JOIN groups g ON g.id = d.group_id
     WHERE d.id = ? AND d.church_id = ?`,
    [id, churchId]
  );
}

function mapDoc(row) {
  if (!row) return null;
  const fileUrl = row.stored_file_id
    ? `/api/files/${row.stored_file_id}`
    : row.filename
      ? `/uploads/documents/${row.filename}`
      : null;
  return {
    ...row,
    url: fileUrl
  };
}

router.get('/meta', requirePermission('documents.view', 'documents.manage'), async (req, res) => {
  try {
    const categories = await db.allAsync('SELECT * FROM document_categories ORDER BY id');
    res.json({
      categories: categories.length ? categories : CATEGORIES.map(c => ({ code: c, name: c })),
      visibilities: ['church', 'branch', 'restricted'],
      categoryCodes: CATEGORIES
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', requirePermission('documents.view', 'documents.manage'), async (req, res) => {
  try {
    let sql = `
      SELECT d.*, m.firstname as member_firstname, m.lastname as member_lastname, g.name as ministry_name
      FROM church_documents d
      LEFT JOIN members m ON m.id = d.member_id
      LEFT JOIN groups g ON g.id = d.group_id
      WHERE d.church_id = ? AND d.is_active = 1`;
    const params = [req.churchId];

    if (req.query.category) {
      sql += ' AND d.category = ?';
      params.push(req.query.category);
    }
    if (req.query.branchId) {
      sql += ' AND d.branch_id = ?';
      params.push(req.query.branchId);
    } else if (req.query.visibility === 'branch') {
      sql += ' AND (d.visibility = \'church\' OR d.branch_id = ?)';
      params.push(req.user.branchId);
    }
    if (req.query.memberId) {
      sql += ' AND d.member_id = ?';
      params.push(req.query.memberId);
    }
    if (req.query.q) {
      sql += ' AND (d.title LIKE ? OR d.description LIKE ? OR d.original_name LIKE ?)';
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }

    sql += ' ORDER BY d.updated_at DESC, d.id DESC LIMIT 200';
    let docs = await db.allAsync(sql, params);

    // Financial docs require finance.view (or documents.manage / admin)
    const financeOk = await canViewFinancial(req);
    if (!financeOk) {
      docs = docs.filter(d => d.category !== 'financial');
    }

    // Branch-visibility documents: only same branch unless admin/manage
    const canManage = await hasPermission(req.user, 'documents.manage', req.churchId);
    if (!canManage && !req.user.isadmin) {
      docs = docs.filter(
        d =>
          d.visibility === 'church' ||
          (d.visibility === 'branch' && Number(d.branch_id) === Number(req.user.branchId)) ||
          d.visibility === 'restricted'
      );
      // restricted: only uploader for now unless manage
      docs = docs.filter(
        d => d.visibility !== 'restricted' || Number(d.uploaded_by) === Number(req.user.id)
      );
    }

    res.json({ documents: docs.map(mapDoc) });
  } catch (error) {
    console.error('List documents:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/',
  requirePermission('documents.manage'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file required' });
      const title = req.body.title || req.file.originalname;
      const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'church';
      const visibility = ['church', 'branch', 'restricted'].includes(req.body.visibility)
        ? req.body.visibility
        : 'church';

      if (category === 'financial') {
        const ok = await canViewFinancial(req);
        if (!ok) return res.status(403).json({ error: 'Cannot upload financial documents' });
      }

      const stored = await registerStoredFile(req, req.file, 'documents');

      const result = await db.runAsync(
        `INSERT INTO church_documents (
          church_id, branch_id, category, title, description, visibility,
          member_id, group_id, event_id, current_version,
          filename, original_name, mime_type, file_size,
          uploaded_by, uploaded_by_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        [
          req.churchId,
          req.body.branchId || req.user.branchId,
          category,
          title,
          req.body.description || null,
          visibility,
          req.body.memberId || null,
          req.body.groupId || null,
          req.body.eventId || null,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.user.id,
          userType(req)
        ]
      );

      // Best-effort link to stored_files registry
      try {
        await db.runAsync(
          `UPDATE church_documents SET stored_file_id = ? WHERE id = ? AND church_id = ?`,
          [stored.id, result.lastID, req.churchId]
        );
      } catch (_) { /* column may not exist yet */ }

      await db.runAsync(
        `INSERT INTO document_versions (
          document_id, church_id, version, filename, original_name, mime_type, file_size,
          notes, uploaded_by, uploaded_by_type
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.lastID,
          req.churchId,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          `Initial version; fileId=${stored.id}`,
          req.user.id,
          userType(req)
        ]
      );

      const doc = await getDocument(result.lastID, req.churchId);
      if (doc) doc.stored_file_id = stored.id;

      res.status(201).json({
        message: 'Document uploaded',
        id: result.lastID,
        fileId: stored.id,
        accessUrl: accessUrl(stored),
        document: mapDoc(doc)
      });
    } catch (error) {
      console.error('Upload document:', error);
      res.status(error.status || 500).json({ error: error.message });
    }
  }
);

router.get('/:id', requirePermission('documents.view', 'documents.manage'), async (req, res) => {
  try {
    const doc = await getDocument(req.params.id, req.churchId);
    if (!doc || !doc.is_active) return res.status(404).json({ error: 'Not found' });

    if (doc.category === 'financial' && !(await canViewFinancial(req))) {
      return res.status(403).json({ error: 'Financial document access denied' });
    }

    const canManage = await hasPermission(req.user, 'documents.manage', req.churchId);
    if (
      !canManage &&
      !req.user.isadmin &&
      doc.visibility === 'branch' &&
      Number(doc.branch_id) !== Number(req.user.branchId)
    ) {
      return res.status(403).json({ error: 'Branch-restricted document' });
    }
    if (
      !canManage &&
      !req.user.isadmin &&
      doc.visibility === 'restricted' &&
      Number(doc.uploaded_by) !== Number(req.user.id)
    ) {
      return res.status(403).json({ error: 'Restricted document' });
    }

    const versions = await db.allAsync(
      `SELECT * FROM document_versions WHERE document_id = ? AND church_id = ? ORDER BY version DESC`,
      [doc.id, req.churchId]
    );

    res.json({
      document: mapDoc(doc),
      versions: versions.map(v => ({ ...v, url: `/uploads/documents/${v.filename}` }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requirePermission('documents.manage'), async (req, res) => {
  try {
    const doc = await getDocument(req.params.id, req.churchId);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const fields = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      visibility: req.body.visibility,
      member_id: req.body.memberId,
      group_id: req.body.groupId,
      event_id: req.body.eventId,
      branch_id: req.body.branchId
    };
    if (fields.category && !CATEGORIES.includes(fields.category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (fields.visibility && !['church', 'branch', 'restricted'].includes(fields.visibility)) {
      return res.status(400).json({ error: 'Invalid visibility' });
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
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(doc.id);
    await db.runAsync(`UPDATE church_documents SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Updated', document: mapDoc(await getDocument(doc.id, req.churchId)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/:id/versions',
  requirePermission('documents.manage'),
  upload.single('file'),
  async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.churchId);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      if (!req.file) return res.status(400).json({ error: 'file required' });

      const nextVersion = Number(doc.current_version || 1) + 1;
      await db.runAsync(
        `INSERT INTO document_versions (
          document_id, church_id, version, filename, original_name, mime_type, file_size,
          notes, uploaded_by, uploaded_by_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          req.churchId,
          nextVersion,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.body.notes || `Version ${nextVersion}`,
          req.user.id,
          userType(req)
        ]
      );
      await db.runAsync(
        `UPDATE church_documents SET
          current_version = ?, filename = ?, original_name = ?, mime_type = ?, file_size = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextVersion, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, doc.id]
      );

      res.status(201).json({
        message: 'New version uploaded',
        version: nextVersion,
        document: mapDoc(await getDocument(doc.id, req.churchId))
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete('/:id', requirePermission('documents.manage'), async (req, res) => {
  try {
    const doc = await getDocument(req.params.id, req.churchId);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (req.query.hard === '1') {
      await db.runAsync('DELETE FROM church_documents WHERE id = ?', [doc.id]);
      return res.json({ message: 'Deleted' });
    }
    await db.runAsync(
      `UPDATE church_documents SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [doc.id]
    );
    res.json({ message: 'Document archived' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
