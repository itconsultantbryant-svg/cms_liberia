# Phase 2 Completed: Authentication & Security

## Implemented

- Password **change**, **forgot**, and **reset** flows for branch and sub_user accounts
- Login **lockout** after 5 failed attempts (15 minutes)
- **Rate limiting** on register/login/forgot/reset (20 requests / 15 min per IP)
- JWT **token_version** invalidation on logout, password change, and reset
- Auth middleware re-checks account existence, sub-user active flag, and token version
- **helmet** security headers; **CORS** via `CORS_ORIGIN` (localhost defaults in development)
- Production fail-fast if `JWT_SECRET` is missing or still the placeholder
- MFA **readiness**: `mfa_enabled` / `mfa_secret` columns; `/me` and login expose `mfaEnabled`
- Min password length **8** on register / change / reset

## Database Changes

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/003_auth_security.sql`](backend/migrations/003_auth_security.sql) |
| Ensure script | [`backend/scripts/applyAuthSecurity.js`](backend/scripts/applyAuthSecurity.js) |
| Command | `cd backend && npm run migrate` |
| Columns | `failed_login_attempts`, `locked_until`, `token_version`, `password_changed_at`, `mfa_enabled`, `mfa_secret` on `branches` and `sub_users` |
| Table | `password_reset_tokens` (hashed tokens, 1h TTL) |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `POST /api/auth/register` | Password policy (≥8); rate-limited |
| `POST /api/auth/login` | Lockout + rate limit; JWT includes `tokenVersion`; returns `mfaEnabled` |
| `GET /api/auth/me` | Returns `mfaEnabled` |
| `POST /api/auth/change-password` | Verifies current password; bumps version; returns new token |
| `POST /api/auth/forgot-password` | Always generic 200; debug `resetToken` when `AUTH_DEBUG_RESET=1` or non-production |
| `POST /api/auth/reset-password` | Consumes token; sets password; bumps version |
| `POST /api/auth/logout` | Bumps `token_version` (invalidates outstanding JWTs) |

Helpers: [`backend/utils/authSecurity.js`](backend/utils/authSecurity.js)

## Frontend Changes

- [`ForgotPassword.js`](frontend/src/pages/ForgotPassword.js), [`ResetPassword.js`](frontend/src/pages/ResetPassword.js), [`ChangePassword.js`](frontend/src/pages/ChangePassword.js)
- Login link to forgot password; profile menu → Change password
- [`AuthContext.js`](frontend/src/context/AuthContext.js): `changePassword`, API `logout`, refresh token after change

## Security Checks

- Tenant foundation from Phase 1 unchanged; auth routes remain outside `requireTenant` except authenticated change/logout
- Reset tokens stored as SHA-256 hashes only
- Old JWTs rejected after password change or logout

## Tests

```bash
cd backend && npm run test:auth
```

**Result:** All checks passed (policy, lockout, reset, change-password invalidation, logout revoke, MFA readiness flags).

## Known Issues

- No SMTP yet — production forgot-password needs an email provider (token currently debug-only outside production)
- Bearer JWT still in localStorage (cookie sessions deferred)
- Full MFA enroll/verify UI deferred
- Rate limit is per IP (shared NAT may throttle legitimate users)

## Next Phase

**Phase 3 — Superadmin Portal**

Platform-level church management (list/suspend tenants, view status), building on `requireSuperadmin` stub and `/superadmin` placeholder.
