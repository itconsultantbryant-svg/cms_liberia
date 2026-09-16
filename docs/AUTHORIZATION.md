# Authorization

Authorization is enforced **on the server**. The frontend hides navigation and routes for UX only — never as the sole control.

**Primary code:** `backend/utils/rbac.js`, `backend/middleware/auth.js` (`requirePermission`), `frontend/src/config/permissions.js`, `frontend/src/components/PrivateRoute.js`

## Model

1. **Permissions** — canonical dotted keys in `permissions` (e.g. `members.view`)
2. **Roles** — system roles (PRESIDENT, FINANCE_OFFICER, …) plus custom church roles
3. **Assignments** — `user_roles` + `role_permissions`
4. **Shortcuts**
   - Platform superadmin (`is_platform_admin`): all permissions
   - Church admin (`isadmin`) / PRESIDENT: broad church access; **sensitive** keys (`pastoral.*`, `platform.*`) are not auto-granted

## Canonical permission keys (examples)

```
members.view | members.create | members.update | members.delete | members.export
finance.view | finance.create | finance.approve
expenses.create | expenses.approve
branches.manage | users.manage | roles.manage
attendance.manage | collections.manage | events.manage | groups.manage
staff.manage | payroll.manage
reports.view | reports.export | settings.manage | communications.manage
documents.view | documents.manage | assets.view | assets.manage | audit.view
pastoral.view | pastoral.manage
platform.churches.manage | platform.users.manage
```

## Frontend legacy keys

Sidebar / older UI still uses keys such as `view_members`, `manage_finance`, `pastoral_care`. The backend maps legacy keys into the dotted set when resolving `getUserPermissions`.

## Middleware pattern

```js
router.get('/', authMiddleware, requireTenant, requirePermission('members.view'), handler);
```

Multiple keys may be accepted (OR) depending on route definition. Superadmin routes use `requireSuperadmin` instead of church permissions.

## UI gates

- **Sidebar:** `canShowSidebarItem(item, user)` filters `SIDEBAR_SECTIONS`
- **Routes:** `PrivateRoute` with `permission` and/or `requiredRoles` shows **Access denied** when missing
- Always assume a crafted API call can bypass the UI — server checks are mandatory

## Role management (church)

Church admins manage roles at `/roles` (`UserManagement` / `RoleManagement` pages) via `/api/roles` APIs: list permissions, assign role permissions, create custom roles scoped to the church.

## System roles (illustrative)

PRESIDENT, MISSION_SECRETARY, FINANCE_OFFICER, RESIDENT_PASTOR (+ HQ), SENIOR/ASSOCIATE_PASTOR, SECRETARY, MEMBERSHIP_OFFICER, AUDITOR, BRANCH_*, ATTENDANCE_OFFICER, plus platform roles (SUPERADMIN / PLATFORM_ADMIN / SUPPORT_OFFICER). Exact seed set is applied by `backend/scripts/applyRbac.js`.
