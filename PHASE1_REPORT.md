# Phase 1 Completed: Multi-Tenant Architecture & Project Foundation

## Implemented

- Added `churches` tenant table with branding-ready columns (logo, colors, website, status).
- Stamped `church_id` on branches and major operational tables; backfilled existing data under slug `default`.
- Registration creates a **new church + HQ branch** with PRESIDENT role (isolated tenant).
- JWT and `/api/auth/me` include `churchId` and `church` summary (never trust client-supplied tenant IDs).
- `requireTenant` middleware applied to all tenant APIs via [`backend/server.js`](backend/server.js).
- Hardened users, branches, members, staff, payroll, and dashboard admin stats to filter by `church_id`.
- Frontend Register collects church name/slug; profile shows church name; `/superadmin` placeholder for Phase 3.

## Database Changes

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/002_multi_tenant_churches.sql`](backend/migrations/002_multi_tenant_churches.sql) |
| Backfill | [`backend/scripts/applyMultiTenant.js`](backend/scripts/applyMultiTenant.js) |
| Command | `cd backend && npm run migrate` |
| Columns | `branches.church_id`; `church_id` on members, collections, attendances, events, groups, staff, sub_users, payroll_runs, requests, etc. |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `POST /api/auth/register` | Creates church + HQ branch; returns `churchId`, `churchSlug` |
| `POST /api/auth/login` | Token includes `churchId`; user includes `church` |
| `GET /api/auth/me` | Returns `churchId` + `church` |
| `GET /api/users`, `/branches`, `/members`, `/staff`, `/payroll` | Scoped to `req.churchId` |
| `GET /api/superadmin` | 501 placeholder (Phase 3) |
| Tenant gate | All `/api/*` except auth, health, roles templates |

## Frontend Changes

- [`Register.js`](frontend/src/pages/Register.js) — church name + slug fields
- [`SuperadminPlaceholder.js`](frontend/src/pages/SuperadminPlaceholder.js) + route `/superadmin`
- [`Layout.js`](frontend/src/components/Layout.js) — shows church name in profile menu
- AuthContext already persists `user.churchId` / `user.church` from API

## Security Checks

- Tenant ID taken only from JWT / server-side DB lookup (`requireTenant`).
- Cross-tenant ID access returns 404/403 for users/branches/members patterns tested.
- Suspended/archived churches rejected at login and tenant gate.

## Tests

```bash
cd backend && npm run test:tenant
```

**Result:** All checks passed (Church A vs B registration, login, users/branches/members isolation, cross-ID fetch blocked).

## Known Issues

- Roles/departments remain **global templates** (church-scoped custom roles → Phase 7).
- Not every insert path yet stamps `church_id` (e.g. some attendance/collections writes still rely primarily on `branch_id`; list paths are gated by tenant middleware + branch). Prefer stamping `church_id` on remaining writes in Phase 2 hardening.
- Sub-user JWT may need re-login after deploy to pick up `churchId` in token (middleware falls back to DB).
- Custom domains / `/church/:slug` portals deferred to Phase 40.
- No Superadmin UI yet (Phase 3).

## Next Phase

**Phase 2 — Authentication & Security**

Password reset, change password, rate limiting, account lockout, session hardening, MFA readiness, and stronger auth middleware on top of this tenant foundation.
