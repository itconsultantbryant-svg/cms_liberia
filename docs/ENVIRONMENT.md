# Environment Variables

Variable **names only**. Never commit production secrets. Copy templates from `backend/.env.*.example` and set real values in a local `.env` or host secret manager.

Also see root [`.env.example`](../.env.example) and [DEPLOYMENT.md](../DEPLOYMENT.md).

## Core

| Name | Notes |
|------|--------|
| `PORT` | HTTP listen port |
| `NODE_ENV` | `development` \| `staging` \| `production` |
| `JWT_SECRET` | Required strong secret (staging/production) |
| `CORS_ORIGIN` | Comma-separated allowed browser origins |
| `APP_URL` | Public URL for email / reset links |
| `DATABASE_URL` | Neon/Postgres URI (preferred in production) |
| `NEON_DATABASE_URL` | Alias for `DATABASE_URL` |
| `DATABASE_PATH` | SQLite file path when `DATABASE_URL` unset |
| `SERVE_FRONTEND` | `0` = API-only (Vercel hosts UI) |
| `UPLOADS_PATH` | Optional uploads root |
| `BACKUP_PATH` | Optional backups root |
| `TRUST_PROXY` | `1` behind Render/nginx |

## Frontend (Vercel)

| Name | Notes |
|------|--------|
| `REACT_APP_API_URL` | Optional. Leave empty for same-origin `/api` (Vercel Services). Set to API origin when frontend and API are on different hosts. |

## Rate limits

| Name |
|------|
| `API_RATE_LIMIT` |
| `WRITE_RATE_LIMIT` |
| `AUTH_RATE_LIMIT` |

## Backups

| Name |
|------|
| `BACKUP_RETENTION_DAYS` |
| `BACKUP_MAX_COUNT` |

## Email (optional)

| Name |
|------|
| `SMTP_HOST` |
| `SMTP_PORT` |
| `SMTP_USER` |
| `SMTP_PASS` |
| `SMTP_FROM` |

## Logging / monitoring

| Name |
|------|
| `LOG_LEVEL` |
| `SENTRY_DSN` |

## Auth debug (never production)

| Name |
|------|
| `AUTH_DEBUG_RESET` |

## Custom domains (Phase 40)

| Name |
|------|
| `PLATFORM_DOMAIN` |
| `PLATFORM_ROOT_HOSTS` |
| `VERIFY_DOMAINS_SKIP_DNS` |

## Demo seed (never production)

| Name |
|------|
| `ALLOW_DEMO_SEED` / related seed flags |

`migrate:deploy` refuses demo seeding in staging/production.
