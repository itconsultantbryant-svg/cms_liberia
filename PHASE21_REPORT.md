# Phase 21 Completed: Document Management

## Implemented

- Tenant-scoped church document library
- Categories: church, policies, financial, member, minutes, reports, certificates, evidence
- Visibility: church / branch / restricted
- Version history on each document
- Permissions: `documents.view` / `documents.manage`
- Financial documents also require `finance.view` (or manage/admin)
- Soft archive (hard delete via `?hard=1`)
- UI at `/documents`

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/020_documents.sql`](backend/migrations/020_documents.sql) |
| Ensure | [`backend/scripts/applyDocuments.js`](backend/scripts/applyDocuments.js) |
| Tables | `document_categories`, `church_documents`, `document_versions` |
| Storage | `backend/uploads/documents/` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/documents/meta` | Categories & visibilities |
| `GET /api/documents` | List (filter category/q/branch) |
| `POST /api/documents` | Upload (multipart `file`) |
| `GET /api/documents/:id` | Detail + versions |
| `PATCH /api/documents/:id` | Update metadata |
| `POST /api/documents/:id/versions` | Upload new version |
| `DELETE /api/documents/:id` | Archive (or hard delete) |

## Frontend

- [`Documents.js`](frontend/src/pages/Documents.js)
- Sidebar: **Documents**

## Tests

```bash
cd backend && npm run test:documents
```

**Result:** All checks passed.

## Known Issues

- Restricted visibility is uploader-only (no custom ACL lists yet)
- Optional links to member/ministry/event are API-ready; UI upload form does not set them yet
- No full-text indexing of file contents

## Next Phase

**Phase 22 — Asset & Inventory Management**

Track church assets, assignments, and maintenance.
