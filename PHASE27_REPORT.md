# Phase 27 Completed: Superadmin Impersonation / Support Access

## Implemented

- Controlled support sessions: Superadmin enters a church with a required reason
- Clear banner: **You are currently accessing this church as Superadmin.**
- Actor identity always remains the Superadmin (`isadmin: false` on target tenant)
- Session log: superadmin, church, reason, start/end, IP/UA
- Actions during support linked via `audit_logs.support_session_id` and `[Support]` summaries
- End support restores Superadmin’s own church JWT

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/025_support_access.sql`](backend/migrations/025_support_access.sql) |
| Ensure | [`backend/scripts/applySupportAccess.js`](backend/scripts/applySupportAccess.js) |
| Table | `support_sessions` |
| Column | `audit_logs.support_session_id` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `POST /api/superadmin/churches/:id/support-access` | Start session (`reason` required) → support JWT |
| `POST /api/superadmin/support-access/end` | End session → restore JWT |
| `GET /api/superadmin/support-access/active` | Current open session |
| `GET /api/superadmin/support-access/sessions/:id` | Session + action history |

## Frontend

- Support banner + **End support access** in Layout
- Superadmin church detail: reason form + enter church

## Tests

```bash
cd backend && npm run test:support
```

**Result:** All checks passed.

## Known Issues

- Support JWT TTL is 4 hours (manual end still required for clean close)
- Feature does not grant a fake church-admin role (by design)

## Next Phase

**Phase 28 — Church Settings**

Church Admin configures profile, branding, branches, fiscal year, currency, numbering, date/timezone, notifications, workflows — within Superadmin restrictions.
