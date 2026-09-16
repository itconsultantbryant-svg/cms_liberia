# Phase 33 Completed: File Storage

## Implemented

Tenant-organized storage with validation and authorized access:

```
uploads/churches/{churchId}/branding/
uploads/churches/{churchId}/members/
uploads/churches/{churchId}/finance/
uploads/churches/{churchId}/documents/
… (events, ministries, communications, pastoral, other)
```

| Control | Detail |
|---------|--------|
| Path isolation | Per-church category directories |
| Validation | Extension, MIME, max size per category |
| Registry | `stored_files` table (church-scoped) |
| Auth download | `GET /api/files/:id` (JWT + tenant) |
| Signed URLs | `GET /api/files/signed/:token` (HMAC, TTL) |
| Direct block | `/uploads/churches/**` returns **403** |

Branding uploads and document uploads use the new storage layer. Legacy `/uploads/...` paths remain for pre-existing public files only.

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/028_file_storage.sql`](backend/migrations/028_file_storage.sql) |
| Ensure | [`backend/scripts/applyFileStorage.js`](backend/scripts/applyFileStorage.js) |
| Table | `stored_files` |
| Optional | `church_documents.stored_file_id` |

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/files/meta` | Categories & limits |
| `GET /api/files/:id` | Authenticated stream |
| `POST /api/files/:id/sign` | Issue signed URL |
| `GET /api/files/signed/:token` | Temporary access (e.g. `<img>`) |

Helper: [`backend/utils/fileStorage.js`](backend/utils/fileStorage.js)

## Tests

```bash
cd backend && npm run test:files
```

**Result:** All checks passed.

## Known Issues

- Not every legacy upload route (events/communications/members photos) is migrated yet; pattern is ready via `createUpload` + `registerStoredFile`
- Signed branding URLs expire (default 7 days on upload); re-sign via `/api/files/:id/sign` as needed

## Next Phase

**Phase 34 — Backup & Recovery**
