const FOLLOW_UP_STATUSES = [
  'New',
  'Contacted',
  'Follow-up',
  'Interested',
  'Converted',
  'Closed'
];

function normalizeFollowUpStatus(status) {
  if (!status) return 'New';
  const found = FOLLOW_UP_STATUSES.find(s => s.toLowerCase() === String(status).toLowerCase());
  if (found) return found;
  // aliases
  const alias = String(status).toLowerCase();
  if (alias.includes('join') || alias.includes('convert')) return 'Converted';
  if (alias.includes('follow')) return 'Follow-up';
  return 'New';
}

module.exports = { FOLLOW_UP_STATUSES, normalizeFollowUpStatus };
