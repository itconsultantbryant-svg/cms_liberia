/**
 * Phase 30 — resolve dashboard persona and build personalized widget payloads.
 */
const db = require('../database');

const MEMBERSHIP_ROLES = [
  'SECRETARY',
  'BRANCH_SECRETARY',
  'OFFICE_ASSISTANT',
  'ADMINISTRATIVE_PASTOR'
];

const PASTOR_ROLES = [
  'RESIDENT_PASTOR',
  'RESIDENT_PASTOR_HQ',
  'SENIOR_PASTOR',
  'ASSOCIATE_PASTOR',
  'BRANCH_PASTOR',
  'ASSISTANT_PASTOR',
  'ASSISTANT_RESIDENT_PASTOR'
];

const BRANCH_ADMIN_ROLES = [
  'BRANCH_ADMIN',
  'ADMINISTRATIVE_PASTOR',
  'RESIDENT_PASTOR',
  'RESIDENT_PASTOR_HQ'
];

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Resolve which personalized dashboard a user should see.
 */
function resolvePersona(user, primaryRole, permissions = []) {
  const role = primaryRole?.role_code || user?.primaryRole?.role_code || '';
  const perms = permissions.length ? permissions : user?.permissions || [];

  if (user?.isSuperadmin || user?.is_superadmin) {
    return {
      id: 'superadmin',
      title: 'Platform overview',
      description: 'Platform-wide SaaS metrics across all churches.',
      scope: 'platform',
      preferredView: 'superadmin'
    };
  }

  if (user?.userType === 'sub_user') {
    return {
      id: 'secretary',
      title: 'Operations dashboard',
      description: 'Tasks you are permitted to perform.',
      scope: 'branch',
      preferredView: 'secretary'
    };
  }

  if (
    user?.isadmin ||
    role === 'PRESIDENT' ||
    role === 'MISSION_SECRETARY' ||
    perms.includes('user_management')
  ) {
    return {
      id: 'church_admin',
      title: 'Church administration',
      description: 'Church-wide information you are authorized to manage.',
      scope: 'church',
      preferredView: 'church_admin'
    };
  }

  if (perms.includes('manage_finance') || role === 'FINANCE_OFFICER') {
    return {
      id: 'finance',
      title: 'Finance dashboard',
      description: 'Financial activity, ledgers, pledges, and approvals.',
      scope: 'church',
      preferredView: 'finance'
    };
  }

  if (
    perms.includes('request_management') ||
    role === 'MISSION_SECRETARY_MISSION'
  ) {
    return {
      id: 'requests',
      title: 'Request management',
      description: 'Incoming requests and approval workflow.',
      scope: 'church',
      preferredView: 'requests'
    };
  }

  if (
    perms.includes('vp_dashboard') ||
    role === 'VICE_PRESIDENT_MA' ||
    role === 'VICE_PRESIDENT_MISSION'
  ) {
    return {
      id: 'executive',
      title: 'Executive overview',
      description: 'High-level church and mission information.',
      scope: 'church',
      preferredView: 'executive'
    };
  }

  if (perms.includes('pastor_dashboard') || PASTOR_ROLES.includes(role)) {
    return {
      id: 'pastor',
      title: 'Pastoral overview',
      description: 'High-level church health: people, care, and gatherings.',
      scope: role.includes('HQ') || role === 'RESIDENT_PASTOR_HQ' ? 'church' : 'branch',
      preferredView: 'pastor'
    };
  }

  if (
    MEMBERSHIP_ROLES.includes(role) ||
    (perms.includes('view_members') &&
      !perms.includes('manage_finance') &&
      !perms.includes('pastor_dashboard'))
  ) {
    // Branch secretaries / membership-focused users
    const branchScoped =
      BRANCH_ADMIN_ROLES.includes(role) ||
      role === 'BRANCH_SECRETARY' ||
      role === 'SECRETARY' ||
      !!user?.activeBranchId;
    return {
      id: 'membership',
      title: 'Membership dashboard',
      description: 'Membership, visitors, attendance, and households.',
      scope: branchScoped && !user?.isadmin ? 'branch' : 'church',
      preferredView: 'membership'
    };
  }

  if (user?.userType === 'sub_user') {
    return {
      id: 'secretary',
      title: 'Operations dashboard',
      description: 'Tasks you are permitted to perform.',
      scope: 'branch',
      preferredView: 'secretary'
    };
  }

  return {
    id: 'general',
    title: 'Dashboard',
    description: 'Overview of information available to your role.',
    scope: 'branch',
    preferredView: 'general'
  };
}

async function getPreferences(userId, churchId) {
  const row = await db.getAsync(
    `SELECT * FROM user_dashboard_preferences
     WHERE user_id = ? AND IFNULL(church_id, -1) = IFNULL(?, -1)`,
    [userId, churchId ?? null]
  ).catch(() => null);
  if (!row) {
    return { hiddenWidgets: [], widgetOrder: [] };
  }
  return {
    hiddenWidgets: parseJsonArray(row.hidden_widgets),
    widgetOrder: parseJsonArray(row.widget_order),
    persona: row.persona
  };
}

async function savePreferences(userId, churchId, { hiddenWidgets, widgetOrder, persona } = {}) {
  const row = await db.getAsync(
    `SELECT id FROM user_dashboard_preferences
     WHERE user_id = ? AND IFNULL(church_id, -1) = IFNULL(?, -1)`,
    [userId, churchId ?? null]
  );

  const hidden = JSON.stringify(Array.isArray(hiddenWidgets) ? hiddenWidgets : []);
  const order = JSON.stringify(Array.isArray(widgetOrder) ? widgetOrder : []);

  if (row) {
    await db.runAsync(
      `UPDATE user_dashboard_preferences
       SET hidden_widgets = ?, widget_order = ?, persona = COALESCE(?, persona),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [hidden, order, persona || null, row.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO user_dashboard_preferences
         (user_id, church_id, persona, hidden_widgets, widget_order)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, churchId ?? null, persona || null, hidden, order]
    );
  }
  return getPreferences(userId, churchId);
}

function sinceDays(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function countMembers({ churchId, branchId, scope }) {
  if (scope === 'branch' && branchId) {
    const r = await db.getAsync(
      'SELECT COUNT(*) as c FROM members WHERE church_id = ? AND branch_id = ?',
      [churchId, branchId]
    );
    return r?.c || 0;
  }
  const r = await db.getAsync('SELECT COUNT(*) as c FROM members WHERE church_id = ?', [churchId]);
  return r?.c || 0;
}

async function buildPersonalizedDashboard(req) {
  const user = req.user;
  const churchId = req.churchId || user?.churchId;
  const branchId = user?.activeBranchId || user?.branchId || user?.id;
  const persona = resolvePersona(user, req.primaryRole, user?.permissions || []);
  const prefs = churchId
    ? await getPreferences(user.id, churchId)
    : { hiddenWidgets: [], widgetOrder: [] };

  const widgets = [];
  const quickLinks = [];
  const since = sinceDays(30);
  const currency = user?.church?.currency || user?.currency || 'USD';

  if (persona.id === 'superadmin') {
    const churches = await db.getAsync(
      `SELECT COUNT(*) as c FROM churches WHERE status != 'archived'`
    ).catch(() => ({ c: 0 }));
    const active = await db.getAsync(
      `SELECT COUNT(*) as c FROM churches WHERE status = 'active'`
    ).catch(() => ({ c: 0 }));
    const members = await db.getAsync('SELECT COUNT(*) as c FROM members').catch(() => ({ c: 0 }));
    widgets.push(
      { id: 'platform_churches', label: 'Churches', value: churches?.c || 0, icon: '🏛️', to: '/superadmin' },
      { id: 'platform_active', label: 'Active churches', value: active?.c || 0, icon: '✅', to: '/superadmin' },
      { id: 'platform_members', label: 'Members (all tenants)', value: members?.c || 0, icon: '👥', to: '/superadmin' }
    );
    quickLinks.push(
      { label: 'Superadmin portal', to: '/superadmin' },
      { label: 'Plans & subscriptions', to: '/superadmin' }
    );
  } else if (!churchId) {
    return { persona, widgets: [], quickLinks: [], prefs, currency, scopeMeta: {} };
  } else {
    const memberCount = await countMembers({ churchId, branchId, scope: persona.scope });
    const attendance = await db
      .getAsync(
        persona.scope === 'branch' && branchId
          ? `SELECT COUNT(DISTINCT ma.member_id) as c
             FROM member_attendances ma
             JOIN members m ON ma.member_id = m.id
             WHERE m.church_id = ? AND m.branch_id = ? AND ma.date >= ? AND ma.attendance = 'yes'`
          : `SELECT COUNT(DISTINCT ma.member_id) as c
             FROM member_attendances ma
             JOIN members m ON ma.member_id = m.id
             WHERE m.church_id = ? AND ma.date >= ? AND ma.attendance = 'yes'`,
        persona.scope === 'branch' && branchId
          ? [churchId, branchId, since]
          : [churchId, since]
      )
      .catch(() => ({ c: 0 }));

    const donations = await db
      .getAsync(
        persona.scope === 'branch' && branchId
          ? `SELECT COALESCE(SUM(amount),0) as total FROM collections
             WHERE church_id = ? AND branch_id = ? AND date >= ?`
          : `SELECT COALESCE(SUM(amount),0) as total FROM collections
             WHERE church_id = ? AND date >= ?`,
        persona.scope === 'branch' && branchId
          ? [churchId, branchId, since]
          : [churchId, since]
      )
      .catch(() => ({ total: 0 }));

    const events = await db
      .getAsync(
        `SELECT COUNT(*) as c FROM events WHERE church_id = ? AND date >= DATE('now')`
      , [churchId])
      .catch(() => ({ c: 0 }));

    const pending = await db
      .getAsync(
        `SELECT COUNT(*) as c FROM pending_approvals WHERE church_id = ? AND status = 'pending'`,
        [churchId]
      )
      .catch(() => ({ c: 0 }));

    const visitors = await db
      .getAsync(
        persona.scope === 'branch' && branchId
          ? `SELECT COUNT(*) as c FROM visitors WHERE church_id = ? AND branch_id = ?`
          : `SELECT COUNT(*) as c FROM visitors WHERE church_id = ?`,
        persona.scope === 'branch' && branchId ? [churchId, branchId] : [churchId]
      )
      .catch(() => ({ c: 0 }));

    const households = await db
      .getAsync(
        `SELECT COUNT(*) as c FROM households WHERE church_id = ?`,
        [churchId]
      )
      .catch(() => ({ c: 0 }));

    const money = (n) => Number(n || 0);

    // Role-primary widgets
    if (persona.id === 'finance') {
      widgets.push(
        { id: 'donations_30d', label: 'Collections (30d)', value: money(donations?.total), money: true, icon: '💰', to: '/finance/ledger' },
        { id: 'pending_approvals', label: 'Pending approvals', value: pending?.c || 0, icon: '⏳', to: '/workflows' },
        { id: 'pledges', label: 'Pledges & donations', value: 'Open', icon: '🎁', to: '/pledges' },
        { id: 'budgets', label: 'Budgets', value: 'Open', icon: '📊', to: '/budgets' },
        { id: 'members_ref', label: 'Members (context)', value: memberCount, icon: '👥', to: '/members' }
      );
      quickLinks.push(
        { label: 'Finance ledger', to: '/finance/ledger' },
        { label: 'Pledges', to: '/pledges' },
        { label: 'Budgets', to: '/budgets' },
        { label: 'Payroll', to: '/payroll' }
      );
    } else if (persona.id === 'membership') {
      widgets.push(
        { id: 'members', label: 'Members', value: memberCount, icon: '👥', to: '/members' },
        { id: 'visitors', label: 'Visitors', value: visitors?.c || 0, icon: '🚪', to: '/visitors' },
        { id: 'households', label: 'Households', value: households?.c || 0, icon: '🏠', to: '/households' },
        { id: 'attendance_30d', label: 'Attendance (30d)', value: attendance?.c || 0, icon: '✓', to: '/attendance' },
        { id: 'events', label: 'Upcoming events', value: events?.c || 0, icon: '📅', to: '/events' }
      );
      quickLinks.push(
        { label: 'Add member', to: '/members/new' },
        { label: 'Visitors', to: '/visitors' },
        { label: 'Record attendance', to: '/attendance' },
        { label: 'Households', to: '/households' }
      );
    } else if (persona.id === 'pastor') {
      widgets.push(
        { id: 'members', label: 'Members', value: memberCount, icon: '👥', to: '/members' },
        { id: 'attendance_30d', label: 'Attendance (30d)', value: attendance?.c || 0, icon: '✓', to: '/attendance' },
        { id: 'events', label: 'Upcoming events', value: events?.c || 0, icon: '📅', to: '/events' },
        { id: 'pastoral', label: 'Pastoral care', value: 'Open', icon: '🕊️', to: '/pastoral' },
        { id: 'donations_30d', label: 'Giving (30d)', value: money(donations?.total), money: true, icon: '💰', to: '/collections' }
      );
      quickLinks.push(
        { label: 'Pastoral care', to: '/pastoral' },
        { label: 'Members', to: '/members' },
        { label: 'Services', to: '/services' },
        { label: 'Ministries', to: '/groups' }
      );
    } else if (persona.id === 'church_admin') {
      const branches = await db
        .getAsync('SELECT COUNT(*) as c FROM branches WHERE church_id = ?', [churchId])
        .catch(() => ({ c: 0 }));
      widgets.push(
        { id: 'members', label: 'Members', value: memberCount, icon: '👥', to: '/members' },
        { id: 'branches', label: 'Branches', value: branches?.c || 0, icon: '🏛️', to: '/branches' },
        { id: 'donations_30d', label: 'Giving (30d)', value: money(donations?.total), money: true, icon: '💰', to: '/finance' },
        { id: 'attendance_30d', label: 'Attendance (30d)', value: attendance?.c || 0, icon: '✓', to: '/attendance' },
        { id: 'pending_approvals', label: 'Pending approvals', value: pending?.c || 0, icon: '⏳', to: '/workflows' },
        { id: 'events', label: 'Upcoming events', value: events?.c || 0, icon: '📅', to: '/events' }
      );
      quickLinks.push(
        { label: 'Church settings', to: '/settings' },
        { label: 'Branches', to: '/branches' },
        { label: 'Users', to: '/users' },
        { label: 'Reports', to: '/reports' }
      );
    } else {
      widgets.push(
        { id: 'members', label: 'Members', value: memberCount, icon: '👥', to: '/members' },
        { id: 'attendance_30d', label: 'Attendance (30d)', value: attendance?.c || 0, icon: '✓', to: '/attendance' },
        { id: 'events', label: 'Upcoming events', value: events?.c || 0, icon: '📅', to: '/events' },
        { id: 'donations_30d', label: 'Giving (30d)', value: money(donations?.total), money: true, icon: '💰', to: '/collections' }
      );
      quickLinks.push(
        { label: 'Members', to: '/members' },
        { label: 'Attendance', to: '/attendance' },
        { label: 'Events', to: '/events' }
      );
    }
  }

  const hidden = new Set(prefs.hiddenWidgets || []);
  let visible = widgets.filter((w) => !hidden.has(w.id));
  if (prefs.widgetOrder?.length) {
    const rank = new Map(prefs.widgetOrder.map((id, i) => [id, i]));
    visible = [...visible].sort((a, b) => {
      const ai = rank.has(a.id) ? rank.get(a.id) : 999;
      const bi = rank.has(b.id) ? rank.get(b.id) : 999;
      return ai - bi;
    });
  }

  const branch = branchId
    ? await db
        .getAsync('SELECT id, branchname, is_headquarters FROM branches WHERE id = ?', [branchId])
        .catch(() => null)
    : null;

  return {
    persona,
    currency,
    widgets: visible,
    allWidgets: widgets,
    quickLinks,
    prefs,
    scopeMeta: {
      churchId,
      branchId,
      branchName: branch?.branchname || null,
      isHeadquarters: !!branch?.is_headquarters,
      scope: persona.scope
    }
  };
}

module.exports = {
  resolvePersona,
  getPreferences,
  savePreferences,
  buildPersonalizedDashboard,
  MEMBERSHIP_ROLES,
  PASTOR_ROLES
};
