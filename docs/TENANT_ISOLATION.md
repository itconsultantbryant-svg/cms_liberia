# Tenant Isolation

Every church is an independent tenant. Cross-tenant reads or writes must fail closed.

## Hierarchy reminder

Platform → **Church** → Branch → User

## Sources of truth for `churchId`

| Source | Trusted? |
|--------|----------|
| JWT claim / DB reload of the authenticated account | Yes |
| `req.hostChurchId` from verified Host resolution (for gates / branding) | Yes (for host matching) |
| Client body/query `church_id` / `churchId` | **No** — scrubbed |

`scrubClientTenantOverrides` removes client tenant overrides. Writes use `churchIdForWrite` / `req.churchId` from `attachTenantScope` (`backend/utils/tenantScope.js`, `backend/middleware/tenant.js`).

## Middleware chain (tenant APIs)

1. `resolveDomainTenant` — parse Host / `X-Forwarded-Host`
2. `authMiddleware` — valid JWT + token version
3. `requireTenant` — resolve church from user; block suspended/archived tenants
4. `attachTenantScope` — helpers for scoped queries and writes
5. Route handlers — `WHERE church_id = ?` / `assertResourceChurch`

Superadmin routes intentionally operate across churches and are gated by `requireSuperadmin`.

## Host resolution

**Code:** `backend/utils/domains.js`, `backend/middleware/domainTenant.js`

| Host type | Behavior |
|-----------|----------|
| Platform root (`PLATFORM_ROOT_HOSTS` / localhost) | No forced tenant |
| `{slug}.{PLATFORM_DOMAIN}` | Resolve church by slug |
| Custom domain in `church_domains` (**verified**) | Resolve that church |
| Unknown | Unresolved — public resolve returns **404**, never another church |

Public branding: `GET /api/tenant/resolve`.

Login on a verified tenant host rejects users belonging to a different church.

## Data & files

- Rows carry `church_id`; list/detail/update/delete assert ownership
- Private files under `uploads/churches/{churchId}/…` are only served via `/api/files` with auth + ownership checks
- Static `/uploads` refuses paths containing `/churches/`

## Support access

Time-boxed support sessions (`support_sessions`) allow platform operators to assist a church under audit. Ending the session removes elevated access. See [SUPERADMIN_MANUAL.md](SUPERADMIN_MANUAL.md).

## Verification

Cross-tenant tests (e.g. `npm run test:validate`, isolation scripts) confirm Church A credentials cannot read/update/delete Church B resources.
