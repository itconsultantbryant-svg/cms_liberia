# Phase 9 Completed: Member Management

## Implemented

- Extended member profile (membership ID, middle name, alt phone, baptism, ministry/department, emergency contact, notes, documents)
- Membership statuses: **Active**, **Inactive**, **Visitor**, **Transferred**, **Deceased**, **Suspended**
- List API with **search**, **filters**, **pagination**
- **CSV export** / **JSON+CSV import**
- **Bulk** status updates
- Printable profile + document upload
- Add/Edit member forms (`/members/new`, `/members/:id/edit`)

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/008_member_management.sql`](backend/migrations/008_member_management.sql) |
| Ensure | [`backend/scripts/applyMemberManagement.js`](backend/scripts/applyMemberManagement.js) |
| Tables | Extended `members`; new `member_documents` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/members` | Search/filter/paginate (`q`, `status`, `sex`, `page`, `limit`, `allBranches`) |
| `GET /api/members/meta` | Status catalogs |
| `GET /api/members/export` | CSV download |
| `POST /api/members/import` | CSV file or JSON `members` array |
| `POST /api/members/bulk` | `set_status` / `delete` |
| `POST /api/members` | Create + auto `membership_id` |
| `PUT /api/members/:id` | Whitelisted field updates |
| `POST /api/members/:id/documents` | Upload document |
| `DELETE /api/members/:id` | Still respects Phase 8 approval workflow |

## Frontend

- [`Members.js`](frontend/src/pages/Members.js) — filters, pagination, bulk, import/export
- [`MemberForm.js`](frontend/src/pages/MemberForm.js) — create/edit
- [`MemberProfile.js`](frontend/src/pages/MemberProfile.js) — full profile, print, documents

## Tests

```bash
cd backend && npm run test:members
```

**Result:** All checks passed.

## Known Issues

- Global email UNIQUE remains (cross-tenant collisions possible); prefer church-scoped uniqueness later
- Photo upload on create still supported; edit form is fields-only (photo via future enhancement)
- Ministry/department are free-text until Phase 16 formalizes org structures

## Next Phase

**Phase 10 — Households & Families**

Household grouping (head, spouse, children, dependents) with linked member profiles.
