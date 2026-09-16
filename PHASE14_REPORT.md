# Phase 14 Completed: Pledges & Donations

## Implemented

- Individual & organizational **donors**
- **Pledges** with partial payments, outstanding balances, payment history
- **Anonymous donations**
- **Donor statements** (pledges, gifts, payments, receipts)
- Unique **receipt numbers** with church branding (logo, colors, contact)
- Payments optionally post to Phase 13 finance ledger
- Finance dashboard outstanding pledges now live

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/013_pledges_donations.sql`](backend/migrations/013_pledges_donations.sql) |
| Ensure | [`backend/scripts/applyPledgesDonations.js`](backend/scripts/applyPledgesDonations.js) |
| Tables | `donors`, `pledges`, `pledge_payments`, `donations`, `receipts` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET/POST /api/pledges/donors` | Donor directory |
| `GET /api/pledges/donors/:id/statement` | Full donor statement |
| `GET/POST /api/pledges/pledges` | List / create pledges |
| `POST /api/pledges/pledges/:id/payments` | Partial/full payment + receipt |
| `GET/POST /api/pledges/donations` | List / record (incl. anonymous) |
| `GET /api/pledges/receipts` | Receipt list |
| `GET /api/pledges/receipts/:id` | Receipt + branding payload |
| `GET /api/finance/dashboard` | `outstandingPledges` from live data |

## Frontend

- [`PledgesDonations.js`](frontend/src/pages/PledgesDonations.js) — `/pledges`
- [`ReceiptView.js`](frontend/src/pages/ReceiptView.js) — branded printable receipt
- [`DonorStatement.js`](frontend/src/pages/DonorStatement.js)

## Tests

```bash
cd backend && npm run test:pledges
```

**Result:** All checks passed.

## Known Issues

- Recurring pledge schedules are stored as frequency metadata (no auto-invoice generation yet)
- Receipt logo URLs depend on branding upload paths
- API paths are nested under `/api/pledges/*` (e.g. `/api/pledges/pledges`)

## Next Phase

**Phase 15 — Budget Management**

Draft → Approved budgets with budget-vs-actual variance reports.
