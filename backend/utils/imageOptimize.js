/**
 * Phase 36 — image upload constraints (optimize payload size without sharp).
 * Clients should still use loading="lazy" / decoding="async" in the UI.
 */

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB preferred for photos/logos

function isAllowedImageMime(mime) {
  return ALLOWED_IMAGE_MIME.has(String(mime || '').toLowerCase());
}

function imageUploadLimits() {
  return { fileSize: MAX_IMAGE_BYTES, files: 1 };
}

function assertImageFile(file) {
  if (!file) return { ok: false, error: 'No file uploaded' };
  if (!isAllowedImageMime(file.mimetype)) {
    return { ok: false, error: 'Only JPEG, PNG, WebP, or GIF images are allowed' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image must be under ${MAX_IMAGE_BYTES / (1024 * 1024)}MB` };
  }
  return { ok: true };
}

module.exports = {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  isAllowedImageMime,
  imageUploadLimits,
  assertImageFile
};
