# Phase 8 Completed: Approval Workflow Engine

## Implemented

- Configurable **approval workflows** (platform defaults + church overrides)
- **Workflow requests** with statuses: draft / pending / approved / rejected / cancelled
- Self-approval blocked by default (`allow_self_approve = 0`)
- Member deletion routed through workflow (`202` until approved)
- Approvals UI at `/workflows`
- Legacy pastor `pending_approvals` left intact for older flows

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/007_approval_workflows.sql`](backend/migrations/007_approval_workflows.sql) |
| Seed | [`backend/scripts/applyApprovalWorkflows.js`](backend/scripts/applyApprovalWorkflows.js) |
| Tables | `approval_workflows`, `workflow_requests` |

Default action types: `member_delete`, `expense_approval`, `role_change`, `user_delete`, `financial_adjustment`, `budget_approval`.

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/workflows/definitions` | Platform + church workflow templates |
| `PUT /api/workflows/definitions/:actionType` | Upsert church override |
| `GET /api/workflows/requests` | List requests (`status`, `actionType`, `mine`) |
| `POST /api/workflows/requests` | Submit generic request |
| `POST /api/workflows/requests/:id/decide` | Approve / reject |
| `POST /api/workflows/requests/:id/cancel` | Cancel (requester or admin) |
| `DELETE /api/members/:id` | Creates pending `member_delete` request when workflow requires approval |

Helpers: [`backend/utils/workflowEngine.js`](backend/utils/workflowEngine.js)

## Frontend

- [`WorkflowApprovals.js`](frontend/src/pages/WorkflowApprovals.js) — pending queue, decide, definitions
- Nav item **Approvals** → `/workflows`
- Dashboard quick link updated to `/workflows`

## Security Checks

- Self-approval rejected (**403**) even for church admins when policy disallows it
- Cross-approver (co-admin) can approve; action executes only after approval
- Requests are tenant-scoped (`church_id`)

## Tests

```bash
cd backend && npm run test:approvals
```

**Result:** All checks passed.

## Known Issues

- Only member deletion is fully wired to execute on approve; other action types soft-complete (audit payload retained)
- Legacy Mission Secretary `/mission-secretary` approvals remain separate from the new engine
- Expense / role-change UIs do not yet submit via `/api/workflows/requests` by default

## Next Phase

**Phase 9 — Member Management**

Comprehensive membership profiles, search/filter/pagination, import/export, and bulk operations.
