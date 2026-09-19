/**
 * Phase 33 — tenant-scoped file storage.
 * Layout: uploads/churches/{churchId}/{category}/...
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../database');
const { getJwtSecret } = require('./authSecurity');
const { ApiError } = require('../middleware/errorHandler');

function getUploadRoot() {
  return process.env.UPLOADS_PATH
    ? path.resolve(process.env.UPLOADS_PATH)
    : path.join(__dirname, '../uploads');
}

function getChurchesRoot() {
  return path.join(getUploadRoot(), 'churches');
}

const CATEGORIES = [
  'branding',
  'members',
  'finance',
  'documents',
  'events',
  'ministries',
  'communications',
  'pastoral',
  'other'
];

const CATEGORY_RULES = {
  branding: {
    maxBytes: 2 * 1024 * 1024,
    mime: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'],
    ext: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico'],
    visibility: 'public_branding'
  },
  members: {
    maxBytes: 5 * 1024 * 1024,
    mime: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'],
    ext: ['.png', '.jpg', '.jpeg', '.webp', '.pdf'],
    visibility: 'private'
  },
  finance: {
    maxBytes: 8 * 1024 * 1024,
    mime: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
    ext: ['.png', '.jpg', '.jpeg', '.pdf'],
    visibility: 'private'
  },
  documents: {
    maxBytes: 15 * 1024 * 1024,
    mime: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ],
    ext: ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
    visibility: 'private'
  },
  events: {
    maxBytes: 10 * 1024 * 1024,
    mime: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
    ext: ['.png', '.jpg', '.jpeg', '.pdf'],
    visibility: 'church'
  },
  ministries: {
    maxBytes: 8 * 1024 * 1024,
    mime: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
    ext: ['.png', '.jpg', '.jpeg', '.pdf'],
    visibility: 'church'
  },
  communications: {
    maxBytes: 10 * 1024 * 1024,
    mime: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'text/plain'],
    ext: ['.png', '.jpg', '.jpeg', '.pdf', '.txt'],
    visibility: 'private'
  },
  pastoral: {
    maxBytes: 10 * 1024 * 1024,
    mime: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'],
    ext: ['.pdf', '.png', '.jpg', '.jpeg'],
    visibility: 'private'
  },
  other: {
    maxBytes: 5 * 1024 * 1024,
    mime: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'],
    ext: ['.pdf', '.png', '.jpg', '.jpeg'],
    visibility: 'private'
  }
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureChurchRoot(churchId) {
  const id = Number(churchId);
  if (!id) return null;
  const root = path.join(getChurchesRoot(), String(id));
  ensureDir(root);
  for (const cat of CATEGORIES) {
    ensureDir(path.join(root, cat));
  }
  return root;
}

function categoryDir(churchId, category) {
  if (!CATEGORIES.includes(category)) {
    throw new ApiError(400, `Invalid storage category: ${category}`, 'FILE_CATEGORY');
  }
  const root = ensureChurchRoot(churchId);
  return path.join(root, category);
}

function validateFileMeta(category, { originalname, mimetype, size }) {
  const rules = CATEGORY_RULES[category] || CATEGORY_RULES.other;
  const ext = path.extname(originalname || '').toLowerCase();
  if (!rules.ext.includes(ext)) {
    throw new ApiError(
      400,
      `File extension ${ext || '(none)'} not allowed for ${category}`,
      'FILE_EXTENSION'
    );
  }
  if (mimetype && !rules.mime.includes(mimetype) && !rules.mime.includes(mimetype.toLowerCase())) {
    // Some browsers send empty/octet-stream — allow if extension is valid
    if (mimetype && mimetype !== 'application/octet-stream') {
      throw new ApiError(400, `MIME type ${mimetype} not allowed for ${category}`, 'FILE_MIME');
    }
  }
  if (size != null && size > rules.maxBytes) {
    throw new ApiError(
      400,
      `File exceeds max size of ${Math.round(rules.maxBytes / 1024 / 1024)}MB`,
      'FILE_SIZE'
    );
  }
  return { ext, rules };
}

function safeStoredName(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  const base = crypto.randomBytes(16).toString('hex');
  return `${Date.now()}-${base}${ext}`;
}

/**
 * Multer middleware factory — stores under churches/{churchId}/{category}/
 */
function createUpload({ category, field = 'file', maxCount = 1 }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const churchId = req.churchId || req.user?.churchId;
        if (!churchId) return cb(new ApiError(403, 'No church context for upload', 'TENANT_REQUIRED'));
        const dir = categoryDir(churchId, category);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      try {
        validateFileMeta(category, file);
        cb(null, safeStoredName(file.originalname));
      } catch (err) {
        cb(err);
      }
    }
  });

  const rules = CATEGORY_RULES[category] || CATEGORY_RULES.other;
  const upload = multer({
    storage,
    limits: { fileSize: rules.maxBytes },
    fileFilter: (req, file, cb) => {
      try {
        validateFileMeta(category, { ...file, size: 0 });
        cb(null, true);
      } catch (err) {
        cb(err);
      }
    }
  });

  return maxCount > 1 ? upload.array(field, maxCount) : upload.single(field);
}

async function registerStoredFile(req, file, category, { visibility } = {}) {
  if (!file) throw new ApiError(400, 'No file uploaded', 'FILE_MISSING');
  const churchId = req.churchId || req.user?.churchId;
  const rules = CATEGORY_RULES[category] || CATEGORY_RULES.other;
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  const relativePath = path
    .join('churches', String(churchId), category, file.filename)
    .replace(/\\/g, '/');

  const result = await db.runAsync(
    `INSERT INTO stored_files (
      church_id, category, original_name, stored_name, relative_path,
      mime_type, extension, size_bytes, visibility, uploaded_by, uploaded_by_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      churchId,
      category,
      file.originalname || file.filename,
      file.filename,
      relativePath,
      file.mimetype || null,
      ext,
      file.size || null,
      visibility || rules.visibility,
      req.user?.id || null,
      req.userType || req.user?.userType || 'branch'
    ]
  );

  const fileId = result.lastID;
  // Persist branding bytes in DB so assets survive ephemeral serverless disks.
  const vis = visibility || rules.visibility;
  if (vis === 'public_branding' && file.path && fs.existsSync(file.path)) {
    try {
      const b64 = fs.readFileSync(file.path).toString('base64');
      await db.runAsync(`UPDATE stored_files SET content_base64 = ? WHERE id = ? AND church_id = ?`, [
        b64,
        fileId,
        churchId
      ]);
    } catch (err) {
      console.warn('[fileStorage] content_base64 persist skipped:', err.message);
    }
  }

  return getStoredFile(fileId, churchId);
}

async function getStoredFile(id, churchId) {
  return db.getAsync(
    `SELECT * FROM stored_files WHERE id = ? AND church_id = ?`,
    [id, churchId]
  );
}

function absolutePath(relativePath) {
  const root = getUploadRoot();
  const abs = path.join(root, relativePath);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new ApiError(400, 'Invalid file path', 'FILE_PATH');
  }
  return resolved;
}

function accessUrl(fileRow) {
  if (!fileRow) return null;
  return `/api/files/${fileRow.id}`;
}

/** Stable public URL for branding assets (no expiry; safe for <img>/favicon/CSS). */
function publicBrandingUrl(fileRow) {
  if (!fileRow?.id || !fileRow?.church_id) return null;
  return `/api/files/public/branding/${fileRow.church_id}/${fileRow.id}`;
}

/**
 * Short-lived signed access token (for <img src> without Authorization header).
 */
function signFileAccess(fileId, churchId, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${fileId}.${churchId}.${exp}`;
  const sig = crypto.createHmac('sha256', getJwtSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyFileAccessToken(token, { allowExpired = false } = {}) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 4) return null;
    const [fileId, churchId, exp, sig] = parts;
    const payload = `${fileId}.${churchId}.${exp}`;
    const expected = crypto.createHmac('sha256', getJwtSecret()).update(payload).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) {
      return null;
    }
    if (!allowExpired && Number(exp) < Math.floor(Date.now() / 1000)) return null;
    return { fileId: Number(fileId), churchId: Number(churchId) };
  } catch (_) {
    return null;
  }
}

function signedUrl(fileRow, ttlSeconds = 3600) {
  if (!fileRow) return null;
  const token = signFileAccess(fileRow.id, fileRow.church_id, ttlSeconds);
  return `/api/files/signed/${token}`;
}

/**
 * Normalize a church branding asset URL to a durable public path.
 * Rewrites expired signed tokens and leaves http(s)/data/legacy paths alone.
 */
function resolveBrandingAssetUrl(storedValue) {
  if (!storedValue) return null;
  const value = String(storedValue);
  if (value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  const publicMatch = value.match(/^\/api\/files\/public\/branding\/(\d+)\/(\d+)/);
  if (publicMatch) return `/api/files/public/branding/${publicMatch[1]}/${publicMatch[2]}`;

  const signedMatch = value.match(/^\/api\/files\/signed\/([^/?#]+)/);
  if (signedMatch) {
    const parsed = verifyFileAccessToken(signedMatch[1], { allowExpired: true });
    if (parsed) {
      return `/api/files/public/branding/${parsed.churchId}/${parsed.fileId}`;
    }
  }

  if (value.startsWith('/api/files/') || value.startsWith('/uploads/')) return value;
  return value;
}

function sendStoredFile(res, file) {
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${(file.original_name || file.stored_name || 'file').replace(/"/g, '')}"`
  );

  const abs = absolutePath(file.relative_path);
  if (fs.existsSync(abs)) {
    fs.createReadStream(abs).pipe(res);
    return;
  }
  if (file.content_base64) {
    res.send(Buffer.from(file.content_base64, 'base64'));
    return;
  }
  const err = new ApiError(404, 'File missing on disk', 'FILE_MISSING');
  throw err;
}

module.exports = {
  get UPLOAD_ROOT() {
    return getUploadRoot();
  },
  get CHURCHES_ROOT() {
    return getChurchesRoot();
  },
  CATEGORIES,
  CATEGORY_RULES,
  ensureChurchRoot,
  categoryDir,
  validateFileMeta,
  createUpload,
  registerStoredFile,
  getStoredFile,
  absolutePath,
  accessUrl,
  publicBrandingUrl,
  signedUrl,
  signFileAccess,
  verifyFileAccessToken,
  resolveBrandingAssetUrl,
  sendStoredFile
};
