/**
 * Phase 33 — authorized file download / signed access.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { attachTenantScope } = require('../utils/tenantScope');
const {
  getStoredFile,
  absolutePath,
  signedUrl,
  verifyFileAccessToken,
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

/** Signed access — no Bearer header (for <img src>) */
router.get(
  '/signed/:token',
  asyncHandler(async (req, res) => {
    const parsed = verifyFileAccessToken(req.params.token);
    if (!parsed) throw new ApiError(401, 'Invalid or expired file token', 'FILE_TOKEN');
    const file = await getStoredFile(parsed.fileId, parsed.churchId);
    if (!file) throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
    const abs = absolutePath(file.relative_path);
    if (!fs.existsSync(abs)) throw new ApiError(404, 'File missing on disk', 'FILE_MISSING');
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(file.original_name || file.stored_name).replace(/"/g, '')}"`
    );
    fs.createReadStream(abs).pipe(res);
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
    const abs = absolutePath(file.relative_path);
    if (!fs.existsSync(abs)) throw new ApiError(404, 'File missing on disk', 'FILE_MISSING');

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${(file.original_name || file.stored_name).replace(/"/g, '')}"`
    );
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
    fs.createReadStream(abs).pipe(res);
  })
);

module.exports = router;
