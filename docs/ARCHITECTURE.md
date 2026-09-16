# Architecture

## Overview

The Church Management System is a **multi-tenant SaaS** application:

**Platform → Church (tenant) → Branch → Department/Ministry → User**

Each church has isolated data, branding, users, members, finances, reports, and settings.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router, Axios |
| Backend | Node.js, Express |
| Database | SQLite (`DATABASE_PATH`) |
| Auth | JWT (Bearer), password hashing (bcrypt) |
| Files | Local disk under `uploads/` / `UPLOADS_PATH` |

## Frontend

**Entry:** `frontend/src/App.js`

- Providers: `AuthProvider` → `ThemeProvider` → `BrowserRouter`
- Public: `/login`, `/register`, `/forgot-password`, `/reset-password`
- Protected shell: `PrivateRoute` + `Layout` + lazy-loaded pages
- Theme applies tenant `primary_color` / logo from the authenticated church (and Host resolve on login)
- Sidebar items filtered by `canShowSidebarItem` (`frontend/src/config/permissions.js`)
- Sensitive pages also pass `permission` into `PrivateRoute` (e.g. pastoral, finance ledger, audit)

In development the React app typically runs on port **3003** and proxies API calls to the backend. In staging/production the backend serves the built SPA from `frontend/build`.

## Backend

**Entry:** `backend/server.js`  
**Route registry:** `backend/routes/index.js`

Middleware order (simplified):

1. Helmet, CORS, compression, request logging
2. JSON body parser, origin / dangerous-body checks
3. Static `/uploads` (blocks private `/churches/` paths → use `/api/files`)
4. Rate limiters
5. `resolveDomainTenant` on `/api` (Host → optional `req.hostChurchId`)
6. Mounted routers (`/api/auth`, `/api/superadmin`, tenant modules, …)
7. Global error handler
8. SPA static fallback (staging/production)

Catalog / ops:

- `GET /api` — API index
- `GET /api/health` — liveness
- `GET /api/health/ready` — readiness (DB + deployment checklist)
- `GET /api/meta/architecture` — architecture summary blob

## Database

SQLite file (default `backend/database.sqlite`, override with `DATABASE_PATH`).

Schema evolves via numbered SQL migrations under `backend/migrations/` (002–031+) applied by `npm run migrate` / `migrate:deploy`. Operational tables are stamped with **`church_id`** for tenant isolation. See [DATABASE.md](DATABASE.md).

## Storage

| Kind | Location | Access |
|------|----------|--------|
| Public-ish legacy uploads | `uploads/branding`, `communications`, … | `/uploads/...` static (restricted) |
| Tenant private files | `uploads/churches/{churchId}/{category}/` | `/api/files` only |
| Backups | `BACKUP_PATH` or `backend/backups` | Superadmin backup APIs / `npm run backup` |

Categories include branding, members, finance, documents, events, ministries, communications, pastoral, other (`backend/utils/fileStorage.js`).

## Tenant hierarchy

| Level | Model | Notes |
|-------|-------|-------|
| Platform | `branches.is_platform_admin` | Superadmin portal `/superadmin` |
| Church | `churches` | Tenant root; branding, subscription, domains |
| Branch | `branches` | Campus / HQ; often the login account for admins |
| User | `sub_users` + `user_roles` | Staff with role/permission grants |
| Branch context | `user_branch_access`, `req.activeBranchId` | Scoped ops within a church |

Registration creates a **new church + HQ branch** with PRESIDENT / church-admin privileges. Superadmin creates churches and admins without using the public register path for production onboarding.

## Related docs

- [AUTHENTICATION.md](AUTHENTICATION.md)
- [AUTHORIZATION.md](AUTHORIZATION.md)
- [TENANT_ISOLATION.md](TENANT_ISOLATION.md)
- [DEPLOYMENT.md](../DEPLOYMENT.md)
