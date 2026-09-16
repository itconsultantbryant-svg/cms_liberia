# Phase 31 Completed: API Architecture

## Implemented

Clean modular API/service architecture with shared cross-cutting concerns:

| Concern | Implementation |
|---------|----------------|
| **Module organization** | Central registry [`routes/index.js`](backend/routes/index.js) |
| **Auth** | `authMiddleware` (JWT) |
| **Tenant** | `requireTenant` — `churchId` from token only |
| **Permissions** | `requirePermission` / RBAC |
| **Rate limiting** | Global API + write limiters; stricter auth limiter |
| **Validation** | `express-validator` helpers [`middleware/validate.js`](backend/middleware/validate.js) |
| **Errors** | `ApiError` + global `errorHandler` |
| **Transactions** | `withTransaction()` (used e.g. custom role create) |
| **Sensitive fields** | `stripSensitive()` strips password hashes, tokens, etc. |
| **Consistent responses** | `{ success, data\|error, meta? }` on catalog/meta/health |

Module examples (as required): `/api/auth`, `/api/superadmin`, `/api/church`, `/api/church/branches` (alias), `/api/members`, `/api/attendance`, `/api/finance`, `/api/events`, `/api/reports`.

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api` | Module catalog + architecture summary |
| `GET /api/health` | Health (legacy + envelope) |
| `GET /api/meta/architecture` | Layer documentation |
| `GET /api/church/branches` | Spec alias of `/api/branches` |

## Tests

```bash
cd backend && npm run test:api-arch
```

**Result:** All checks passed.

## Known Issues

- Most legacy routes still return their historical JSON shapes; new helpers are the standard going forward
- Full migration of every route to the envelope is incremental

## Next Phase

**Phase 32 — Database Tenant Isolation**
