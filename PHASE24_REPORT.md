# Phase 24 Completed: Notifications

## Implemented

- Expanded notification types (approvals, assignments, events, birthdays, membership, subscription, announcements, communications, etc.)
- Tenant-scoped `church_id` on notifications; rebuilt table to remove restrictive SQLite CHECK
- Notification center APIs: list/history, unread count, mark read, mark all read
- Scan job for birthdays (7 days), upcoming events, subscription/status warnings
- System announcements to admins or all church users
- Hooks: workflow approval request/result, new member registration, pastoral assignment
- UI at `/notifications` + bell dropdown “View all”
- Fixed prior CHECK failures on `communication` type inserts

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/022_notifications_center.sql`](backend/migrations/022_notifications_center.sql) |
| Ensure | [`backend/scripts/applyNotifications.js`](backend/scripts/applyNotifications.js) |
| Helpers | [`backend/utils/notifications.js`](backend/utils/notifications.js) |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/notifications` | History (`type`, `unreadOnly`, `limit`, `offset`) + unread |
| `GET /api/notifications/unread-count` | Badge count |
| `GET /api/notifications/meta` | Allowed types/labels |
| `PUT /api/notifications/:id/read` | Mark one read |
| `PUT /api/notifications/read-all` | Mark all read |
| `POST /api/notifications/scan` | Generate birthday/event/subscription alerts |
| `POST /api/notifications/announce` | Church announcement (`settings.manage`) |

## Frontend

- [`Notifications.js`](frontend/src/pages/Notifications.js)
- Layout bell → link to full history
- Sidebar: Notifications under Overview

## Tests

```bash
cd backend && npm run test:notifications
```

**Result:** All checks passed.

## Known Issues

- No push/email/SMS delivery yet (in-app only; poll from Layout)
- Scan is on-demand / manual “Refresh alerts” (not a cron worker)
- Subscription warnings use church `status` only (no billing plan entity yet)

## Next Phase

**Phase 25 — Audit Logging**

Immutable audit trail for auth, CRUD, approvals, finance, roles, users, church/branch changes; church admins cannot delete audit records.
