/**
 * Phase 31 — central API module registry.
 * Mounts modular routes with auth / tenant gates applied consistently.
 */
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { attachTenantScope } = require('../utils/tenantScope');
const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');

const tenantGate = [authMiddleware, requireTenant, attachTenantScope];

/** Public catalog of API modules (no secrets). */
const API_MODULES = [
  { key: 'auth', base: '/api/auth', auth: false, description: 'Register, login, password reset' },
  { key: 'tenant', base: '/api/tenant', auth: false, description: 'Host/domain tenant resolution & church domains' },
  { key: 'superadmin', base: '/api/superadmin', auth: true, scope: 'platform', description: 'Platform churches, plans, support' },
  { key: 'church', base: '/api/church', auth: true, scope: 'tenant', description: 'Branding, settings, admins, subscription' },
  { key: 'branches', base: '/api/branches', auth: true, scope: 'tenant', description: 'Campuses & branch context', aliases: ['/api/church/branches'] },
  { key: 'members', base: '/api/members', auth: true, scope: 'tenant', description: 'Membership roll' },
  { key: 'households', base: '/api/households', auth: true, scope: 'tenant', description: 'Households' },
  { key: 'visitors', base: '/api/visitors', auth: true, scope: 'tenant', description: 'Visitor tracking' },
  { key: 'attendance', base: '/api/attendance', auth: true, scope: 'tenant', description: 'Attendance records' },
  { key: 'services', base: '/api/services', auth: true, scope: 'tenant', description: 'Service types' },
  { key: 'finance', base: '/api/finance', auth: true, scope: 'tenant', description: 'Ledger & accounting' },
  { key: 'pledges', base: '/api/pledges', auth: true, scope: 'tenant', description: 'Pledges & donations' },
  { key: 'budgets', base: '/api/budgets', auth: true, scope: 'tenant', description: 'Budgets' },
  { key: 'events', base: '/api/events', auth: true, scope: 'tenant', description: 'Events calendar' },
  { key: 'reports', base: '/api/reports', auth: true, scope: 'tenant', description: 'Operational reports' },
  { key: 'analytics', base: '/api/analytics', auth: true, scope: 'tenant', description: 'Analytics dashboards' },
  { key: 'dashboard', base: '/api/dashboard', auth: true, scope: 'tenant', description: 'Personalized dashboards' },
  { key: 'workflows', base: '/api/workflows', auth: true, scope: 'tenant', description: 'Approval workflows' },
  { key: 'notifications', base: '/api/notifications', auth: true, scope: 'tenant', description: 'In-app notifications' },
  { key: 'documents', base: '/api/documents', auth: true, scope: 'tenant', description: 'Document library' },
  { key: 'files', base: '/api/files', auth: true, scope: 'tenant', description: 'Tenant file access (authorized/signed)' },
  { key: 'assets', base: '/api/assets', auth: true, scope: 'tenant', description: 'Asset inventory' },
  { key: 'pastoral', base: '/api/pastoral', auth: true, scope: 'tenant', description: 'Pastoral care (restricted)' },
  { key: 'staff', base: '/api/staff', auth: true, scope: 'tenant', description: 'Staff' },
  { key: 'payroll', base: '/api/payroll', auth: true, scope: 'tenant', description: 'Payroll' },
  { key: 'communications', base: '/api/communications', auth: true, scope: 'tenant', description: 'Messaging' },
  { key: 'audit', base: '/api/audit', auth: true, scope: 'tenant', description: 'Audit log' },
  { key: 'roles', base: '/api/roles', auth: true, scope: 'tenant', description: 'RBAC roles' },
  { key: 'users', base: '/api/users', auth: true, scope: 'tenant', description: 'User management' }
];

function mountApi(app) {
  // Phase 40 — Host → tenant resolution (never defaults unknown hosts)
  const { resolveDomainTenant } = require('../middleware/domainTenant');
  app.use('/api', resolveDomainTenant);

  app.use('/api/tenant', require('./tenantPublic'));
  app.use('/api/auth', require('./auth'));
  app.use('/api/superadmin', require('./superadmin'));
  app.use('/api/church', ...tenantGate, require('./church'));
  app.use('/api/dashboard', ...tenantGate, require('./dashboard'));
  app.use('/api/roles', require('./roles'));
  app.use('/api/users', ...tenantGate, require('./users'));
  app.use('/api/members', ...tenantGate, require('./members'));
  app.use('/api/households', ...tenantGate, require('./households'));
  app.use('/api/visitors', ...tenantGate, require('./visitors'));
  app.use('/api/attendance', ...tenantGate, require('./attendance'));
  app.use('/api/services', ...tenantGate, require('./services'));
  app.use('/api/collections', ...tenantGate, require('./collections'));
  app.use('/api/events', ...tenantGate, require('./events'));
  app.use('/api/groups', ...tenantGate, require('./groups'));
  app.use('/api/branches', ...tenantGate, require('./branches'));
  // Spec alias: /api/church/branches
  app.use('/api/church/branches', ...tenantGate, require('./branches'));
  app.use('/api/reports', ...tenantGate, require('./reports'));
  app.use('/api/analytics', ...tenantGate, require('./analytics'));
  app.use('/api/audit', ...tenantGate, require('./audit'));
  app.use('/api/messaging', ...tenantGate, require('./messaging'));
  app.use('/api/requests', ...tenantGate, require('./requests'));
  app.use('/api/departments', ...tenantGate, require('./departments'));
  app.use('/api/staff', ...tenantGate, require('./staff'));
  app.use('/api/sub-users', ...tenantGate, require('./subUsers'));
  app.use('/api/approvals', ...tenantGate, require('./approvals'));
  app.use('/api/workflows', ...tenantGate, require('./workflows'));
  app.use('/api/finance-reports', ...tenantGate, require('./financeReports'));
  app.use('/api/finance', ...tenantGate, require('./finance'));
  app.use('/api/pledges', ...tenantGate, require('./pledges'));
  app.use('/api/budgets', ...tenantGate, require('./budgets'));
  app.use('/api/pastoral', ...tenantGate, require('./pastoral'));
  app.use('/api/notifications', ...tenantGate, require('./notifications'));
  app.use('/api/payroll', ...tenantGate, require('./payroll'));
  app.use('/api/communications', ...tenantGate, require('./communications'));
  app.use('/api/outreach', ...tenantGate, require('./outreach'));
  app.use('/api/documents', ...tenantGate, require('./documents'));
  app.use('/api/files', require('./files'));
  app.use('/api/assets', ...tenantGate, require('./assets'));

  app.get(
    '/api',
    asyncHandler(async (_req, res) => {
      ok(res, {
        name: 'Church Management System API',
        version: '1.1.0',
        architecture: {
          auth: 'JWT Bearer (authMiddleware)',
          tenant: 'requireTenant — churchId from token only',
          permissions: 'requirePermission / RBAC',
          rateLimit: 'api + auth + write limiters',
          errors: 'ApiError + global errorHandler',
          transactions: 'withTransaction()',
          responses: '{ success, data|error, meta? }',
          tenantIsolation: 'attachTenantScope — churchId from JWT; client church_id scrubbed'
        },
        modules: API_MODULES
      });
    })
  );

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const payload = {
        status: 'ok',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        version: '1.1.0',
        environment: process.env.NODE_ENV || 'development'
      };
      res.json({
        success: true,
        data: payload,
        ...payload
      });
    })
  );

  /** Readiness — DB ping + deployment checklist summary (no secrets) */
  app.get(
    '/api/health/ready',
    asyncHandler(async (_req, res) => {
      const db = require('../database');
      const { buildDeploymentChecklist } = require('../utils/deployment');
      let dbOk = false;
      try {
        await db.getAsync('SELECT 1 as ok');
        dbOk = true;
      } catch (_) {
        dbOk = false;
      }
      const checklist = buildDeploymentChecklist();
      const ready = dbOk && checklist.ready;
      const body = {
        status: ready ? 'ready' : 'degraded',
        database: dbOk ? 'up' : 'down',
        environment: checklist.environment,
        summary: checklist.summary,
        checks: checklist.checks.map(c => ({
          id: c.id,
          ok: c.ok,
          severity: c.severity,
          message: c.message
        })),
        timestamp: new Date().toISOString()
      };
      res.status(ready ? 200 : 503).json({ success: ready, data: body, ...body });
    })
  );

  app.get(
    '/api/meta/architecture',
    asyncHandler(async (_req, res) => {
      ok(res, {
        layers: [
          'Helmet + CORS',
          'Rate limiting',
          'JSON body parsing',
          'Module routers',
          'authMiddleware',
          'requireTenant',
          'requirePermission / role checks',
          'Input validation (express-validator)',
          'Service/utils + withTransaction',
          'stripSensitive on responses',
          'Global errorHandler'
        ],
        modules: API_MODULES.map((m) => m.key)
      });
    })
  );
}

module.exports = {
  mountApi,
  API_MODULES,
  tenantGate
};
