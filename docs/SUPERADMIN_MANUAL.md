# Superadmin Manual

Platform operators manage the SaaS layer: churches, subscriptions, administrators, permissions/security posture, and support access.

**UI:** `/superadmin` (`frontend/src/pages/SuperadminPortal.js`)  
**API:** `/api/superadmin/*` (requires `branches.is_platform_admin`)

Promote an account:

```bash
cd backend && npm run create-platform-admin -- you@example.com
```

## Creating churches

1. Open **Superadmin → Churches**.
2. Create a church (name, slug, contact, initial status).
3. Optionally set branding fields and status (`active` / `suspended` / `archived`).
4. Suspended/archived churches cannot operate normal tenant APIs.

API: `POST /api/superadmin/churches`, `PATCH /api/superadmin/churches/:id`, `PATCH .../status`.

## Currencies

USD and LRD are **system currencies** and are always available to every church.

1. Open **Superadmin → Currencies**.
2. Add additional codes (e.g. EUR) to the platform catalog.
3. Church admins can then enable those codes (or add their own) under **Church Settings**.

API: `GET/POST /api/superadmin/currencies`, `PATCH/DELETE /api/superadmin/currencies/:code` (USD/LRD cannot be removed).

## Managing subscriptions

1. Maintain **plans** (catalog): create/update plan definitions.
2. Assign or update a church’s subscription and status.

API: `/api/superadmin/plans`, `/api/superadmin/churches/:id/subscription`.

Use subscriptions to track plan entitlements; enforce product rules in application logic as configured.

## Creating administrators

1. Open the church detail.
2. **Admins** — create or update church-admin branch accounts for that tenant.
3. Church admins log in via the normal login page (or tenant Host) and manage their church only.

API: `GET/POST /api/superadmin/churches/:id/admins`, `PATCH .../admins/:branchId`.

## Managing permissions

- Platform operators do **not** edit another church’s day-to-day RBAC as a substitute for church admins.
- Church-level roles/permissions are managed inside the tenant (`/roles`, `/users`) by church admins.
- Superadmin security overview: `GET /api/superadmin/security/status`.
- Ensure platform accounts remain few; use strong `JWT_SECRET` and production CORS.

## Support access

Time-boxed assistance into a tenant:

1. Start support access for a church (creates a session).
2. Perform needed diagnostics under audit.
3. **End** the session when finished.

API: `POST /api/superadmin/churches/:id/support-access`, `POST /api/superadmin/support-access/end`, list active sessions.

Never leave support sessions open unattended.

## Domains

Map custom domains or verify subdomain onboarding for a church:

- `GET/POST /api/superadmin/churches/:id/domains`
- Verify / set primary / delete as needed
- Configure `PLATFORM_DOMAIN` and DNS at the edge (see DEPLOYMENT.md)

## Backups

- Policy: `GET /api/superadmin/backups/policy`
- Create / list / verify: `POST/GET /api/superadmin/backups`, `POST .../:id/verify`
- CLI: `cd backend && npm run backup`

Store `DATABASE_PATH`, `UPLOADS_PATH`, and `BACKUP_PATH` on persistent disks in production.

## Platform stats

`GET /api/superadmin/stats` — high-level counts for churches and activity.
