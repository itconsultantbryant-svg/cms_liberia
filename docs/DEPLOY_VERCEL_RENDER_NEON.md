# Deploy: Vercel (Services) + Neon (Postgres)

Recommended layout: one Vercel project with **frontend + backend services**, Neon for Postgres.

| Layer | Host | Notes |
|-------|------|--------|
| Frontend + API | **Vercel Services** | Root [`vercel.json`](../vercel.json) routes `/api` → backend, everything else → CRA |
| Database | **Neon** | Postgres via `DATABASE_URL` (pooled + `sslmode=require`) |
| Files | Object storage / disk | Branding images (logo/favicon/login bg) are also stored in Neon (`stored_files.content_base64`) and served from `/api/files/public/branding/...` so they survive serverless ephemeral disks |

**Alternative:** frontend-only on Vercel + API on **Render** (see § Alternative: Render API below). Set `REACT_APP_API_URL` to the Render origin in that case.

Local development can keep **SQLite** (no `DATABASE_URL`).

## Neon project

A Neon project was provisioned for this app:

- **Name:** `church-management-system`
- **Project ID:** `lucky-frost-76172810`
- **Database:** `church_cms`
- **Region:** `aws-us-east-1`

Copy the **pooled** connection string from the [Neon console](https://console.neon.tech) (Dashboard → Connection details).  
Never commit the password or full URI to git.

Set on Render as:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.../church_cms?sslmode=require
```

## 1. Vercel multi-service project

1. Import the GitHub repo in Vercel.
2. **Root Directory:** leave empty (repo root) so [`vercel.json`](../vercel.json) is used.
3. Ensure the project uses **Services** (framework / project type that reads `services` in `vercel.json`).
4. Environment variables (apply to the **backend** service / shared project env as needed):

| Key | Example |
|-----|---------|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `SERVE_FRONTEND` | `0` |
| `JWT_SECRET` | long random (32+) |
| `DATABASE_URL` | Neon pooled URI (**required** on Vercel — SQLite will not work) |
| `DATABASE_URL_MIGRATE` | Optional direct (non-pooler) URI for migrations |
| `CORS_ORIGIN` | `https://your-app.vercel.app` (auto-filled from `VERCEL_URL` if omitted) |
| `APP_URL` | `https://your-app.vercel.app` |

Do **not** set `REACT_APP_API_URL` when using same-domain `/api` rewrites (browser calls `/api/...` on the Vercel host).

Optional branding / subdomain:

| Key | Example |
|-----|---------|
| `PLATFORM_DOMAIN` | `cms-liberia.vercel.app` (or your custom domain apex) |
| `APP_URL` | `https://cms-liberia.vercel.app` |

Church portals work immediately at `/t/{slug}/login` (logo + colors + optional login background). DNS wildcards (`{slug}.yourdomain.com`) are optional extras you can add under Superadmin → church detail → Custom domains.

If `/api/health` returns `FUNCTION_INVOCATION_FAILED`, the backend crashed on boot — almost always missing `DATABASE_URL` or `JWT_SECRET`.

5. Run migrations once against Neon (CI, local, or a one-off job):

```bash
cd backend && npm run migrate:deploy
```

6. After deploy, confirm:
   - `GET https://YOUR-APP.vercel.app/api/health` → 200  
   - `GET https://YOUR-APP.vercel.app/api/health/ready` → ready / check list  

Create a platform admin once:

```bash
cd backend && npm run create-platform-admin -- you@example.com
```

Routing (from root `vercel.json`):

- `/api` → **backend** (Express)
- all other paths → **frontend** (CRA)

## 2. Alternative: Render API + Vercel frontend only

1. New **Blueprint** from this repo ([`render.yaml`](../render.yaml)), **or** Web Service with root `backend`, build `npm ci && npm run init-db && npm run migrate:deploy`, start `npm start`, health `/api/health`.
2. Attach a **persistent disk** at `/opt/render/project/data` for uploads/backups.
3. Same backend env as above, plus `UPLOADS_PATH` / `BACKUP_PATH` on the disk; set `CORS_ORIGIN` to the Vercel URL.
4. On Vercel, either keep multi-service and point only frontend at the repo, **or** deploy `frontend` alone with:

| Key | Value |
|-----|--------|
| `REACT_APP_API_URL` | `https://YOUR-API.onrender.com` (no trailing slash) |

## 3. CORS & cookies

- Same-domain Vercel Services: API is `/api` on the app origin; still set `CORS_ORIGIN` to that origin if CORS middleware is strict.
- Split Render API: browser origin is Vercel → must be listed in Render `CORS_ORIGIN`.
- API calls use `Authorization: Bearer …` (no cookie session required).
- Rebuild the frontend whenever `REACT_APP_API_URL` changes (baked in at build time).

## 4. Database mode

| Env | Driver |
|-----|--------|
| `DATABASE_URL` / `NEON_DATABASE_URL` set | **Postgres** (`pg`) with light SQLite→PG SQL translation |
| unset | **SQLite** file (`DATABASE_PATH` or `backend/database.sqlite`) |

Code: [`backend/database.js`](../backend/database.js), [`backend/utils/sqlDialect.js`](../backend/utils/sqlDialect.js).

Migrations: `npm run migrate:deploy` on Render build (same apply scripts; dialect layer translates DDL/DML where needed).

> Use a **direct** Neon host for migrations (not `-pooler`). `migrate:deploy` rewrites pooled URLs automatically. Runtime can keep the pooled URI.

> Some SQLite-only edge cases may still need follow-up hardening on Postgres. Validate critical flows (auth, members, finance) after first Neon deploy.

## 5. Local dual-stack smoke test

```bash
# Terminal A — API against Neon (use your secret URI only in local .env)
cd backend
# DATABASE_URL=... in .env  (gitignored)
npm run migrate:deploy
SERVE_FRONTEND=0 CORS_ORIGIN=http://localhost:3004 npm start

# Terminal B — CRA pointing at local API (proxy) OR:
cd frontend
# REACT_APP_API_URL=http://localhost:5000
npm start
```

## 6. Checklist

- [ ] Neon `DATABASE_URL` on Vercel (backend) and/or Render  
- [ ] `GET /api/health` + `/api/health/ready` OK on the public URL  
- [ ] `CORS_ORIGIN` includes the app origin  
- [ ] Same-domain deploy: `REACT_APP_API_URL` unset; split deploy: points at Render  
- [ ] Platform admin created  
- [ ] Login + create member + finance txn smoke test  
- [ ] Uploads strategy decided (disk / object storage)  
- [ ] Rotate any connection strings that were shared outside the secret manager  

## Related

- Legacy single-service notes: [DEPLOYMENT.md](../DEPLOYMENT.md)  
- Env names: [ENVIRONMENT.md](ENVIRONMENT.md)
