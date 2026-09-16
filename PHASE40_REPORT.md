# Phase 40 Completed: Custom Domains & Subdomains

## Implemented

Single-app tenant resolution from the request **Host** (and `X-Forwarded-Host`):

| Mode | Example | Behavior |
|------|---------|----------|
| Platform hub | `app.example.com` / `localhost` | No forced tenant (multi-church login) |
| Platform subdomain | `grace.cms.example.com` | Resolves `churches.slug = grace` |
| Custom domain | `portal.church.org` | Resolves via `church_domains` (must be **verified**) |
| Unknown | anything else | **Unresolved** — never defaults to another church |

### `church_domains` mapping

- `church_id`, `domain`, `verification_status`, `ssl_status`, `is_primary`, `created_at`
- Plus `verification_token`, `verified_at`, `notes`

### APIs

- `GET /api/tenant/resolve` — public branding/context for Host
- Church admin: `GET/POST/DELETE /api/tenant/domains`, verify + set primary
- Superadmin: `/api/superadmin/churches/:id/domains…`
- Login on a resolved tenant host rejects other churches (`TENANT_HOST_MISMATCH`)

### Frontend

Login loads `/api/tenant/resolve` and shows that church’s name/logo/colors when on a tenant host.

## Config

```bash
PLATFORM_DOMAIN=cms.example.com
PLATFORM_ROOT_HOSTS=app.example.com,www.example.com
VERIFY_DOMAINS_SKIP_DNS=1   # dev convenience
```

## Tests

```bash
cd backend && PLATFORM_DOMAIN=cms.test npm run test:domains
```

**Result:** All checks passed (unknown host safety, subdomain + custom domain, cross-tenant login blocked).

## Key Files

- [`backend/migrations/031_church_domains.sql`](backend/migrations/031_church_domains.sql)
- [`backend/utils/domains.js`](backend/utils/domains.js)
- [`backend/middleware/domainTenant.js`](backend/middleware/domainTenant.js)
- [`backend/routes/tenantPublic.js`](backend/routes/tenantPublic.js)
- [`backend/routes/superadmin.js`](backend/routes/superadmin.js) — domain admin
- [`backend/routes/auth.js`](backend/routes/auth.js) — host login gate
- [`frontend/src/pages/Login.js`](frontend/src/pages/Login.js)

## Known Issues

- Production DNS TXT verification is token-based / Superadmin override; wire a real DNS lookup provider when ready
- SSL for custom domains is still terminated at the edge (Render/Cloudflare); `ssl_status` is tracking metadata
- Wildcard DNS for `*.PLATFORM_DOMAIN` must be configured on the host

## Next Phase

**Phase 41 — Final System Validation**
