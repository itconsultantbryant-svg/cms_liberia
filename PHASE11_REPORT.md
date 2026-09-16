# Phase 11 Completed: Visitor & Follow-up Management

## Implemented

- Visitor registration (contact, gender, address, first visit, invited by, service, prayer request, notes)
- Follow-up pipeline: **New → Contacted → Follow-up → Interested → Converted → Closed**
- Status history log (`visitor_followups`)
- Assign follow-up officer (`assigned_to`)
- **Convert to member** copies profile fields without re-entry
- UI list with pipeline counts + visitor detail

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/010_visitors.sql`](backend/migrations/010_visitors.sql) |
| Ensure | [`backend/scripts/applyVisitors.js`](backend/scripts/applyVisitors.js) |
| Tables | `visitors`, `visitor_followups` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/visitors` | List/search/filter + pipeline counts |
| `GET /api/visitors/meta` | Status catalog |
| `POST /api/visitors` | Register visitor |
| `GET /api/visitors/:id` | Detail + history |
| `PUT /api/visitors/:id` | Update fields / status |
| `POST /api/visitors/:id/follow-up` | Advance status + notes |
| `POST /api/visitors/:id/convert` | Create member from visitor |
| `DELETE /api/visitors/:id` | Delete visitor |

## Frontend

- [`Visitors.js`](frontend/src/pages/Visitors.js) — register, pipeline filters
- [`VisitorProfile.js`](frontend/src/pages/VisitorProfile.js) — follow-up + convert
- Sidebar **Visitors**

## Tests

```bash
cd backend && npm run test:visitors
```

**Result:** All checks passed.

## Known Issues

- Officer assignment UI is API-ready (`assigned_to`) but detail page does not yet offer a user picker
- Converted members get placeholder email if visitor had none
- No SMS/email automation on status change (notifications phase later)

## Next Phase

**Phase 12 — Service & Attendance Management**

Configurable services, richer attendance capture, and attendance statistics.
