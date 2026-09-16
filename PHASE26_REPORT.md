# Phase 26 Completed: Subscriptions & SaaS Management

## Implemented

- Subscription plans: Trial, Basic, Standard, Professional, Enterprise
- Plan limits: members, users, branches, storage; feature flags (finance, reporting, communications, advanced)
- Church subscription statuses: trial, active, grace_period, past_due, suspended, cancelled
- **Never deletes church data** on expiry/suspend/cancel
- Superadmin plan list + assign/change subscription on church detail
- Tenant read-only `GET /api/church/subscription`
- Soft create limits on members & branches
- New churches auto-assigned Trial

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/024_subscriptions.sql`](backend/migrations/024_subscriptions.sql) |
| Ensure | [`backend/scripts/applySubscriptions.js`](backend/scripts/applySubscriptions.js) |
| Helpers | [`backend/utils/subscriptions.js`](backend/utils/subscriptions.js) |
| Columns | `churches.subscription_status`, `churches.subscription_plan_id` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/superadmin/plans` | List plans |
| `POST /api/superadmin/plans` | Create plan |
| `PATCH /api/superadmin/plans/:id` | Update plan |
| `PUT /api/superadmin/churches/:id/subscription` | Assign plan + status |
| `PATCH /api/superadmin/churches/:id/subscription/status` | Status only |
| `GET /api/superadmin/churches/:id/subscription` | Church sub + usage |
| `GET /api/church/subscription` | Tenant view of own plan |

## Frontend

- Superadmin portal: **Plans** tab + subscription controls on church detail

## Tests

```bash
cd backend && npm run test:subscriptions
```

**Result:** All checks passed.

## Known Issues

- No payment gateway / invoicing yet
- Storage_mb is recorded but not enforced against uploads
- Feature flags stored but not yet gating every UI module

## Next Phase

**Phase 27 — Superadmin Impersonation / Support Access**

Controlled church context entry with clear banner; all actions attributed to Superadmin and fully audited.
