# Phase 17 Completed: Event Management

## Implemented

- Event types: service, conference, retreat, training, meeting, baptism, wedding, funeral, community, custom
- Calendar feed + month calendar UI
- Date / start–end time / venue / organizer / branch / description
- Optional ministry (`group_id`) linkage
- Registration with capacity → waitlist
- Attendance marking on registrations
- Attachments upload
- Reminder readiness (`reminder_enabled` + hours-before + `/reminders/due`)
- Soft cancel (status) vs hard delete

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/016_events.sql`](backend/migrations/016_events.sql) |
| Ensure | [`backend/scripts/applyEvents.js`](backend/scripts/applyEvents.js) |
| Columns on `events` | `event_type`, `end_date/time`, `venue`, organizer fields, `group_id`, `status`, registration + reminder flags |
| Tables | `event_registrations`, `event_attachments` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/events/meta` | Types & statuses |
| `GET /api/events` | List / filter (type, status, range, upcoming, ministry) |
| `GET /api/events/calendar` | Range calendar feed |
| `GET /api/events/reminders/due` | Reminder-ready events |
| `POST /api/events` | Create |
| `GET /api/events/:id` | Detail + registrations + attachments |
| `PATCH /api/events/:id` | Update |
| `POST /api/events/:id/register` | Member or guest register / waitlist |
| `PATCH .../registrations/:regId` | Status / attended |
| `POST /api/events/:id/attendance` | Bulk mark attended |
| `POST /api/events/:id/attachments` | Upload file |
| `DELETE /api/events/:id` | Cancel (or `?hard=1`) |

## Frontend

- [`Events.js`](frontend/src/pages/Events.js) — create, list, calendar month view
- [`EventDetail.js`](frontend/src/pages/EventDetail.js) — register, attendance, attachments
- Routes: `/events`, `/events/:id`

## Tests

```bash
cd backend && npm run test:events
```

**Result:** All checks passed.

## Known Issues

- Reminder delivery is readiness-only (actual push/email is Phase 24)
- Calendar is a simple month grid (no drag/drop or multi-view)
- Attachment types are not categorized

## Next Phase

**Phase 18 — Pastoral Care**

Care requests, counseling notes, visit tracking, and confidentiality controls.
