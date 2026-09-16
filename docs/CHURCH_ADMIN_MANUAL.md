# Church Admin Manual

Church administrators operate a single tenant: their church and its branches. Data never includes other churches.

**Typical login:** church-admin / PRESIDENT branch account  
**Portal:** app shell after login (dashboard + sidebar)

## Branch management

**UI:** `/branches`  
Create campuses, mark HQ, and switch branch context where supported. Branch access for users is controlled via roles and `user_branch_access`.

## Members

**UI:** `/members`, `/members/new`, member profile/edit  

- Search, filter, paginate, and export members  
- Maintain profiles and related documents  
- Households: `/households`  
- Visitors & follow-up: `/visitors` (convert to member when ready)

Destructive deletes may require **approval workflows** (`/workflows`) depending on configuration.

## Users

**UI:** `/users`  

Invite or create sub-users, assign roles, and deactivate accounts. Users only see sidebar items their permissions allow.

## Roles

**UI:** `/roles`  

Assign granular permissions to system or custom roles. Sensitive areas (e.g. pastoral care) should be granted deliberately.

## Attendance

**UI:** `/services`, `/attendance`  

Define service types and record attendance / check-in. Use reports for trends.

## Finance

**UI:** `/finance`, `/finance/ledger`, `/pledges`, `/budgets`, `/collections`  

- Record income/expenses; post and reverse carefully  
- Pledges, donations, receipts, donor statements  
- Budgets and variance  
- Approvals may route through workflows for expenses

Only users with finance permissions should access ledger routes.

## Events

**UI:** `/events`  

Create calendar events, registrations, and related attachments. Ministries/groups: `/groups`.

## Reports

**UI:** `/reports` (and dashboard widgets)  

Membership, attendance, finance, and ministry analytics scoped to your church. Export where permitted.

## Currencies

USD and LRD are always available for finance, pledges, donations, budgets, payroll, and related money fields.

Under **Settings**:

- Set the **default currency**
- Enable or add extra currencies (code, name, symbol)
- Disable non-system currencies when no longer needed

API: `GET/POST /api/church/currencies`, `PATCH/DELETE /api/church/currencies/:code`

## Settings

| Path | Purpose |
|------|---------|
| `/settings` | Church profile, fiscal year, numbering, preferences, currencies |
| `/settings/branding` | Logo, colors, identity (tenant theme) |
| `/settings/admins` | Additional church administrators |

Custom domains (when enabled): manage via tenant domain APIs / settings flows so `GET /api/tenant/resolve` returns your branding on your Host.

## Other modules (permission-gated)

| Area | Path |
|------|------|
| Communications | `/communications` |
| Documents | `/documents` |
| Assets | `/assets` |
| Staff / payroll | `/staff`, `/payroll` |
| Pastoral care | `/pastoral` (confidential) |
| Audit log | `/audit` |
| Notifications | `/notifications` |
| Approvals | `/workflows` |

## Branding checklist

1. Upload logo and set primary/secondary colors  
2. Confirm login Host resolve shows correct church name/logo  
3. Verify sidebar and dashboards use theme tokens  

## Security habits

- Prefer least-privilege roles  
- End sessions via logout (invalidates JWTs)  
- Do not share admin passwords; create named users  
- Treat pastoral and finance data as confidential
