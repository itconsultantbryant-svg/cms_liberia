# Phase 3 Completed: Superadmin Portal

## Implemented

- Platform flag `branches.is_platform_admin` for Superadmin accounts
- `requireSuperadmin` middleware validates against DB (branch accounts only)
- Superadmin API: platform stats, list/search churches, detail, create, update profile, set status (`active`|`suspended`|`archived`)
- Frontend Superadmin portal at `/superadmin` (replaces placeholder)
- Profile menu link when `user.isSuperadmin`
- Promote script: `npm run create-platform-admin -- <email>`
- Login/`/me` expose `isSuperadmin`

## Database Changes

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/004_platform_superadmin.sql`](backend/migrations/004_platform_superadmin.sql) |
| Ensure | [`backend/scripts/applyPlatformSuperadmin.js`](backend/scripts/applyPlatformSuperadmin.js) |
| Command | `cd backend && npm run migrate` |
| Column | `branches.is_platform_admin` |

Optional promote on migrate: set `PLATFORM_ADMIN_EMAIL` env.

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/superadmin` | Portal meta (auth + superadmin) |
| `GET /api/superadmin/stats` | Platform counts |
| `GET /api/superadmin/churches` | List/filter (`status`, `q`) with branch/member counts |
| `GET /api/superadmin/churches/:id` | Detail + branches |
| `POST /api/superadmin/churches` | Create tenant shell |
| `PATCH /api/superadmin/churches/:id` | Update profile fields |
| `PATCH /api/superadmin/churches/:id/status` | Set active/suspended/archived |

Routes sit **outside** `requireTenant` so suspended churches remain manageable.

## Frontend Changes

- [`SuperadminPortal.js`](frontend/src/pages/SuperadminPortal.js) + CSS
- App route `/superadmin`; Layout profile → Superadmin portal
- Non-superadmins redirected to `/`

## Security Checks

- Non-platform users get **403** on all superadmin routes
- Suspended churches cannot log in (existing Phase 1/2 gate)
- Superadmin flag re-checked from DB on each request (not JWT-only)

## Tests

```bash
cd backend && npm run test:superadmin
```

**Result:** All checks passed (deny normal user, list/create/status, suspended login blocked).

## Bootstrap

```bash
cd backend && npm run create-platform-admin -- admin@church.com
```

Then log out and log back in. Locally, `admin@church.com` was promoted during Phase 3 setup.

## Known Issues

- No billing/subscriptions UI yet
- Creating a church from Superadmin does not auto-create an HQ login (registration still creates church + HQ)
- Branding theme provider still Phase 4
- Sub-users cannot be platform admins

## Next Phase

**Phase 4 — Church Branding / Theming**

Apply `churches` branding columns (logo, colors) in the church portal UI.
