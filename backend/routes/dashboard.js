const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');
const { cacheMiddleware, dashboardCache } = require('../utils/cache');

function dashboardCacheKey(req) {
  const churchId = req.churchId || req.user?.churchId || 'x';
  const uid = req.user?.id || 'anon';
  const branchId = req.user?.branchId || 'b';
  return `dash:${churchId}:${uid}:${branchId}:${req.path}`;
}

// Get comprehensive dashboard statistics (server-side aggregations only)
router.get(
  '/',
  authMiddleware,
  attachRoleInfo,
  cacheMiddleware(dashboardCacheKey, { ttlMs: 20_000, cache: dashboardCache }),
  async (req, res) => {
  try {
    if (!req.user) {
      console.error('[Dashboard] No user object in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const branchId = req.user.branchId || req.user.id;
    if (!branchId) {
      console.error('[Dashboard] No branchId found. User object:', JSON.stringify(req.user));
      return res.status(400).json({ error: 'User branch ID not found' });
    }
    
    const userRole = req.primaryRole?.role_code || '';
    const isAdmin = req.user.isadmin || userRole === 'PRESIDENT' || userRole === 'MISSION_SECRETARY';

    // Basic statistics
    const totalMembers = await db.getAsync(
      'SELECT COUNT(*) as count FROM members WHERE branch_id = ?',
      [branchId]
    );

    const membersByPosition = await db.allAsync(
      `SELECT position, COUNT(*) as count 
       FROM members 
       WHERE branch_id = ? 
       GROUP BY position 
       ORDER BY count DESC`,
      [branchId]
    );

    const membersByGender = await db.allAsync(
      `SELECT sex, COUNT(*) as count 
       FROM members 
       WHERE branch_id = ? AND sex IS NOT NULL
       GROUP BY sex`,
      [branchId]
    );

    // Attendance statistics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const attendanceStats = await db.allAsync(
      `SELECT 
        DATE(ma.date) as date,
        COUNT(DISTINCT ma.member_id) as present_count,
        COUNT(*) as total_records
       FROM member_attendances ma
       JOIN members m ON ma.member_id = m.id
       WHERE m.branch_id = ? 
         AND ma.date >= ?
         AND ma.attendance = 'yes'
       GROUP BY DATE(ma.date)
       ORDER BY date DESC
       LIMIT 30`,
      [branchId, thirtyDaysAgo.toISOString().split('T')[0]]
    );

    // Recent attendance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentAttendance = await db.allAsync(
      `SELECT 
        DATE(ma.date) as date,
        COUNT(DISTINCT ma.member_id) as present_count
       FROM member_attendances ma
       JOIN members m ON ma.member_id = m.id
       WHERE m.branch_id = ? 
         AND ma.date >= ?
         AND ma.attendance = 'yes'
       GROUP BY DATE(ma.date)
       ORDER BY date DESC`,
      [branchId, sevenDaysAgo.toISOString().split('T')[0]]
    );

    // Collections statistics (last 30 days)
    const collectionsStats = await db.allAsync(
      `SELECT 
        DATE(c.date) as date,
        SUM(c.amount) as total_amount,
        ct.name as type
       FROM collections c
       JOIN collections_types ct ON c.collections_types_id = ct.id
       WHERE c.branch_id = ? 
         AND c.date >= ?
       GROUP BY DATE(c.date), ct.name
       ORDER BY date DESC
       LIMIT 30`,
      [branchId, thirtyDaysAgo.toISOString().split('T')[0]]
    );

    // Total collections by type (all time)
    const totalCollectionsByType = await db.allAsync(
      `SELECT 
        ct.name as type,
        SUM(c.amount) as total_amount,
        COUNT(*) as count
       FROM collections c
       JOIN collections_types ct ON c.collections_types_id = ct.id
       WHERE c.branch_id = ?
       GROUP BY ct.name
       ORDER BY total_amount DESC`,
      [branchId]
    );

    // Member collections (last 30 days)
    const memberCollections = await db.allAsync(
      `SELECT 
        DATE(mc.date_collected) as date,
        SUM(mc.amount) as total_amount,
        ct.name as type
       FROM member_collections mc
       JOIN members m ON mc.member_id = m.id
       JOIN collections_types ct ON mc.collections_types_id = ct.id
       WHERE m.branch_id = ? 
         AND mc.date_collected >= ?
       GROUP BY DATE(mc.date_collected), ct.name
       ORDER BY date DESC
       LIMIT 30`,
      [branchId, thirtyDaysAgo.toISOString().split('T')[0]]
    );

    // Upcoming events (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const upcomingEvents = await db.allAsync(
      `SELECT * FROM events 
       WHERE branch_id = ? 
         AND date >= DATE('now')
         AND date <= ?
       ORDER BY date ASC, time ASC
       LIMIT 10`,
      [branchId, nextWeek.toISOString().split('T')[0]]
    );

    // Recent announcements
    const announcements = await db.allAsync(
      `SELECT * FROM announcements 
       WHERE branch_id = ? 
         AND (stop_date IS NULL OR stop_date >= DATE('now'))
       ORDER BY id DESC
       LIMIT 5`,
      [branchId]
    );

    // Groups statistics
    const groupsStats = await db.allAsync(
      `SELECT 
        g.id,
        g.name,
        COUNT(gm.member_id) as member_count
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.branch_id = ?
       GROUP BY g.id, g.name
       ORDER BY member_count DESC`,
      [branchId]
    );

    // Calculate totals
    const totalCollections = collectionsStats.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
    const totalMemberCollections = memberCollections.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
    const avgAttendance = recentAttendance.length > 0 
      ? recentAttendance.reduce((sum, a) => sum + (parseInt(a.present_count) || 0), 0) / recentAttendance.length 
      : 0;

    // Admin-only statistics
    let adminStats = null;
    if (isAdmin) {
      const totalBranches = await db.getAsync('SELECT COUNT(*) as count FROM branches WHERE church_id = ?', [req.churchId]);
      const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM branches WHERE church_id = ? AND isadmin = 0', [req.churchId]);
      const systemMembersResult = await db.getAsync('SELECT COUNT(*) as count FROM members WHERE church_id = ?', [req.churchId]);
      const systemCollectionsResult = await db.getAsync(
        'SELECT COALESCE(SUM(amount), 0) as total FROM collections WHERE church_id = ?',
        [req.churchId]
      );
      
      adminStats = {
        totalBranches: totalBranches?.count || 0,
        totalUsers: totalUsers?.count || 0,
        systemMembers: systemMembersResult?.count || 0,
        systemCollections: parseFloat(systemCollectionsResult?.total) || 0
      };
    }

    // Get user's currency
    const branch = await db.getAsync('SELECT currency FROM branches WHERE id = ?', [branchId]);
    const userCurrency = branch?.currency || 'USD';

    res.json({
      stats: {
        totalMembers: totalMembers?.count || 0,
        membersByPosition: membersByPosition || [],
        membersByGender: membersByGender || [],
        totalGroups: groupsStats.length,
        groups: groupsStats
      },
      attendance: {
        recent: recentAttendance,
        stats: attendanceStats,
        average: Math.round(avgAttendance)
      },
      collections: {
        recent: collectionsStats,
        total: totalCollections,
        totalMemberCollections: totalMemberCollections,
        byType: totalCollectionsByType
      },
      events: {
        upcoming: upcomingEvents
      },
      announcements: announcements,
      adminStats: adminStats,
      userRole: userRole,
      isAdmin: isAdmin,
      currency: userCurrency
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * Church-scoped admin overview (Phase 5).
 * Aggregates members, branches, attendance, donations, events, ministries, staff,
 * pending approvals, financial summary — always filtered by req.churchId.
 */
router.get('/admin-overview', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const churchId = req.churchId || req.user?.churchId;
    if (!churchId) {
      return res.status(403).json({ error: 'No church context' });
    }

    const userRole = req.primaryRole?.role_code || '';
    const isAdmin =
      req.user.isadmin ||
      userRole === 'PRESIDENT' ||
      userRole === 'MISSION_SECRETARY';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Church administrator access required' });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString().split('T')[0];

    const members = await db.getAsync(
      'SELECT COUNT(*) as c FROM members WHERE church_id = ?',
      [churchId]
    );
    const visitors = await db.getAsync(
      `SELECT COUNT(*) as c FROM members WHERE church_id = ? AND LOWER(COALESCE(position,'')) LIKE '%visitor%'`,
      [churchId]
    );

    const branches = await db.getAsync(
      'SELECT COUNT(*) as c FROM branches WHERE church_id = ?',
      [churchId]
    );
    const admins = await db.getAsync(
      'SELECT COUNT(*) as c FROM branches WHERE church_id = ? AND isadmin = 1',
      [churchId]
    );
    const staff = await db.getAsync(
      'SELECT COUNT(*) as c FROM staff WHERE church_id = ?',
      [churchId]
    ).catch(() => ({ c: 0 }));

    const attendancePresent = await db.getAsync(
      `SELECT COUNT(DISTINCT ma.member_id) as c
       FROM member_attendances ma
       JOIN members m ON ma.member_id = m.id
       WHERE m.church_id = ? AND ma.date >= ? AND ma.attendance = 'yes'`,
      [churchId, since]
    ).catch(() => ({ c: 0 }));

    const donations = await db.getAsync(
      `SELECT COALESCE(SUM(amount),0) as total FROM collections WHERE church_id = ? AND date >= ?`,
      [churchId, since]
    ).catch(() => ({ total: 0 }));

    const memberGiving = await db.getAsync(
      `SELECT COALESCE(SUM(mc.amount),0) as total
       FROM member_collections mc
       JOIN members m ON mc.member_id = m.id
       WHERE m.church_id = ? AND mc.date_collected >= ?`,
      [churchId, since]
    ).catch(() => ({ total: 0 }));

    const expenses = await db.getAsync(
      `SELECT COALESCE(SUM(amount),0) as total FROM requests
       WHERE church_id = ? AND status = 'approved' AND amount IS NOT NULL`,
      [churchId]
    ).catch(() => ({ total: 0 }));

    const eventsUpcoming = await db.allAsync(
      `SELECT id, title, date, time, location FROM events
       WHERE church_id = ? AND date >= DATE('now')
       ORDER BY date ASC, time ASC LIMIT 8`,
      [churchId]
    ).catch(() => []);

    const ministries = await db.allAsync(
      `SELECT g.id, g.name, COUNT(gm.member_id) as member_count
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.church_id = ?
       GROUP BY g.id, g.name
       ORDER BY member_count DESC LIMIT 10`,
      [churchId]
    ).catch(() => []);

    const pendingApprovals = await db.getAsync(
      `SELECT COUNT(*) as c FROM pending_approvals WHERE church_id = ? AND status = 'pending'`,
      [churchId]
    ).catch(() => ({ c: 0 }));

    const pendingRequests = await db.getAsync(
      `SELECT COUNT(*) as c FROM requests WHERE church_id = ? AND status NOT IN ('approved','rejected','cancelled')`,
      [churchId]
    ).catch(() => ({ c: 0 }));

    const recentActivity = await db.allAsync(
      `SELECT 'member' as type, id, firstname || ' ' || COALESCE(lastname,'') as title, created_at as at
       FROM members WHERE church_id = ?
       ORDER BY id DESC LIMIT 5`,
      [churchId]
    ).catch(() => []);

    const membershipByPosition = await db.allAsync(
      `SELECT COALESCE(position,'(unspecified)') as position, COUNT(*) as count
       FROM members WHERE church_id = ?
       GROUP BY position ORDER BY count DESC LIMIT 8`,
      [churchId]
    );

    const church = await db.getAsync(
      'SELECT name, short_name, currency FROM churches WHERE id = ?',
      [churchId]
    );

    res.json({
      church: {
        id: churchId,
        name: church?.name,
        shortName: church?.short_name,
        currency: church?.currency || 'USD'
      },
      overview: {
        members: members?.c || 0,
        visitors: visitors?.c || 0,
        branches: branches?.c || 0,
        admins: admins?.c || 0,
        staff: staff?.c || 0,
        attendanceLast30Days: attendancePresent?.c || 0,
        donationsLast30Days: Number(donations?.total || 0) + Number(memberGiving?.total || 0),
        expensesApproved: Number(expenses?.total || 0),
        ministries: ministries.length,
        pendingApprovals: (pendingApprovals?.c || 0) + (pendingRequests?.c || 0)
      },
      financialSummary: {
        collections30d: Number(donations?.total || 0),
        memberGiving30d: Number(memberGiving?.total || 0),
        approvedRequestSpend: Number(expenses?.total || 0),
        net30d:
          Number(donations?.total || 0) +
          Number(memberGiving?.total || 0) -
          Number(expenses?.total || 0)
      },
      upcomingEvents: eventsUpcoming || [],
      ministries: ministries || [],
      membershipStatistics: membershipByPosition || [],
      recentActivities: recentActivity || [],
      links: {
        members: '/members',
        branches: '/branches',
        attendance: '/attendance',
        donations: '/collections',
        events: '/events',
        ministries: '/groups',
        staff: '/staff',
        approvals: '/workflows',
        finance: '/finance',
        admins: '/settings/admins'
      }
    });
  } catch (error) {
    console.error('[admin-overview]', error);
    res.status(500).json({ error: error.message });
  }
});

const {
  resolvePersona,
  buildPersonalizedDashboard,
  getPreferences,
  savePreferences
} = require('../utils/dashboardPersonalization');

/** GET /api/dashboard/persona — which dashboard the current user should see */
router.get('/persona', authMiddleware, attachRoleInfo, async (req, res) => {
  try {
    const persona = resolvePersona(req.user, req.primaryRole, req.user?.permissions || []);
    res.json({ persona });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/dashboard/personalized — role-scoped widgets */
router.get(
  '/personalized',
  authMiddleware,
  attachRoleInfo,
  cacheMiddleware(dashboardCacheKey, { ttlMs: 20_000, cache: dashboardCache }),
  async (req, res) => {
  try {
    const payload = await buildPersonalizedDashboard(req);
    res.json(payload);
  } catch (error) {
    console.error('[dashboard/personalized]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/dashboard/preferences */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const prefs = await getPreferences(req.user.id, req.churchId || req.user.churchId || null);
    res.json({ preferences: prefs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/dashboard/preferences — hide/reorder widgets */
router.patch('/preferences', authMiddleware, async (req, res) => {
  try {
    const prefs = await savePreferences(req.user.id, req.churchId || req.user.churchId || null, {
      hiddenWidgets: req.body.hiddenWidgets,
      widgetOrder: req.body.widgetOrder,
      persona: req.body.persona
    });
    res.json({ message: 'Preferences saved', preferences: prefs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

