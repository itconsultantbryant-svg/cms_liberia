# Phase 22 Completed: Asset & Inventory Management

## Implemented

- Church asset registry for vehicles, musical gear, computers, furniture, property, sound, generators, office equipment
- Fields: asset code, description, purchase value/date, location, branch, custodian, condition, status
- Optional link to supporting document (`document_id`)
- Assignment / relocation with history
- Maintenance logs (cost, vendor, next service)
- Full asset history trail
- Soft dispose (hard delete via `?hard=1`)
- UI at `/assets` and `/assets/:id`

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/021_assets.sql`](backend/migrations/021_assets.sql) |
| Ensure | [`backend/scripts/applyAssets.js`](backend/scripts/applyAssets.js) |
| Tables | `assets`, `asset_history`, `asset_maintenance` |
| Permissions | `assets.view`, `assets.manage` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/assets/meta` | Categories, conditions, statuses |
| `GET /api/assets` | List + totals (filters) |
| `POST /api/assets` | Register asset (auto code) |
| `GET /api/assets/:id` | Detail + history + maintenance |
| `PATCH /api/assets/:id` | Update + history event |
| `POST /api/assets/:id/assign` | Relocate / change custodian |
| `POST /api/assets/:id/maintenance` | Service record |
| `DELETE /api/assets/:id` | Dispose (or hard delete) |

## Frontend

- [`Assets.js`](frontend/src/pages/Assets.js)
- [`AssetDetail.js`](frontend/src/pages/AssetDetail.js)

## Tests

```bash
cd backend && npm run test:assets
```

**Result:** All checks passed.

## Known Issues

- Supporting document picker not in UI (API accepts `documentId`)
- No depreciation / amortization modeling
- Custodian member/staff pickers not wired in UI (name field used)

## Next Phase

**Phase 23 — Reporting & Analytics**

Cross-module church reports and dashboards.
