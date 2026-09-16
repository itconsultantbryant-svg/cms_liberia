# Phase 15 Completed: Budget Management

## Implemented

- Church (and branch) budgets with income/expense lines tied to finance categories
- Workflow: **Draft → Submitted → Approved → Active → Closed**
- Budget vs actual variance reports (by line and totals)
- Only one **active** budget per church fiscal year (prior active auto-closed)
- Finance dashboard **budget performance** from the active budget
- UI at `/budgets` and `/budgets/:id`

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/014_budgets.sql`](backend/migrations/014_budgets.sql) |
| Ensure | [`backend/scripts/applyBudgets.js`](backend/scripts/applyBudgets.js) |
| Tables | `budgets`, `budget_lines` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET/POST /api/budgets` | List / create (draft + lines) |
| `GET /api/budgets/:id` | Detail + lines + variance when applicable |
| `PUT /api/budgets/:id/lines` | Replace lines (draft only) |
| `POST .../submit` | draft → submitted |
| `POST .../approve` | submitted → approved |
| `POST .../activate` | approved → active |
| `POST .../close` | active/approved → closed |
| `POST .../reopen-draft` | submitted → draft |
| `GET .../variance` | Budget vs actual report |
| `GET /api/finance/dashboard` | Live `budgetPerformance` |

## Frontend

- [`Budgets.js`](frontend/src/pages/Budgets.js)
- [`BudgetDetail.js`](frontend/src/pages/BudgetDetail.js) — variance table
- Finance ledger summary shows active budget performance

## Tests

```bash
cd backend && npm run test:budgets
```

**Result:** All checks passed.

## Known Issues

- Monthly/phased budget allocation not modeled (annual lines only)
- Branch-scoped budgets supported in API; UI creates church-wide by default
- Income actuals without matching category_id roll into uncategorized comparisons carefully

## Next Phase

**Phase 16 — Ministries, Departments & Groups**

Configurable church org structures (choir, youth, etc.) with leads and membership.
