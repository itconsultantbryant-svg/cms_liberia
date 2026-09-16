# Phase 32 Completed: Database Tenant Isolation

## Implemented

**Non-negotiable rule:** authenticated church context is applied automatically; client-supplied `church_id` is never trusted.

| Control | Detail |
|---------|--------|
| Scrub overrides | Body / query / `X-Church-Id` stripped in `requireTenant` + `attachTenantScope` |
| Tenant gate | All tenant modules: `auth → requireTenant → attachTenantScope` |
| `req.tenant` | `{ churchId, activeBranchId, authorizedBranchIds, churchIdForWrite }` |
| Query helpers | `getInChurch`, `deleteInChurch`, `churchFilter`, `branchInFilter`, `assertSameChurch` |
| Superadmin | Separate `/api/superadmin` auth — church tokens cannot call platform routes |

Branch restrictions: when applicable, `church_id = authenticated_church` and `branch_id IN authorized_branches` (via accessible-branch resolution).

## Key Files

- [`backend/utils/tenantScope.js`](backend/utils/tenantScope.js)
- [`backend/middleware/tenant.js`](backend/middleware/tenant.js) — early scrub
- [`backend/routes/index.js`](backend/routes/index.js) — `tenantGate` includes `attachTenantScope`
- Members scoped fetch hardened for church-admin vs branch users

## Cross-tenant attack tests

```bash
cd backend && npm run test:tenant
```

Attempts covered:

- List leakage (users, branches, members)
- IDOR get/update member & user across churches
- Spoofed `church_id` on create (ignored; row stays in caller church)
- Settings patch with foreign `church_id` (applies only to caller)
- Event IDOR
- Church admin blocked from Superadmin routes

**Result:** All checks passed.

## Known Issues

- Incremental adoption of `getInChurch` across every legacy raw SQL path continues; gate + scrub already block the common override vector
- Rate-limit `xForwardedFor` validation disabled for local/proxy noise (production should set `trust proxy` intentionally)

## Next Phase

**Phase 33 — File Storage**
