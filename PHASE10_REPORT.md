# Phase 10 Completed: Households & Families

## Implemented

- Household/family records with address and notes
- Members linked as **head**, **spouse**, **child**, **dependent**, or **other**
- Full household profile with member list
- Giving history (member collections) for authorized users
- Member profiles show linked household(s)
- UI at `/households` and `/households/:id`

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/009_households.sql`](backend/migrations/009_households.sql) |
| Ensure | [`backend/scripts/applyHouseholds.js`](backend/scripts/applyHouseholds.js) |
| Tables | `households`, `household_members` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/households` | List/search/paginate |
| `POST /api/households` | Create (+ optional members) |
| `GET /api/households/:id` | Profile + members + giving |
| `PUT /api/households/:id` | Update details |
| `DELETE /api/households/:id` | Delete household (not members) |
| `POST /api/households/:id/members` | Add member |
| `PATCH /api/households/:id/members/:memberId` | Change relationship |
| `DELETE /api/households/:id/members/:memberId` | Remove from household |
| `GET /api/households/by-member/:memberId` | Lookup by member |
| `GET /api/members/:id` | Includes `households` array |

## Frontend

- [`Households.js`](frontend/src/pages/Households.js) — list/create
- [`HouseholdProfile.js`](frontend/src/pages/HouseholdProfile.js) — manage members + giving
- Sidebar **Households**; member profile links

## Tests

```bash
cd backend && npm run test:households
```

**Result:** All checks passed.

## Known Issues

- A member can belong to more than one household (allowed by design; constrain later if needed)
- Giving history only covers `member_collections`, not branch-level offerings
- State/country fields on household are stored but not all shown in create form

## Next Phase

**Phase 11 — Visitor & Follow-up Management**

Visitor registration, follow-up pipeline, and convert-to-member.
