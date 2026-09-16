# Phase 16 Completed: Ministries, Departments & Groups

## Implemented

- Extended `groups` into full **ministries** (category, description, leader, assistant, meeting schedule, active flag)
- Membership roles: **leader / assistant / member**
- Ministry **meetings** with attendance counts
- Ministry **announcements** and **document uploads**
- Seedable **templates** (Choir, Youth, Women, Men, Children, Evangelism, Media, Ushering, Prayer)
- Soft deactivate (hard delete via `?hard=1`)
- HQ `departments` table left unchanged (org chart vs ministry groups)

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/015_ministries.sql`](backend/migrations/015_ministries.sql) |
| Ensure | [`backend/scripts/applyMinistries.js`](backend/scripts/applyMinistries.js) |
| Columns on `groups` | `category`, `description`, `leader_member_id`, `assistant_leader_member_id`, `meeting_day/time/location`, `is_active` |
| Columns on `group_members` | `role`, `church_id` |
| Tables | `group_meetings`, `group_announcements`, `group_documents`, `ministry_templates` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/groups/meta` | Categories + roles |
| `GET /api/groups/templates` | Platform ministry templates |
| `GET /api/groups` | List ministries (branch-scoped; filter by category/active) |
| `POST /api/groups` / `/create` | Create ministry |
| `POST /api/groups/seed-defaults` | Seed template ministries for current branch |
| `GET /api/groups/:id` | Detail + members, meetings, announcements, documents, related events |
| `PATCH /api/groups/:id` | Update ministry fields |
| `POST /api/groups/:id/members` | Add member with role |
| `PATCH /api/groups/:id/members/:memberId` | Change role |
| `DELETE /api/groups/:id/members/:memberId` | Remove member |
| `POST /api/groups/:id/meetings` | Record meeting + attendance |
| `POST /api/groups/:id/announcements` | Post announcement |
| `POST /api/groups/:id/documents` | Upload document (multipart) |
| `DELETE /api/groups/:id` | Soft deactivate (or hard delete) |

## Frontend

- [`Groups.js`](frontend/src/pages/Groups.js) — ministries list, create, seed defaults, filters
- [`MinistryDetail.js`](frontend/src/pages/MinistryDetail.js) — members, meetings, announcements, documents
- Routes: `/groups`, `/groups/:id`, `/ministries`, `/ministries/:id`
- Sidebar label: **Ministries**

## Tests

```bash
cd backend && npm run test:ministries
```

**Result:** All checks passed.

## Known Issues

- Document upload UI does not set `doc_type` (defaults to `other`)
- Related events matched by title keyword only (no formal `group_id` on events yet)
- Members picker loads first 100 members only

## Next Phase

**Phase 17 — Event Management**

Church/branch events with scheduling, attendance, and ministry linkage.
