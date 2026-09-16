# Phase 13 Completed: Finance & Accounting

## Implemented

- Income categories: Tithes, Offerings, Donations, Pledges, Thanksgiving, Building fund, Missions, Special, Other
- Expense categories (utilities, salaries, maintenance, ministry, outreach, office, travel, other)
- Funds & accounts (General Fund / Cash defaults per church)
- Transactions with amount, currency, payment method, reference, date, branch, fund, account, donor/member, description, attachment, entered/approved by, status
- Payment methods: cash, bank, mobile money, check, card, other
- **No silent edits** of posted records — use **post**, **reverse**, or **adjust**
- Dashboard: income, expenses, net, donation trends, pledges/budget stubs
- Ledger UI at `/finance/ledger`; summary cards on Finance Dashboard

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/012_finance_accounting.sql`](backend/migrations/012_finance_accounting.sql) |
| Ensure | [`backend/scripts/applyFinanceAccounting.js`](backend/scripts/applyFinanceAccounting.js) |
| Tables | `finance_categories`, `finance_funds`, `finance_accounts`, `finance_transactions`, `finance_adjustments` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/finance/dashboard` | Income/expense/net + trends |
| `GET /api/finance/categories` | Income & expense categories |
| `GET /api/finance/funds` / `accounts` | Chart of funds/accounts |
| `GET/POST /api/finance/transactions` | List / create (draft\|pending) |
| `PUT /api/finance/transactions/:id` | Edit draft/pending only |
| `POST .../submit` | draft → pending |
| `POST .../post` | Approve & post |
| `POST .../reverse` | Void original + opposite posted entry |
| `POST .../adjust` | Linked correcting entry |

## Frontend

- [`FinanceLedger.js`](frontend/src/pages/FinanceLedger.js)
- [`FinanceDashboard.js`](frontend/src/pages/FinanceDashboard.js) — ledger summary strip

## Tests

```bash
cd backend && npm run test:finance
```

**Result:** All checks passed.

## Known Issues

- Outstanding pledges & budget performance are stubs until Phases 14–15
- Legacy collections module remains separate (not auto-synced into ledger)
- Attachment upload supported on create; UI form is JSON-only for now

## Next Phase

**Phase 14 — Pledges & Donations**

Pledge tracking, partial payments, receipts with branding.
