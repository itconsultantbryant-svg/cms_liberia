# Phase 18 Completed: Pastoral Care

## Implemented

- Confidential pastoral care module for:
  - Prayer requests, counseling, home/hospital visits, bereavement, welfare, follow-up
- Cases with priority, status, assignment, follow-up date
- Sensitive notes (counseling / follow-up) and visit records
- **Strict permissions:** `pastoral.view` / `pastoral.manage` are **not** granted by `isadmin` alone
- Ordinary church admins without a pastoral role receive **403**
- Pastor roles + PRESIDENT receive pastoral permissions via RBAC (not via admin flag)

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/017_pastoral_care.sql`](backend/migrations/017_pastoral_care.sql) |
| Ensure | [`backend/scripts/applyPastoralCare.js`](backend/scripts/applyPastoralCare.js) |
| Tables | `pastoral_cases`, `pastoral_notes`, `pastoral_visits` |

## Security

| Rule | Behavior |
|------|----------|
| `isadmin` shortcut | Skips `pastoral.*` |
| PRESIDENT shortcut | Skips `pastoral.*` (must come from role_permissions) |
| `getUserPermissions` for admins | Excludes `pastoral.*` unless role grants them |
| Role grants | PRESIDENT, RESIDENT_PASTOR(+HQ), SENIOR/ASSOCIATE/BRANCH_PASTOR |
| Sidebar | `confidential: true` — not shown via generic admin auto-open |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/pastoral/meta` | Case types, statuses, priorities |
| `GET /api/pastoral` | List cases (filters: type, status, assigned) |
| `POST /api/pastoral` | Create case |
| `GET /api/pastoral/:id` | Detail + notes + visits |
| `PATCH /api/pastoral/:id` | Update case / status |
| `POST /api/pastoral/:id/notes` | Add confidential note |
| `POST /api/pastoral/:id/visits` | Record home/hospital visit |
| `DELETE /api/pastoral/:id` | Close (or `?hard=1` delete) |

## Frontend

- [`PastoralCare.js`](frontend/src/pages/PastoralCare.js)
- [`PastoralCaseDetail.js`](frontend/src/pages/PastoralCaseDetail.js)
- Routes: `/pastoral`, `/pastoral/:id`

## Tests

```bash
cd backend && npm run test:pastoral
```

**Result:** All checks passed (including ordinary-admin denial).

## Known Issues

- Notes are permission-protected, not encrypted at rest
- No separate access-audit log for pastoral reads (Phase 25)
- Assignee picker is defaulted to creator (no staff picker UI yet)

## Next Phase

**Phase 19 — Communication**

Tenant messaging, announcements, and outreach channels.
