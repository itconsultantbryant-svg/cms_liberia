# Phase 12 Completed: Service & Attendance Management

## Implemented

- Service catalog with categories: Sunday worship, Midweek, Prayer, Youth, Special, Conference, Custom
- Default templates + per-branch seed
- Attendance capture: **headcount**, **member selection**, **membership ID**, **bulk**, **QR-ready tokens**
- Statistics by service, date, branch, gender, age group, ministry, month, quarter, year
- Services UI + enhanced Attendance tabs

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/011_services_attendance.sql`](backend/migrations/011_services_attendance.sql) |
| Ensure | [`backend/scripts/applyServicesAttendance.js`](backend/scripts/applyServicesAttendance.js) |
| Tables | `service_templates`; extended `service_types`, `attendances`, `member_attendances` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET/POST /api/services` | List / create services |
| `POST /api/services/seed-defaults` | Seed standard service types |
| `PATCH/DELETE /api/services/:id` | Update / soft-deactivate |
| `GET /api/services/:id/qr-payload` | QR check-in token + payload |
| `POST /api/attendance/check-in` | Check-in by membership ID or QR token |
| `POST /api/attendance/mark-bulk` | Bulk present/absent (per date+service) |
| `POST /api/attendance/submit` | Headcount (upsert per date+service) |
| `GET /api/attendance/stats/detailed` | Multi-dimension stats (`groupBy`) |
| `GET /api/attendance/members` | Member-level records for a date |

## Frontend

- [`Services.js`](frontend/src/pages/Services.js) — manage services + QR payload
- [`Attendance.js`](frontend/src/pages/Attendance.js) — headcount / check-in / bulk / stats

## Tests

```bash
cd backend && npm run test:attendance
```

**Result:** All checks passed.

## Known Issues

- QR is token/payload ready (no camera scanner UI yet)
- Age-group stats depend on member `dob` being populated
- Legacy `/api/branches/tools/service-type` still works alongside `/api/services`

## Next Phase

**Phase 13 — Finance & Accounting**

Income/expense categories, stronger controls, dashboards, and adjustment/reversal flows.
