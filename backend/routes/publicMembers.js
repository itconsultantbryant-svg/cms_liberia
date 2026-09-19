/**
 * Public membership self-registration (QR / join form).
 * Creates members as Pending — admins approve before account credentials are issued.
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const { resolveTenantBySlug } = require('../utils/domains');
const { churchSummary } = require('../utils/tenant');
const { assignMembershipId } = require('../utils/members');
const { assertCanCreate } = require('../utils/subscriptions');
const { notifyChurchAdmins } = require('../utils/notifications');

async function resolveChurchFromQuery(req) {
  const slug = String(req.query.slug || req.body?.slug || '').trim();
  if (!slug) return null;
  const result = await resolveTenantBySlug(slug);
  if (!result?.resolved || !result.church) return null;
  return result.church;
}

/** GET /api/public/membership/form?slug= — branding + form meta */
router.get('/form', async (req, res) => {
  try {
    const church = await resolveChurchFromQuery(req);
    if (!church) {
      return res.status(404).json({ error: 'Church not found for this link', code: 'TENANT_SLUG_UNKNOWN' });
    }
    const full = await db.getAsync('SELECT * FROM churches WHERE id = ?', [church.id]);
    res.json({
      church: churchSummary(full || church),
      joinPath: `/t/${church.slug}/join`,
      fields: [
        'firstname',
        'lastname',
        'email',
        'phone',
        'sex',
        'dob',
        'marital_status',
        'occupation',
        'address',
        'city',
        'state',
        'country',
        'emergency_contact_name',
        'emergency_contact_phone',
        'notes'
      ]
    });
  } catch (error) {
    console.error('[public/membership/form]', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/public/membership/join — self-register as Pending */
router.post('/join', async (req, res) => {
  try {
    const church = await resolveChurchFromQuery(req);
    if (!church) {
      return res.status(404).json({ error: 'Church not found for this link', code: 'TENANT_SLUG_UNKNOWN' });
    }

    const {
      firstname,
      lastname,
      middlename,
      email,
      phone,
      phone_alt,
      sex,
      dob,
      marital_status,
      occupation,
      address,
      address2,
      city,
      state,
      country,
      postal,
      emergency_contact_name,
      emergency_contact_phone,
      notes,
      title
    } = req.body || {};

    if (!firstname || !lastname || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const limitErr = await assertCanCreate(church.id, 'member');
    if (limitErr) return res.status(403).json({ error: limitErr });

    const existing = await db.getAsync(
      'SELECT id, membership_status FROM members WHERE church_id = ? AND lower(email) = ?',
      [church.id, emailNorm]
    );
    if (existing) {
      return res.status(409).json({
        error: 'An application or membership already exists for this email. Contact your church admin.',
        code: 'MEMBER_EXISTS'
      });
    }

    const hq = await db.getAsync(
      `SELECT id FROM branches WHERE church_id = ? ORDER BY id ASC LIMIT 1`,
      [church.id]
    );

    const result = await db.runAsync(
      `INSERT INTO members (
        branch_id, church_id, title, firstname, middlename, lastname, email, dob, phone, phone_alt,
        occupation, position, address, address2, postal, city, state, country, sex, marital_status,
        member_since, photo, member_status, membership_status,
        baptism_status, emergency_contact_name, emergency_contact_phone, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hq?.id || null,
        church.id,
        title || 'Mr',
        String(firstname).trim(),
        middlename ? String(middlename).trim() : null,
        String(lastname).trim(),
        emailNorm,
        dob || null,
        phone || null,
        phone_alt || null,
        occupation || null,
        'member',
        address || null,
        address2 || null,
        postal || null,
        city || null,
        state || null,
        country || null,
        sex || null,
        marital_status || null,
        null,
        'profile.png',
        'new',
        'Pending',
        'unknown',
        emergency_contact_name || null,
        emergency_contact_phone || null,
        notes
          ? `${String(notes).trim()}\n[Submitted via public membership form]`
          : '[Submitted via public membership form]'
      ]
    );

    const membershipId = await assignMembershipId(church.id, result.lastID);
    await db.runAsync('UPDATE members SET membership_id = ? WHERE id = ?', [membershipId, result.lastID]);

    try {
      await db.runAsync(
        `INSERT INTO pending_approvals (branch_id, church_id, submitted_by, submitted_by_type, approval_type, reference_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [hq?.id || null, church.id, result.lastID, 'public_join', 'member_join', result.lastID, 'pending']
      );
    } catch (_) {
      /* pending_approvals optional */
    }

    await notifyChurchAdmins(
      church.id,
      'member',
      'New membership application',
      `${firstname} ${lastname} submitted a membership form and awaits approval.`,
      result.lastID,
      'member'
    ).catch(() => {});

    res.status(201).json({
      message:
        'Thank you. Your membership application was submitted and is awaiting church admin approval. You will receive login credentials after approval.',
      memberId: result.lastID,
      membershipId,
      status: 'Pending'
    });
  } catch (error) {
    console.error('[public/membership/join]', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

module.exports = router;
