# Deploying the Church Management System

## Recommended production layout

**Frontend → Vercel · Backend → Render · Database → Neon**

Full checklist: **[docs/DEPLOY_VERCEL_RENDER_NEON.md](docs/DEPLOY_VERCEL_RENDER_NEON.md)**

Phase 39 defines **development**, **staging**, and **production** environments with controlled migrations, health/readiness checks, logging, backups, and configuration for database, storage, email, domain/SSL, and monitoring.

## Environments

| Env | `NODE_ENV` | Purpose |
|-----|------------|---------|
| Development | `development` | Local machines; demo seed allowed |
| Staging | `staging` | Pre-prod mirror; strong secrets + CORS required |
| Production | `production` | Live traffic; strong secrets + persistent disk |

Example env files (no secrets committed):

- `backend/.env.development.example`
- `backend/.env.staging.example`
- `backend/.env.production.example`
- `backend/.env.example`

## Required configuration (staging / production)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | 32+ character signing secret |
| `CORS_ORIGIN` | Comma-separated https origins |
| `APP_URL` | Public app URL (email / reset links) |
| `DATABASE_URL` | Neon Postgres pooled URI (preferred) |
| `DATABASE_PATH` | SQLite path only when `DATABASE_URL` unset |
| `SERVE_FRONTEND` | `0` for API-only Render (frontend on Vercel) |
| `TRUST_PROXY` | `1` behind Render/nginx |
| `UPLOADS_PATH` / `BACKUP_PATH` | Optional persistent storage roots |
| `SMTP_*` | Optional outbound email |
| `SENTRY_DSN` | Optional error reporting |
| `LOG_LEVEL` | `error` \| `warn` \| `info` \| `debug` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Pre-deploy check

```bash
cd backend
NODE_ENV=production \
  JWT_SECRET='…' \
  CORS_ORIGIN='https://app.example.com' \
  APP_URL='https://app.example.com' \
  DATABASE_PATH=/var/data/database.sqlite \
  TRUST_PROXY=1 \
  npm run predeploy
```

## Controlled migrations

Build/deploy pipelines should run:

```bash
cd backend && npm run migrate:deploy
```

This wraps `npm run migrate` and **refuses** `RUN_DEMO_SEED=1` in staging/production.

Root build (Render):

```bash
npm run build   # frontend build + backend ci + init-db + migrate
npm start       # backend serves API + React build
```

## Health & monitoring

| Endpoint | Use |
|----------|-----|
| `GET /api/health` | Liveness (platform health check) |
| `GET /api/health/ready` | Readiness: DB ping + deployment checklist (no secrets) |

Responses include `X-Request-Id`. Staging/production emit JSON request logs to stdout (collect via platform logging).

Optional: set `SENTRY_DSN` and wire a Sentry SDK later; checklist surfaces whether it is configured.

## Database & file storage

- **SQLite** via `DATABASE_PATH` on a **persistent disk** (required for durable production data).
- Tenant files under `uploads/` (or `UPLOADS_PATH`); private church files via `/api/files` only.
- Backups: `npm run backup` / Superadmin backup APIs; retention via `BACKUP_RETENTION_DAYS` / `BACKUP_MAX_COUNT`.

## Email

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` for password-reset and notifications. Without SMTP, auth flows that need email will not deliver externally (dev may use debug reset tokens).

## Domain & SSL

1. Point DNS (A/CNAME) to the hosting service.
2. Enable HTTPS on the platform (Render/Cloudflare/etc.).
3. Set `APP_URL` and `CORS_ORIGIN` to the https origin.
4. Set `TRUST_PROXY=1` so client IPs and secure cookies/proxies behave correctly.

### Custom domains & subdomains (Phase 40)

- Set `PLATFORM_DOMAIN=cms.example.com` so `grace.cms.example.com` resolves to church slug `grace`.
- Map custom hosts (e.g. `portal.church.org`) via `church_domains` (Superadmin or church admin APIs).
- Public resolve: `GET /api/tenant/resolve` (unknown hosts return 404 — never another church).
- Verified tenant hosts reject login for users of a different church.

## Deploy to Render

### Blueprint (`render.yaml`)

1. Push repo → Render **New → Blueprint**.
2. Set **CORS_ORIGIN** and **APP_URL** to your service URL (https).
3. Attach a **Persistent Disk**; set `DATABASE_PATH` (and optionally `UPLOADS_PATH` / `BACKUP_PATH`) to the mount.
4. Confirm `JWT_SECRET` is generated; `TRUST_PROXY=1`.
5. Health check path: `/api/health`.

### Manual Web Service

- **Build**: `npm run build`
- **Start**: `npm start`
- Same env vars as above.

## Logging & error reporting

- Structured JSON logs in staging/production (`utils/logger.js`).
- 5xx errors log with `requestId` (no stack traces returned to clients in prod/staging).
- Platform metrics + `/api/health/ready` for probes; optional `SENTRY_DSN`.

## Security notes

- Never commit `.env` or demo credentials.
- Demo seed (`npm run seed:demo`) is blocked when `NODE_ENV=production` / staging.
- Production boot **fails fast** if `JWT_SECRET` / `CORS_ORIGIN` are missing or weak.

## Verify

```bash
cd backend && npm run test:deploy
cd backend && npm run predeploy -- --env=development
```
