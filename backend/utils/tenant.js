const db = require('../database');
const { resolveBrandingAssetUrl } = require('./fileStorage');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80) || 'church';
}

async function uniqueChurchSlug(baseSlug) {
  let slug = slugify(baseSlug);
  let candidate = slug;
  let n = 1;
  while (await db.getAsync('SELECT id FROM churches WHERE slug = ?', [candidate])) {
    candidate = `${slug}-${n++}`;
  }
  return candidate;
}

async function getChurchById(churchId) {
  if (!churchId) return null;
  return db.getAsync(
    `SELECT id, name, short_name, slug, email, phone, website_url, logo_url, favicon_url,
            login_background_url, primary_color, secondary_color, timezone, currency, status
     FROM churches WHERE id = ?`,
    [churchId]
  );
}

function churchSummary(church) {
  if (!church) return null;
  return {
    id: church.id,
    name: church.name,
    shortName: church.short_name,
    slug: church.slug,
    websiteUrl: church.website_url,
    logoUrl: resolveBrandingAssetUrl(church.logo_url),
    faviconUrl: resolveBrandingAssetUrl(church.favicon_url),
    loginBackgroundUrl: resolveBrandingAssetUrl(church.login_background_url || null),
    primaryColor: church.primary_color || '#2c3e50',
    secondaryColor: church.secondary_color || '#3498db',
    currency: church.currency,
    timezone: church.timezone,
    status: church.status
  };
}

function portalLoginPath(slug) {
  const s = slugify(slug);
  return s ? `/t/${s}/login` : '/login';
}

module.exports = {
  slugify,
  uniqueChurchSlug,
  getChurchById,
  churchSummary,
  portalLoginPath
};
