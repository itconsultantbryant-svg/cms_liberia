# Phase 4 Completed: Church Branding / Theming

## Implemented

- Tenant branding API under `/api/church/branding` (get, patch, logo/favicon upload)
- `churchSummary` / `/me` expose `primaryColor`, `secondaryColor`, `logoUrl`, `faviconUrl`, `timezone`
- Frontend `ThemeProvider` applies CSS variables `--church-primary` / `--church-secondary`
- Sidebar uses church logo + short/name and themed colors
- Church Branding settings page at `/settings/branding` (President / Mission Secretary / `isadmin`)
- Primary buttons and profile badge follow secondary accent color

## Database

No new migration — uses existing `churches` branding columns from Phase 1 (`logo_url`, `favicon_url`, `primary_color`, `secondary_color`, `website_url`, `timezone`, etc.).

Uploads stored under `backend/uploads/branding/`.

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/church/branding` | Own church branding (tenant-scoped) |
| `PATCH /api/church/branding` | Update name, colors, website, timezone, contact (admin roles) |
| `POST /api/church/branding/logo` | Multipart image upload → `logo_url` |
| `POST /api/church/branding/favicon` | Multipart image upload → `favicon_url` |

## Frontend Changes

- [`ThemeContext.js`](frontend/src/context/ThemeContext.js) — CSS vars + favicon/title
- [`ChurchBranding.js`](frontend/src/pages/ChurchBranding.js) — settings UI with live preview
- [`Layout.js`](frontend/src/components/Layout.js) / CSS — logo + `var(--church-primary)`
- Sidebar item **Church Branding** under Administration
- AuthContext: `fetchUser`, `applyChurchBranding` for live theme refresh

## Security Checks

- Branding routes use `requireTenant` — churches only edit their own tenant
- Mutations require church admin (`isadmin` / PRESIDENT / MISSION_SECRETARY)
- Hex color validation on primary/secondary
- Image-only uploads, 2MB limit

## Tests

```bash
cd backend && npm run test:branding
```

**Result:** All checks passed (patch colors, reject bad hex, logo upload, `/me` reflects changes, cross-tenant isolation).

## Known Issues

- Not every legacy hardcoded hex in older page CSS is converted (sidebar/top accents + primary buttons are)
- Superadmin portal does not yet edit logos (church portal owns branding; Superadmin can still patch colors via Phase 3 API)
- Full white-label email templates / PDF letterheads deferred

## Next Phase

**Phase 5** (roadmap): continue multi-tenant SaaS build-out — typically subscriptions/billing or deeper church onboarding, per original product plan. Confirm next priority before implementing.
