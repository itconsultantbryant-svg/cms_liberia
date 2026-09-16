# Phase 34 Completed: Backup & Recovery

## Implemented

Backup strategy covering **database**, **uploaded files**, and **redacted configuration**, with Superadmin-only access so tenant isolation is preserved.

| Capability | Detail |
|------------|--------|
| Full backup | SQLite snapshot (`VACUUM INTO` / copy) + `uploads/` + `config.json` |
| Church backup | Tenant-only `data.json` + `uploads/churches/{id}/` — no other tenants |
| Automated | `npm run backup` (optional `--church=ID`) for cron/systemd |
| Retention | `BACKUP_RETENTION_DAYS` (default 14), `BACKUP_MAX_COUNT` (default 30) |
| Restore testing | Non-destructive verify (checksum + open probe) |
| DR runbook | Documented point-in-time / disaster recovery steps |

Secrets (JWT, passwords) are **never** written into config snapshots. Church exports strip password hashes.

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/029_backups.sql`](backend/migrations/029_backups.sql) |
| Ensure | [`backend/scripts/applyBackups.js`](backend/scripts/applyBackups.js) |
| Table | `backup_jobs` |

## API (Superadmin only)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/superadmin/backups/policy` | Retention + DR runbook |
| `GET /api/superadmin/backups` | List jobs |
| `POST /api/superadmin/backups` | Create `{ kind: 'full' \| 'church', churchId? }` |
| `GET /api/superadmin/backups/:id` | Job + manifest |
| `POST /api/superadmin/backups/:id/verify` | Integrity / restore test |

Helper: [`backend/utils/backup.js`](backend/utils/backup.js)

## Frontend

- Superadmin **Backups** tab: run full backup, list, verify
- Church detail: **Backup this church** (tenant export)

## Tests

```bash
cd backend && npm run test:backup
```

**Result:** All checks passed.

## Known Issues

- Full production restore remains a documented stop-the-world procedure (replace DB + uploads); no one-click overwrite API (by design)
- Continuous WAL PITR needs external volume snapshots; in-app backups are discrete point-in-time copies

## Next Phase

**Phase 35 — Security Hardening**
