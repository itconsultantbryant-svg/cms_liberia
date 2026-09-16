/**
 * Phase 36 — pagination helpers (never unbounded list pulls).
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationMeta({ page, limit, total }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  return {
    page,
    limit,
    total: total || 0,
    pages,
    hasMore: page < pages
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  paginationMeta
};
