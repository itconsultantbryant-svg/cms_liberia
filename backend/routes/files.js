/**
 * Phase 33 — authorized file download / signed access + public branding.
 */
const express = require('express');
const fs = require('fs');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { attachTenantScope } = require('../utils/tenantScope');
const {
  getStoredFile,
  absolutePath,
  signedUrl,
  verifyFileAccessToken,
  sendStoredFile,
  CATEGORIES,
  CATEGORY_RULES
} = require('../utils/fileStorage');
const { ok } = require('../utils/apiResponse');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/** Public meta — allowed categories / limits (no auth needed for docs) */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    ok(res, {
      categories: CATEGORIES,
      rules: Object.fromEntries(
        Object.entries(CATEGORY_RULES).map(([k, v]) => [
          k,
          { maxBytes: v.maxBytes, extensions: v.ext, visibility: v.visibility }
        ])
      )
    });
  })
);

/**
 * Public branding assets — no auth, no expiry.
 * Only serves rows with visibility = public_branding (logo/favicon/login bg).
 * Falls back to DB content_base64 when disk is gone (serverless).
 */
router.get(
  '/public/branding/:churchId/:fileId',
  asyncHandler(async (req, res) => {
    const churchId = Number(req.params.churchId);
    const fileId = Number(req.params.fileId);
    if (!churchId || !fileId) throw new ApiError(400, 'Invalid branding file path', 'FILE_PATH');
    const file = await getStoredFile(fileId, churchId);
    if (!file || file.visibility !== 'public_branding') {
      throw new ApiError(404, 'Branding file not found', 'FILE_NOT_FOUND');
    }
    sendStoredFile(res, file);
  })
);

/** Signed access — no Bearer header (for <img src>) */
router.get(
  '/signed/:token',
  asyncHandler(async (req, res) => {
    const parsed = verifyFileAccessToken(req.params.token);
    if (!parsed) throw new ApiError(401, 'Invalid or expired file token', 'FILE_TOKEN');
    const file = await getStoredFile(parsed.fileId, parsed.churchId);
    if (!file) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
    try {
      sendStoredFile(res, file);
    } catch (err) {
      if (err.code === 'FILE_MISSING' || err.status === 404) {
        throw new ApiError(404, 'File missing on disk', 'FILE_MISSING');
      }
      throw err;
    }
  })
);

router.use(authMiddleware, requireTenant, attachTenantScope);

/** Issue a short-lived signed URL for a file in this church */
router.post(
  '/:id/sign',
  asyncHandler(async (req, res) => {
    const file = await getStoredFile(req.params.id, req.churchId);
    if (!file) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
    const ttl = Math.min(86400, Number(req.body?.ttlSeconds) || 3600);
    ok(res, {
      url: signedUrl(file, ttl),
      expiresIn: ttl,
      fileId: file.id,
      category: file.category
    });
  })
);

/** Authenticated download — tenant scoped */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await getStoredFile(req.params.id, req.churchId);
    if (!file) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    if (req.query.sign === '1') {
      return ok(res, {
        id: file.id,
        url: `/api/files/${file.id}`,
        signedUrl: signedUrl(file),
        originalName: file.original_name,
        mimeType: file.mime_type,
        sizeBytes: file.size_bytes,
        category: file.category
      });
    }

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${(file.original_name || file.stored_name).replace(/"/g, '')}"`
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
    throw new ApiError(404, 'File missing on disk', 'FILE_MISSING');
  })
);

module.exports = router;
