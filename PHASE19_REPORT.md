# Phase 19 Completed: Communication

## Implemented

- Centralized outreach on top of existing inter-office messaging
- **Announcements** with audience targeting: church, branch, ministry/group, department, staff, specific members
- **Channel readiness** for email, SMS, WhatsApp (in-app always available)
- **Message templates** (birthday, event reminder, follow-up, announcement)
- **Reminder scan**: event reminders, birthdays today, pastoral follow-ups due
- Delivery log per channel (ready / skipped when provider or contact missing)
- Communications UI tabs: Inbox · Sent · Announcements · Channels · Reminders

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/018_communications.sql`](backend/migrations/018_communications.sql) |
| Ensure | [`backend/scripts/applyCommunications.js`](backend/scripts/applyCommunications.js) |
| Tables | `communication_channel_settings`, `message_templates`, `church_announcements`, `announcement_deliveries`, `reminder_queue` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/outreach/meta` | Audiences & channels |
| `GET/PATCH /api/outreach/channels` | Email/SMS/WhatsApp readiness |
| `GET /api/outreach/templates` | System + church templates |
| `POST /api/outreach/audience/preview` | Resolve audience counts/contacts |
| `GET/POST /api/outreach/announcements` | List / create |
| `POST .../announcements/:id/send` | Expand audience + queue deliveries |
| `GET .../announcements/:id` | Detail + deliveries |
| `POST /api/outreach/reminders/scan` | Build reminder queue |
| `GET /api/outreach/reminders` | List queue |
| `POST .../reminders/:id/dispatch` | In-app notify + mark sent |

Existing `/api/communications` inter-office inbox remains unchanged.

## Frontend

- [`Communications.js`](frontend/src/pages/Communications.js) — outreach tabs added

## Tests

```bash
cd backend && npm run test:communications
```

**Result:** All checks passed.

## Known Issues

- External email/SMS/WhatsApp are readiness + queue only (actual send = Phase 24)
- Department audience resolves staff by `department_id` (HQ departments catalog)
- In-app announcement does not yet fan out per-member notification rows (branch notify + delivery log)

## Next Phase

**Phase 20 — Staff & User Management**

Deepen staff profiles, user provisioning, and role assignment workflows.
