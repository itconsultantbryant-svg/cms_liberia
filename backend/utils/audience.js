/**
 * Resolve outreach audiences to member/staff contact lists.
 */
const db = require('../database');

const AUDIENCE_TYPES = [
  'church',
  'branch',
  'ministry',
  'group',
  'department',
  'staff',
  'members'
];

async function resolveAudience({
  churchId,
  branchId,
  audienceType,
  audienceRefId = null,
  audienceMemberIds = []
}) {
  const type = audienceType === 'group' ? 'ministry' : audienceType;
  if (!AUDIENCE_TYPES.includes(audienceType) && type !== 'ministry') {
    throw Object.assign(new Error('Invalid audience type'), { status: 400 });
  }

  let members = [];

  if (type === 'church') {
    members = await db.allAsync(
      `SELECT id, firstname, lastname, email, phone, branch_id, dob
       FROM members WHERE church_id = ?`,
      [churchId]
    );
  } else if (type === 'branch') {
    const bid = audienceRefId || branchId;
    members = await db.allAsync(
      `SELECT id, firstname, lastname, email, phone, branch_id, dob
       FROM members WHERE church_id = ? AND branch_id = ?`,
      [churchId, bid]
    );
  } else if (type === 'ministry') {
    if (!audienceRefId) throw Object.assign(new Error('audienceRefId required for ministry'), { status: 400 });
    members = await db.allAsync(
      `SELECT m.id, m.firstname, m.lastname, m.email, m.phone, m.branch_id, m.dob
       FROM group_members gm
       JOIN members m ON m.id = gm.member_id
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.group_id = ? AND m.church_id = ?
         AND (g.church_id = ? OR g.branch_id IN (SELECT id FROM branches WHERE church_id = ?))`,
      [audienceRefId, churchId, churchId, churchId]
    );
  } else if (type === 'department') {
    if (!audienceRefId) throw Object.assign(new Error('audienceRefId required for department'), { status: 400 });
    // Prefer staff in department; also members with matching position is weak — use staff
    const staff = await db.allAsync(
      `SELECT s.id, s.firstname, s.lastname, s.email, s.phone, s.branch_id, NULL as dob
       FROM staff s
       JOIN branches b ON b.id = s.branch_id
       WHERE s.department_id = ? AND b.church_id = ? AND s.is_active = 1`,
      [audienceRefId, churchId]
    );
    return {
      audienceType: type,
      recipients: staff.map(s => ({ ...s, recipientKind: 'staff' })),
      counts: {
        total: staff.length,
        withEmail: staff.filter(s => s.email).length,
        withPhone: staff.filter(s => s.phone).length
      }
    };
  } else if (type === 'staff') {
    const staff = await db.allAsync(
      `SELECT s.id, s.firstname, s.lastname, s.email, s.phone, s.branch_id, NULL as dob
       FROM staff s
       JOIN branches b ON b.id = s.branch_id
       WHERE b.church_id = ? AND s.is_active = 1
         ${audienceRefId ? 'AND s.branch_id = ?' : ''}`,
      audienceRefId ? [churchId, audienceRefId] : [churchId]
    );
    return {
      audienceType: type,
      recipients: staff.map(s => ({ ...s, recipientKind: 'staff' })),
      counts: {
        total: staff.length,
        withEmail: staff.filter(s => s.email).length,
        withPhone: staff.filter(s => s.phone).length
      }
    };
  } else if (type === 'members') {
    const ids = Array.isArray(audienceMemberIds)
      ? audienceMemberIds.map(Number).filter(Boolean)
      : String(audienceMemberIds || '')
          .split(',')
          .map(Number)
          .filter(Boolean);
    if (!ids.length) {
      throw Object.assign(new Error('audienceMemberIds required'), { status: 400 });
    }
    const placeholders = ids.map(() => '?').join(',');
    members = await db.allAsync(
      `SELECT id, firstname, lastname, email, phone, branch_id, dob
       FROM members WHERE church_id = ? AND id IN (${placeholders})`,
      [churchId, ...ids]
    );
  }

  return {
    audienceType: type,
    recipients: members.map(m => ({ ...m, recipientKind: 'member' })),
    counts: {
      total: members.length,
      withEmail: members.filter(m => m.email).length,
      withPhone: members.filter(m => m.phone).length
    }
  };
}

module.exports = { resolveAudience, AUDIENCE_TYPES };
