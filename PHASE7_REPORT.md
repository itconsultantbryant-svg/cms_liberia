# Phase 7 Completed: Role-Based Access Control

## Implemented

- Granular permission catalog (`members.view`, `finance.approve`, `roles.manage`, etc.)
- Role scopes: **platform**, **church**, **branch** (plus existing mission templates)
- System role → permission seeding (President, Finance Officer, Branch Pastor, Superadmin, …)
- Church **custom roles** with editable permission sets
- Server-side `requirePermission(...)` middleware (used on member delete; ready for wider adoption)
- `/me` and `/roles/me` expose effective `permissionKeys` / `permissions`
- Role Management UI: scopes, permission checkboxes, create custom roles

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/006_rbac_permissions.sql`](backend/migrations/006_rbac_permissions.sql) |
| Seed | [`backend/scripts/applyRbac.js`](backend/scripts/applyRbac.js) |
| Tables | `permissions`, `role_permissions`; `roles.scope`, `church_id`, `is_system`, `is_custom` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/roles/permissions` | Permission catalog |
| `GET /api/roles` | Templates + church custom roles (with permission keys) |
| `POST /api/roles/custom` | Create custom role (`roles.manage`) |
| `PUT /api/roles/:id/permissions` | Update custom role perms |
| `DELETE /api/roles/custom/:id` | Delete custom role |
| `GET /api/roles/me` | Roles + effective permissions |
| `POST /api/roles/assign` | Assign role (permission-gated) |

Helpers: [`backend/utils/rbac.js`](backend/utils/rbac.js)

## Frontend

- [`RoleManagement.js`](frontend/src/pages/RoleManagement.js) rebuilt for scopes + custom roles

## Security Checks

- Permission checks are server-side (not role-name only)
- Non-admin cannot create custom roles (**403**)
- System role permission maps are read-only

## Tests

```bash
cd backend && npm run test:rbac
```

**Result:** All checks passed.

## Known Issues

- Not every route is migrated to `requirePermission` yet (members delete is the reference); continue wiring in later hardening
- Legacy sidebar permission keys still mapped via compatibility layer
- Platform roles are templates; Superadmin still uses `is_platform_admin` flag primarily

## Next Phase

**Phase 8 — Approval Workflow Engine**

Configurable approvals for expenses, member deletion, role changes, and other sensitive actions.
