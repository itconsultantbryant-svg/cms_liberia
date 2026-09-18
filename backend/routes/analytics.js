/**
 * Phase 23 — Reporting & analytics dashboards.
 * Staff performance reports remain at /api/reports.
 */
const express = require('express');
const router = express.Router();
const { attachRoleInfo } = require('../middleware/roleAuth');
const { requirePermission } = require('../utils/rbac');
const {
  parseRange,
  parseBranchId,
  membershipReport,
  attendanceReport,
  financeReport,
  ministryReport,
  overviewReport,
  toCsv
} = require('../utils/analytics');

router.use(attachRoleInfo);

function filters(req) {
  const range = parseRange(req.query);
  return { ...range, branchId: parseBranchId(req.query) };
}

router.get('/overview', requirePermission('reports.view'), async (req, res) => {
  try {
    const data = await overviewReport(req.churchId, filters(req));
    res.json(data);
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.get('/membership', requirePermission('reports.view', 'members.view'), async (req, res) => {
  try {
    const data = await membershipReport(req.churchId, filters(req));
    res.json(data);
  } catch (error) {
    console.error('Membership analytics error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.get('/attendance', requirePermission('reports.view', 'attendance.manage'), async (req, res) => {
  try {
    const data = await attendanceReport(req.churchId, filters(req));
    res.json(data);
  } catch (error) {
    console.error('Attendance analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/finance', requirePermission('reports.view', 'finance.view'), async (req, res) => {
  try {
    const data = await financeReport(req.churchId, filters(req));
    res.json(data);
  } catch (error) {
    console.error('Finance analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/ministry', requirePermission('reports.view', 'groups.manage'), async (req, res) => {
  try {
    const data = await ministryReport(req.churchId, filters(req));
    res.json(data);
  } catch (error) {
    console.error('Ministry analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get(
  '/export/:type',
  requirePermission('reports.export', 'reports.view'),
  async (req, res) => {
    try {
      const type = String(req.params.type || '').toLowerCase();
      const format = String(req.query.format || 'csv').toLowerCase();
      const f = filters(req);
      let rows = [];
      let columns = [];
      let title = type;

      if (type === 'membership') {
        const data = await membershipReport(req.churchId, f);
        rows = [
          ...data.byStatus.map(r => ({ section: 'status', label: r.label, count: r.count })),
          ...data.byGender.map(r => ({ section: 'gender', label: r.label, count: r.count })),
          ...data.byAgeGroup.map(r => ({ section: 'age', label: r.label, count: r.count })),
          ...data.byBranch.map(r => ({ section: 'branch', label: r.label, count: r.count }))
        ];
        columns = [
          { key: 'section', label: 'Section' },
          { key: 'label', label: 'Label' },
          { key: 'count', label: 'Count' }
        ];
        title = 'membership';
      } else if (type === 'attendance') {
        const data = await attendanceReport(req.churchId, f);
        rows = (data.recent || []).map(r => ({
          date: r.date,
          branch: r.branchname,
          service: r.service_name,
          male: r.male,
          female: r.female,
          children: r.children,
          total: r.total
        }));
        columns = [
          { key: 'date', label: 'Date' },
          { key: 'branch', label: 'Branch' },
          { key: 'service', label: 'Service' },
          { key: 'male', label: 'Male' },
          { key: 'female', label: 'Female' },
          { key: 'children', label: 'Children' },
          { key: 'total', label: 'Total' }
        ];
        title = 'attendance';
      } else if (type === 'finance') {
        const data = await financeReport(req.churchId, f);
        rows = (data.byCategory || []).map(r => ({
          type: r.type,
          code: r.code,
          label: r.label,
          total: r.total
        }));
        columns = [
          { key: 'type', label: 'Type' },
          { key: 'code', label: 'Code' },
          { key: 'label', label: 'Category' },
          { key: 'total', label: 'Total' }
        ];
        title = 'finance';
      } else if (type === 'ministry') {
        const data = await ministryReport(req.churchId, f);
        rows = (data.ministries || []).map(m => ({
          name: m.name,
          category: m.category,
          branch: m.branchname,
          members: m.member_count,
          meetings: m.meeting_count,
          attendance: m.attendance_total
        }));
        columns = [
          { key: 'name', label: 'Ministry' },
          { key: 'category', label: 'Category' },
          { key: 'branch', label: 'Branch' },
          { key: 'members', label: 'Members' },
          { key: 'meetings', label: 'Meetings' },
          { key: 'attendance', label: 'Attendance' }
        ];
        title = 'ministry';
      } else {
        return res.status(400).json({ error: 'Unknown export type' });
      }

      if (format === 'json') {
        return res.json({ type: title, from: f.from, to: f.to, rows });
      }

      // Excel-friendly CSV (UTF-8 BOM)
      const csv = `\uFEFF${toCsv(rows, columns)}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${title}-report-${f.from}-to-${f.to}.csv"`
      );
      return res.send(csv);
    } catch (error) {
      console.error('Analytics export error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
