# Phase 23 Completed: Reporting & Analytics

## Implemented

- Cross-module analytics API for membership, attendance, finance, and ministry
- Overview dashboard aggregating key KPIs
- Date range + branch filters on all report endpoints
- CSV (Excel-friendly, UTF-8 BOM) and JSON export
- Print / PDF via browser print stylesheet
- Permission-gated (`reports.view`, `reports.export`, plus module perms)
- Rewrote Reports UI at `/reports` (old stub expected missing `/api/reports/*` analytics routes)

## Database

No new migration — reports read existing tenant tables (`members`, `attendances`, `member_attendances`, `finance_transactions`, `pledges`, `budgets`, `groups`, `group_meetings`).

| Change | Detail |
|--------|--------|
| Helpers | [`backend/utils/analytics.js`](backend/utils/analytics.js) |
| Routes | [`backend/routes/analytics.js`](backend/routes/analytics.js) |
| Permissions | Existing `reports.view` / `reports.export` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/analytics/overview` | KPI summary |
| `GET /api/analytics/membership` | Totals, growth, status/gender/age/branch |
| `GET /api/analytics/attendance` | Headcount, weekly/monthly, branch/service |
| `GET /api/analytics/finance` | Income/expense, tithes/offerings, pledges, cash flow |
| `GET /api/analytics/ministry` | Ministry enrollment & meeting activity |
| `GET /api/analytics/export/:type` | `format=csv\|json` for membership/attendance/finance/ministry |

Query params: `from`, `to`, `branchId`.

Staff performance CRUD remains at `/api/reports` (unchanged).

## Frontend

- [`Reports.js`](frontend/src/pages/Reports.js) — tabbed dashboards, filters, export, print
- Sidebar description updated in [`permissions.js`](frontend/src/config/permissions.js)

## Tests

```bash
cd backend && npm run test:reports
```

**Result:** All checks passed.

## Known Issues

- PDF export uses browser Print → Save as PDF (no server-side PDF library)
- Legacy collections table not included (finance ledger is the source of truth)
- Chart visualizations are tabular only (no chart library added)

## Next Phase

**Phase 24 — Notifications**

Notification center: approvals, assignments, events, birthdays, membership activity, subscription warnings, system announcements; unread count; mark read / mark all read; history.
