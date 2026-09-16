# Church Management System — Technical Documentation

Phase 43 documentation for the multi-tenant SaaS CMS.

| Document | Contents |
|----------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Frontend, backend, database, storage, tenant hierarchy |
| [DATABASE.md](DATABASE.md) | Major tables and relationships |
| [AUTHENTICATION.md](AUTHENTICATION.md) | Login, JWT, password reset, lockout |
| [AUTHORIZATION.md](AUTHORIZATION.md) | Roles and permissions |
| [TENANT_ISOLATION.md](TENANT_ISOLATION.md) | How church boundaries are enforced |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Production deployment (root guide) |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Environment variable names (no secrets) |
| [SUPERADMIN_MANUAL.md](SUPERADMIN_MANUAL.md) | Platform operator guide |
| [CHURCH_ADMIN_MANUAL.md](CHURCH_ADMIN_MANUAL.md) | Church administrator guide |

## Quick links

- Local setup: root [README.md](../README.md)
- Deploy checklist: [DEPLOYMENT.md](../DEPLOYMENT.md)
- Env templates: `backend/.env.example`, `backend/.env.*.example`, root `.env.example`
