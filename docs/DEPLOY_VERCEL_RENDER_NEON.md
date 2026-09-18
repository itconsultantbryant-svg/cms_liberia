# Split deploy: Vercel (frontend) + Render (API) + Neon (Postgres)

This is the recommended production layout for the Church Management System.

| Layer | Host | Notes |
|-------|------|--------|
| Frontend | **Vercel** | React CRA build; talks to Render via `REACT_APP_API_URL` |
| Backend | **Render** | Express API only (`SERVE_FRONTEND=0`) |
| Database | **Neon** | Postgres via `DATABASE_URL` (pooled + `sslmode=require`) |
| Files | Render disk | `UPLOADS_PATH` / `BACKUP_PATH` on persistent disk |

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

## 1. Backend on Render

1. New **Blueprint** from this repo (uses root [`render.yaml`](../render.yaml)), **or** Web Service with:
   - **Root directory:** `backend`
   - **Build:** `npm ci && npm run init-db && npm run migrate:deploy`
   - **Start:** `npm start`
   - **Health check:** `/api/health`
2. Attach a **persistent disk** at `/opt/render/project/data` (uploads/backups).
3. Environment variables:

| Key | Example |
|-----|---------|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `SERVE_FRONTEND` | `0` |
| `JWT_SECRET` | long random (32+) |
| `DATABASE_URL` | Neon pooled URI for the API runtime |
| `DATABASE_URL_MIGRATE` | Optional direct (non-pooler) URI for migrations |
| `CORS_ORIGIN` | `https://your-app.vercel.app` |
| `APP_URL` | `https://your-app.vercel.app` |
| `UPLOADS_PATH` | `/opt/render/project/data/uploads` |
| `BACKUP_PATH` | `/opt/render/project/data/backups` |

Optional: `PLATFORM_DOMAIN`, SMTP_*, `LOG_LEVEL`.

4. After first deploy, confirm:
   - `GET https://YOUR-API.onrender.com/api/health` → 200  
   - `GET https://YOUR-API.onrender.com/api/health/ready` → ready / check list

Build runs `npm ci && npm run init-db && npm run migrate:deploy` so Neon receives base schema then phase migrations.

Create a platform admin once:

```bash
# from a machine that can reach the API / or Render shell with DATABASE_URL
cd backend && npm run create-platform-admin -- you@example.com
```

## 2. Frontend on Vercel

1. Import the GitHub repo in Vercel.
2. **Root Directory:** `frontend`
3. **Build Command:** `npm run build` (or `npm run vercel-build`)
4. **Output Directory:** `build`
5. Environment variable:

| Key | Value |
|-----|--------|
| `REACT_APP_API_URL` | `https://YOUR-API.onrender.com` (no trailing slash) |

6. Deploy. Open the Vercel URL and log in against the Render API.

SPA routing is handled by [`frontend/vercel.json`](../frontend/vercel.json).

## 3. CORS & cookies

- Browser origin is the **Vercel** URL → must be listed in Render `CORS_ORIGIN`.
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

- [ ] Neon `DATABASE_URL` on Render  
- [ ] Render health + ready OK  
- [ ] `CORS_ORIGIN` includes Vercel URL  
- [ ] Vercel `REACT_APP_API_URL` points at Render  
- [ ] Platform admin created  
- [ ] Login + create member + finance txn smoke test  
- [ ] Uploads land on Render disk  
- [ ] Rotate any connection strings that were shared outside the secret manager  

## Related

- Legacy single-service notes: [DEPLOYMENT.md](../DEPLOYMENT.md)  
- Env names: [ENVIRONMENT.md](ENVIRONMENT.md)
