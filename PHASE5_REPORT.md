# Phase 5 Completed: Church Administration

## Implemented

- Superadmin can create a church **with its first Church Administrator** (email/password)
- Superadmin can add more admins to any church (`POST /api/superadmin/churches/:id/admins`)
- Church Admins can manage co-admins within their own tenant (`/api/church/admins`)
- Multiple `isadmin=1` branch accounts per church supported; cannot revoke the last admin
- Church Admin Dashboard (`ChurchAdminOverview`) with Phase 5 widgets, **scoped by `church_id` only**
- Sidebar: **Church Admins** under Administration

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `POST /api/superadmin/churches` | Optional `adminEmail`, `adminPassword`, `adminName` creates first admin |
| `GET /api/superadmin/churches/:id/admins` | List church admins |
| `POST /api/superadmin/churches/:id/admins` | Add admin to church |
| `PATCH /api/superadmin/churches/:id/admins/:branchId` | Promote/revoke admin |
| `GET /api/church/admins` | List own church admins |
| `POST /api/church/admins` | Add co-admin (own church only) |
| `PATCH /api/church/admins/:branchId` | Revoke/promote within own church |
| `GET /api/dashboard/admin-overview` | Church-scoped admin dashboard payload |

Helpers: [`backend/utils/churchAdmins.js`](backend/utils/churchAdmins.js)

## Frontend Changes

- [`ChurchAdminOverview.js`](frontend/src/pages/ChurchAdminOverview.js) — members, visitors, branches, attendance, donations, expenses, events, ministries, staff, pending approvals, financial summary, recent activity
- [`ChurchAdmins.js`](frontend/src/pages/ChurchAdmins.js) — `/settings/admins`
- [`RoleBasedDashboard.js`](frontend/src/components/RoleBasedDashboard.js) — routes church admins to overview
- Superadmin create/detail forms include first/additional admin fields

## Security Checks

- Admin overview and church admin APIs use tenant gate (`req.churchId`)
- Cross-church admin overview returns only the caller’s church
- Last-admin revoke blocked

## Tests

```bash
cd backend && npm run test:church-admin
```

**Result:** All checks passed.

## Known Issues

- No dedicated `visitors` / `expenses` tables — visitors approximated via member position; expenses via approved request amounts
- Ministries mapped to existing `groups`
- Deeper invite-by-email (SMTP) still deferred

## Next Phase

**Phase 6 — Branch Management**

Unlimited/plan-limited campuses, HQ designation, branch selector, and operational context switching.
