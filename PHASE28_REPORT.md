# Phase 28 Completed: Church Settings

## Implemented

- Unified church operational settings (`church_settings` 1:1 with churches)
- Church Admin can configure profile, fiscal year, currency, timezone, date format, membership/receipt numbering, and notification preferences
- Links to related surfaces: branding, branches, approval workflows, church admins
- Membership and receipt numbers allocated from church settings sequences
- Superadmin can lock selected fields so Church Admins cannot change them

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/026_church_settings.sql`](backend/migrations/026_church_settings.sql) |
| Ensure | [`backend/scripts/applyChurchSettings.js`](backend/scripts/applyChurchSettings.js) |
| Table | `church_settings` (profile-adjacent ops + `locked_fields` JSON) |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/church/settings` | Settings bundle (church profile + ops + meta links) |
| `PATCH /api/church/settings` | Update settings (respects Superadmin locks) |
| `GET /api/superadmin/churches/:id/settings` | Read tenant settings |
| `PATCH /api/superadmin/churches/:id/settings` | Override settings / set `lockedFields` |

Helpers: [`backend/utils/churchSettings.js`](backend/utils/churchSettings.js) — `allocateMembershipNumber`, `allocateReceiptNumber`.

## Frontend

- `/settings` — Church Settings page (profile, locale, numbering, notifications)
- Sidebar: **Church Settings**
- Superadmin church detail: **Lock church settings** checkboxes

## Tests

```bash
cd backend && npm run test:settings
```

**Result:** All checks passed.

## Known Issues

- Notification preference flags are stored; wiring into every notifier is progressive
- Date format is stored for display prefs; not every UI date already consumes it

## Next Phase

**Phase 29 — Responsive User Interface**

Desktop collapsible sidebar + top nav, tablet compact nav, mobile drawer; permission-based menus; breadcrumbs, search, notifications, profile, branch selector.
