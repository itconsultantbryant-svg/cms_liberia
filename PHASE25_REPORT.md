# Phase 25 Completed: Audit Logging

## Implemented

- Immutable `audit_logs` table (no update/delete for church admins)
- Captures user, church, branch, action, resource, IDs, previous/new values, IP, user agent, timestamp
- Write helper used across auth, members, finance, workflows, roles, users, church, branches, staff
- Read APIs with filters; explicit 403 on DELETE/PUT/PATCH
- Permission `audit.view` (AUDITOR + church-wide defaults via RBAC seed)
- Audit Log UI at `/audit`

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/023_audit_logging.sql`](backend/migrations/023_audit_logging.sql) |
| Ensure | [`backend/scripts/applyAuditLogging.js`](backend/scripts/applyAuditLogging.js) |
| Helpers | [`backend/utils/audit.js`](backend/utils/audit.js) |
| Permission | `audit.view` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/audit` | Tenant-scoped history (`action`, `resource`, `userId`, `from`, `to`, `q`) |
| `GET /api/audit/meta` | Action catalog + immutability flag |
| `GET /api/audit/:id` | Single record |
| `DELETE/PUT/PATCH /api/audit*` | **403** — immutable |

## Tracked actions (hooks)

- Auth: login, login_failed, logout, church register
- Members: create, update, delete
- Finance: create, post, reverse
- Workflows: submit, approve, reject
- Roles: create custom, permission change, assign
- Users: activate, suspend
- Church branding, branch create/update
- Staff: activate, suspend

## Frontend

- [`AuditLogs.js`](frontend/src/pages/AuditLogs.js)
- Sidebar under Administration

## Tests

```bash
cd backend && npm run test:audit
```

**Result:** All checks passed.

## Known Issues

- Not every mutating endpoint is hooked (coverage focused on high-risk domains)
- No retention / export job yet
- Superadmin cross-tenant audit viewer not included

## Next Phase

**Phase 26 — Subscriptions & SaaS Management**

Superadmin plans (Trial → Enterprise), feature limits, church subscription statuses; do not delete church data on expiry.
