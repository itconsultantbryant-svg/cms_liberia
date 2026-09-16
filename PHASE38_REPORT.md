# Phase 38 Completed: Seed Data

## Implemented

Development/demo seed that creates isolated sample tenants **without** shipping credentials to production.

| Entity | Detail |
|--------|--------|
| Superadmin | `superadmin@demo.local` |
| Churches | **Grace Community** (`demo-grace`) + **Hope Fellowship** (`demo-hope`) |
| Branches | HQ + North campus + staff login account per church |
| Admins / staff | Church admin (PRESIDENT) + branch staff (SECRETARY) each |
| Members | 5 per church (unique emails; HQ + campus split) |
| Visitors | 3 per church with follow-up statuses |
| Attendance | Summary + member attendance for Sunday service |
| Finance | Posted donation + posted expense + pending expense |
| Ministries | Youth Ministry group with a leader |
| Events | Community outreach event |

Tenant isolation is asserted during seed (Grace never contains Hope-prefixed members) and in `test:seed`.

## Production guard

`seedDemoData.js` **exits** when `NODE_ENV=production` unless both:

- `ALLOW_DEMO_SEED=1`
- `FORCE_PRODUCTION_SEED=I_UNDERSTAND`

Credentials are written only to gitignored `backend/demo-credentials.local.json` and stdout.

## Commands

```bash
cd backend
npm run seed:demo          # create if missing
npm run seed:demo:force    # wipe + recreate demo tenants
npm run test:seed
```

## Demo logins (development only)

| Role | Email | Password |
|------|-------|----------|
| Superadmin | `superadmin@demo.local` | `DemoSuper1!` |
| Grace Admin | `admin.grace@demo.local` | `DemoAdmin1!` |
| Hope Admin | `admin.hope@demo.local` | `DemoAdmin1!` |
| Grace Staff | `staff.grace@demo.local` | `DemoStaff1!` |
| Hope Staff | `staff.hope@demo.local` | `DemoStaff1!` |

**Never deploy these accounts to production.**

## Result

**`npm run test:seed` passed** (production refuse + isolation + entity counts).

## Key Files

- [`backend/scripts/seedDemoData.js`](backend/scripts/seedDemoData.js)
- [`backend/scripts/testSeedData.js`](backend/scripts/testSeedData.js)
- [`backend/.env.example`](backend/.env.example) — seed notes
- [`.gitignore`](.gitignore) — `demo-credentials.local.json`

## Next Phase

**Phase 39 — Production Deployment**
