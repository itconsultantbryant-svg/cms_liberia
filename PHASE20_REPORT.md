# Phase 20 Completed: Staff & User Management

## Implemented

- Church Admin user directory (branch logins + sub-users)
- User fields: name, email, phone, job title, branch, department, role, status, photo
- **Invite** users (branch or sub-user) with temp password + invite token
- **Activate** / **Suspend** (blocks login via `is_login_enabled` / `is_active`)
- **Reset access** (new temp password + token version bump)
- Assign role & permissions
- Staff profiles: job title, status, branch, activate/suspend
- Superadmin platform authority unchanged

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/019_staff_users.sql`](backend/migrations/019_staff_users.sql) |
| Ensure | [`backend/scripts/applyStaffUsers.js`](backend/scripts/applyStaffUsers.js) |
| Columns | `staff`/`sub_users`/`branches`: photo, job_title, status, phone |
| Table | `user_invites` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/users/meta` | Statuses, branches, roles |
| `GET /api/users/directory` | Unified user list |
| `POST /api/users/invite` | Invite branch or sub-user |
| `POST /api/users/:id/activate` | Enable login |
| `POST /api/users/:id/suspend` | Disable login + invalidate sessions |
| `POST /api/users/:id/reset-access` | Issue new temp password |
| `PATCH /api/users/:id/profile` | Update profile fields |
| `PATCH /api/users/:id/permissions` | Change permissions |
| `PATCH /api/users/:id/branch` | Assign sub-user branch |
| `POST /api/users/:id/photo` | Upload profile photo |
| `POST /api/staff/:id/activate\|suspend` | Staff status |

## Frontend

- [`UserManagement.js`](frontend/src/pages/UserManagement.js) — invite, activate, suspend, reset, directory
- [`StaffManagement.js`](frontend/src/pages/StaffManagement.js) — admin can manage

## Tests

```bash
cd backend && npm run test:staff-users
```

**Result:** All checks passed.

## Known Issues

- Invite email delivery is token/password return only (send via Phase 24 channels)
- Branch accounts cannot be “reassigned” to another campus (they *are* the campus identity)
- Photo upload UI not yet on the user table (API ready)

## Next Phase

**Phase 21 — Document Management**

Church document library with categories, permissions, and versioning.
