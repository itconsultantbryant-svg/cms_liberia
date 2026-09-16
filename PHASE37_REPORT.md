# Phase 37 Completed: Testing

## Implemented

Formal test suites covering the master-spec categories:

| Suite | Script | Coverage |
|-------|--------|----------|
| Unit | `testUnit.js` | Pagination, cache, finance normalization, analytics age/CSV, RBAC sensitivity, password/XSS, tenant scrub, image constraints |
| Authorization | `testAuthorization.js` | Unauth blocks; limited staff denied pastoral/delete/admins/settings/finance; church admin denied Superadmin; settings spoof isolation |
| Multi-tenant matrix | `testMultiTenantMatrix.js` | Superadmin + Church A/B admins + Branch A/B users; read/update/delete/file/report isolation |
| End-to-end | `testE2EWorkflow.js` | Register → campus → member → event → visitor → finance → dashboard/reports → delete |
| Regression | via runner | tenant, auth, rbac, security, files, perf |

## Personas exercised

- Superadmin  
- Church A Admin / Church B Admin  
- Branch A User / Branch B User  

Church A cannot read, update, or delete Church B members; cannot download Church B files; cannot discover B via list/report spoofing; cannot call Superadmin routes.

## Commands

```bash
# Core Phase 37 only
cd backend && npm test

# Full Phase 37 + curated regressions
cd backend && npm run test:phase37

# Individual
npm run test:unit
npm run test:authz
npm run test:tenant-matrix
npm run test:e2e
```

For dense local runs, start the API with elevated auth limits:

```bash
AUTH_RATE_LIMIT=500 API_RATE_LIMIT=2000 WRITE_RATE_LIMIT=1000 node server.js
```

## Result

**`npm run test:phase37` — all 10 suites passed** (~18s).

## Key Files

- [`backend/scripts/testHelpers.js`](backend/scripts/testHelpers.js)
- [`backend/scripts/testUnit.js`](backend/scripts/testUnit.js)
- [`backend/scripts/testAuthorization.js`](backend/scripts/testAuthorization.js)
- [`backend/scripts/testMultiTenantMatrix.js`](backend/scripts/testMultiTenantMatrix.js)
- [`backend/scripts/testE2EWorkflow.js`](backend/scripts/testE2EWorkflow.js)
- [`backend/scripts/runPhase37Tests.js`](backend/scripts/runPhase37Tests.js)

## Known Issues

- Auth rate limits (default 20/15min) can trip dense suites — raise `AUTH_RATE_LIMIT` for CI/local batch runs
- Branch-scoped staff may 404 on HQ-created members (expected branch isolation); church admin still owns the record
- Module-level phase scripts remain available individually (`test:members`, `test:finance`, …)

## Next Phase

**Phase 38 — Seed Data**
