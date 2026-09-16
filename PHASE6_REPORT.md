# Phase 6 Completed: Branch Management

## Implemented

- Campus fields on `branches`: headquarters flag, status, phone, pastor, description, logo, login enabled
- `user_branch_access` for multi-branch assignments
- Church Admin CRUD for campuses (`POST/PATCH /api/branches`, set HQ)
- Branch selector (top bar) + `POST /api/branches/select` switches JWT `activeBranchId`
- Tenant middleware applies active branch to `req.user.branchId` so operational APIs follow context
- `/branches` management UI; HQ registration marks first branch as headquarters
- Campus-only branches can be created without login (`is_login_enabled=0`)

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/005_branch_management.sql`](backend/migrations/005_branch_management.sql) |
| Ensure | [`backend/scripts/applyBranchManagement.js`](backend/scripts/applyBranchManagement.js) |
| Command | `cd backend && npm run migrate` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/branches` | Church campuses (admins see all; others see accessible) |
| `GET /api/branches/accessible` | Selector list |
| `POST /api/branches/select` | Switch context; returns new JWT |
| `POST /api/branches` | Create campus (optional login) |
| `PATCH /api/branches/:id` | Update campus fields/status |
| `POST /api/branches/:id/headquarters` | Designate HQ (clears others) |
| `POST /api/branches/:id/access` | Grant user access to branch |

## Frontend Changes

- Top-bar **branch selector** when user has 2+ accessible campuses
- [`BranchesManagement.js`](frontend/src/pages/BranchesManagement.js) at `/branches`
- AuthContext `selectBranch` refreshes token + active branch

## Security Checks

- Cross-church branch select returns **403**
- Active branch must be accessible and active
- Campus-only accounts cannot log in

## Tests

```bash
cd backend && npm run test:branches
```

**Result:** All checks passed.

## Known Issues

- Plan-based branch limits (subscription caps) deferred
- Branch logo upload UI not wired (column ready)
- Full “entire church / multi-branch” assignment UI for every user type is API-ready (`/access`) but limited UI

## Next Phase

**Phase 7 — Roles & Permissions (church-scoped)** per master spec (custom roles under each church).
