# Database

SQLite is the system of record. Schema lives in `backend/schema.sql` (and related schema_* files) plus incremental migrations in `backend/migrations/`.

## Isolation column

Almost all operational tables include **`church_id`** referencing `churches.id`. Application code scopes queries with the JWT-derived church id — never a client-supplied tenant id. See [TENANT_ISOLATION.md](TENANT_ISOLATION.md).

## Major tables by domain

### Tenants & organization

| Table | Purpose |
|-------|---------|
| `churches` | Tenant root (name, slug, branding, status) |
| `branches` | Campuses / HQ accounts; platform & church admin flags |
| `church_domains` | Custom domains / verification |
| `church_settings` | Fiscal year, numbering, prefs |
| `currencies` | Global currency catalog (USD & LRD are system) |
| `church_currencies` | Per-church enabled currencies + default |
| `user_branch_access` | User ↔ branch visibility |

### Auth & accounts

| Table | Purpose |
|-------|---------|
| `sub_users` | Staff users under a church |
| `password_reset_tokens` | Hashed reset tokens |
| `user_invites` | Invitation flow (where used) |

Auth columns on `branches` / `sub_users`: `failed_login_attempts`, `locked_until`, `token_version`, MFA-ready fields.

### Platform

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Plan catalog |
| `church_subscriptions` | Per-church plan & status |
| `support_sessions` | Time-boxed support access |
| `backup_jobs` | Backup job metadata |

### RBAC

| Table | Purpose |
|-------|---------|
| `roles` | System + custom church roles |
| `role_hierarchy` / `role_access` | Hierarchy / access metadata |
| `user_roles` | Assignment of roles to users |
| `permissions` | Canonical permission keys |
| `role_permissions` | Role → permission grants |

### People

| Table | Purpose |
|-------|---------|
| `members` | Member profiles |
| `member_documents` | Member file links |
| `households` / `household_members` | Families |
| `visitors` / `visitor_followups` | Visitor pipeline |

### Services & attendance

| Table | Purpose |
|-------|---------|
| `service_types` / `service_templates` | Service definitions |
| `attendances` / `member_attendances` | Check-in records |

### Finance

| Table | Purpose |
|-------|---------|
| `finance_categories`, `finance_funds`, `finance_accounts` | Chart structure |
| `finance_transactions`, `finance_adjustments` | Ledger |
| `donors`, `pledges`, `pledge_payments`, `donations`, `receipts` | Giving |
| `budgets`, `budget_lines` | Budget vs actual |
| Legacy `collections*` / `payments` | Older collections flows |

### Ministry life

| Table | Purpose |
|-------|---------|
| `groups`, `group_members`, meetings/announcements/documents | Ministries |
| `departments` | Org structure |
| `events`, `event_registrations`, `event_attachments` | Calendar |
| `pastoral_cases`, `pastoral_notes`, `pastoral_visits` | Confidential care |

### Ops & content

| Table | Purpose |
|-------|---------|
| `communications`, announcements, templates, reminder_queue | Messaging |
| `staff`, `payroll_runs`, `payroll_entries` | HR / payroll |
| `document_categories`, `church_documents`, `document_versions` | Docs |
| `stored_files` | File metadata (private storage) |
| `assets`, `asset_history`, `asset_maintenance` | Inventory |
| `approval_workflows`, `workflow_requests` | Approvals |
| `notifications`, `audit_logs` | Alerts & immutable audit |
| `user_dashboard_preferences` | Dashboard personalization |

## Relationships (high level)

```
churches
  ├── branches (church_id)
  ├── church_domains (church_id)
  ├── church_settings (church_id)
  ├── roles / permissions (church-scoped custom roles)
  ├── members, visitors, households (church_id)
  ├── finance_* , donations, budgets (church_id)
  ├── events, groups, pastoral_*, documents, assets (church_id)
  └── church_subscriptions → subscription_plans
```

`branches` and `sub_users` gain roles through `user_roles`. Audit and notifications are always written with the acting user’s church context.

## Migrations

Run after pull or on deploy:

```bash
cd backend && npm run migrate
# staging/production build path:
cd backend && npm run migrate:deploy
```

Do not hand-edit production schema outside migrations.
