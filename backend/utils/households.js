const RELATIONSHIPS = ['head', 'spouse', 'child', 'dependent', 'other'];

function normalizeRelationship(rel) {
  const r = String(rel || 'other').toLowerCase();
  return RELATIONSHIPS.includes(r) ? r : 'other';
}

module.exports = { RELATIONSHIPS, normalizeRelationship };
