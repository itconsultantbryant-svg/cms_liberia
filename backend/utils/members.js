const MEMBERSHIP_STATUSES = [
  'Pending',
  'Active',
  'Inactive',
  'Visitor',
  'Transferred',
  'Deceased',
  'Suspended'
];

const ALLOWED_UPDATE_FIELDS = new Set([
  'title',
  'firstname',
  'middlename',
  'lastname',
  'email',
  'dob',
  'phone',
  'phone_alt',
  'occupation',
  'position',
  'address',
  'address2',
  'postal',
  'city',
  'state',
  'country',
  'sex',
  'marital_status',
  'member_since',
  'wedding_anniversary',
  'photo',
  'relative',
  'member_status',
  'membership_status',
  'baptism_status',
  'baptism_date',
  'ministry',
  'department',
  'emergency_contact_name',
  'emergency_contact_phone',
  'notes',
  'membership_id',
  'branch_id'
]);

function formatMembershipId(churchId, memberId) {
  // Legacy sync formatter — prefer assignMembershipId when creating members
  return `MEM-${String(churchId || 0).padStart(3, '0')}-${String(memberId).padStart(5, '0')}`;
}

async function assignMembershipId(churchId, memberId) {
  try {
    const { allocateMembershipNumber } = require('./churchSettings');
    return await allocateMembershipNumber(churchId);
  } catch (_) {
    return formatMembershipId(churchId, memberId);
  }
}

function normalizeStatus(status) {
  if (!status) return 'Active';
  const found = MEMBERSHIP_STATUSES.find(s => s.toLowerCase() === String(status).toLowerCase());
  return found || 'Active';
}

function escapeCsv(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function membersToCsv(rows) {
  const headers = [
    'membership_id',
    'firstname',
    'middlename',
    'lastname',
    'email',
    'phone',
    'phone_alt',
    'sex',
    'dob',
    'address',
    'city',
    'state',
    'country',
    'occupation',
    'marital_status',
    'membership_status',
    'member_since',
    'baptism_status',
    'baptism_date',
    'ministry',
    'department',
    'position',
    'emergency_contact_name',
    'emergency_contact_phone',
    'notes'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => escapeCsv(r[h])).join(','));
  }
  return lines.join('\n');
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] != null ? cols[idx].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

module.exports = {
  MEMBERSHIP_STATUSES,
  ALLOWED_UPDATE_FIELDS,
  formatMembershipId,
  assignMembershipId,
  normalizeStatus,
  membersToCsv,
  parseCsv
};
