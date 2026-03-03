const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { attachRoleInfo } = require('../middleware/roleAuth');

// Get comprehensive dashboard statistics
router.get('/', authMiddleware, attachRoleInfo, async (req, res) => {
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
      const totalBranches = await db.getAsync('SELECT COUNT(*) as count FROM branches');
      const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM branches WHERE isadmin = 0');
      const systemMembersResult = await db.getAsync('SELECT COUNT(*) as count FROM members');
      const systemCollectionsResult = await db.allAsync('SELECT SUM(amount) as total FROM collections');
      
      adminStats = {
        totalBranches: totalBranches?.count || 0,
        totalUsers: totalUsers?.count || 0,
        systemMembers: systemMembersResult?.count || 0,
        systemCollections: systemCollectionsResult.reduce((sum, c) => sum + (parseFloat(c.total) || 0), 0)
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

module.exports = router;

