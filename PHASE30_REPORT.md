# Phase 30 Completed: Dashboard Personalization

## Implemented

Home dashboard content depends on role (persona):

| Persona | Primary view | Scope |
|---------|--------------|-------|
| **Superadmin** | Redirect to Superadmin portal | Platform |
| **Church Admin** | Church Admin overview | Church-wide |
| **Finance Officer** | Finance dashboard | Church |
| **Pastor** | Personalized high-level widgets | Branch or church |
| **Membership / secretary roles** | Membership-focused widgets | Branch-aware |
| **Branch / ops sub-user** | Secretary dashboard | Branch |
| **Executive / VP** | VP dashboard | Church |
| **Request managers** | Mission Secretary dashboard | Church |

Users can **Customize** personalized dashboards (hide widgets). Preferences persist per user/church.

## Database

| Change | Detail |
|--------|--------|
| Migration | [`backend/migrations/027_dashboard_preferences.sql`](backend/migrations/027_dashboard_preferences.sql) |
| Ensure | [`backend/scripts/applyDashboardPreferences.js`](backend/scripts/applyDashboardPreferences.js) |
| Table | `user_dashboard_preferences` |

## API Changes

| Endpoint | Behavior |
|----------|----------|
| `GET /api/dashboard/persona` | Resolved persona for current user |
| `GET /api/dashboard/personalized` | Role-scoped widgets + quick links |
| `GET /api/dashboard/preferences` | Load widget prefs |
| `PATCH /api/dashboard/preferences` | Hide / reorder widgets |

Helper: [`backend/utils/dashboardPersonalization.js`](backend/utils/dashboardPersonalization.js)

## Frontend

- [`PersonalizedDashboard.js`](frontend/src/pages/PersonalizedDashboard.js) — widget grid + customize
- [`RoleBasedDashboard.js`](frontend/src/components/RoleBasedDashboard.js) — routes by persona

## Tests

```bash
cd backend && npm run test:dashboard
```

**Result:** All checks passed.

## Known Issues

- Finance / church-admin still use their dedicated dashboards (not the widget customizer)
- Widget order UI saves catalog order; drag-and-drop reorder not included

## Next Phase

**Phase 31 — API Architecture**
