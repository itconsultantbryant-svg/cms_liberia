# Authentication

## Goals

- Secure login for branch accounts and sub-users
- Church registration that creates an isolated tenant
- Session invalidation via token versioning
- Password reset without account enumeration
- Lockout after repeated failures
- Optional Host-based tenant gate on login

**Primary code:** `backend/routes/auth.js`, `backend/utils/authSecurity.js`, `backend/middleware/auth.js`

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Create church + HQ branch (church admin) |
| POST | `/api/auth/login` | Authenticate; return JWT |
| GET | `/api/auth/me` | Current user, roles, permissions, church |
| POST | `/api/auth/change-password` | Change password; bump token version; new JWT |
| POST | `/api/auth/forgot-password` | Request reset (generic response) |
| POST | `/api/auth/reset-password` | Consume reset token; set password |
| POST | `/api/auth/logout` | Bump `token_version` (invalidate JWTs) |

Auth routes are rate-limited (`AUTH_RATE_LIMIT`).

## JWT flow

1. Login verifies password (bcrypt) for `sub_users` then `branches`.
2. Server signs a JWT (`expiresIn: '7d'`) with payload including:
   - `id`, `email`, `userType` (`branch` | `sub_user`)
   - `churchId` (from DB — never from the client)
   - `tokenVersion`
   - admin / support flags as applicable
3. Client stores the token and sends `Authorization: Bearer <token>`.
4. `authMiddleware` verifies the signature, reloads the account, and **rejects** the request if DB `token_version` ≠ claim.
5. Password change, reset, and logout bump `token_version`, ending other sessions.

Secret: `JWT_SECRET` (required strong value in staging/production).

## Lockout

After **5** failed logins, the account is locked for **15 minutes** (`locked_until`). Successful login clears failure counters.

## Password reset

1. `forgot-password` always returns a generic success message.
2. Token is stored as a **SHA-256 hash** in `password_reset_tokens` (short TTL, e.g. 1 hour).
3. Email delivery uses SMTP when configured (`SMTP_*`, `APP_URL` for links).
4. Non-production may expose a debug token when `AUTH_DEBUG_RESET=1` — **never enable in production**.

## Host / tenant gate

When the request Host resolves to a verified tenant (`church_domains` or `{slug}.{PLATFORM_DOMAIN}`), login for a user of a **different** church is rejected (`TENANT_HOST_MISMATCH`). Unknown hosts do not silently map to another church. See [TENANT_ISOLATION.md](TENANT_ISOLATION.md).

## Frontend

- `frontend/src/context/AuthContext.js` — token storage, `/api/auth/me`, logout
- Login may call `GET /api/tenant/resolve` to show tenant branding for the current Host
- Forced password change route: `/change-password`

## Platform admin bootstrap

Promote an existing branch email to platform superadmin:

```bash
cd backend && npm run create-platform-admin -- you@example.com
```
