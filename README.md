# Church Management System

A modern web application for managing church operations, built with React and Node.js/Express, using SQLite as the database.

## Features

- **Member Management**: Register and manage church members with detailed profiles
- **Attendance Tracking**: Record and track attendance by service type
- **Collections Management**: Record offerings, tithes, and other collections
- **Events & Calendar**: Manage church events and announcements
- **Groups**: Create and manage member groups
- **Reports**: Generate membership, collections, and attendance reports
- **Multi-Branch Support**: Support for multiple church branches

## Technology Stack

- **Frontend**: React 18, React Router
- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Authentication**: JWT (JSON Web Tokens)

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Initialize the database:
```bash
npm run init-db
```

4. Start the backend server:
```bash
npm start
```

The backend server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3003`

## Usage

1. Register a new branch (first branch becomes super-admin)
2. Login with your credentials
3. Start managing members, attendance, collections, and events

## Deployment (Render)

The app can be deployed as a single Web Service on [Render](https://render.com). See **[DEPLOYMENT.md](DEPLOYMENT.md)** for:

- Development / staging / production environments
- Environment variables (`JWT_SECRET`, `CORS_ORIGIN`, `APP_URL`, `DATABASE_PATH`, SMTP, logging)
- Persistent disk for SQLite + uploads/backups
- Pre-deploy checks, controlled migrations, health/readiness probes

Build and start are configured in the root `package.json`: the backend serves the built React app and the API.

## Documentation (Phase 43)

Full technical docs and operator manuals:

- **[docs/README.md](docs/README.md)** — index (architecture, database, auth, authorization, tenant isolation)
- Environment variable names: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) and root [`.env.example`](.env.example)
- [docs/SUPERADMIN_MANUAL.md](docs/SUPERADMIN_MANUAL.md) · [docs/CHURCH_ADMIN_MANUAL.md](docs/CHURCH_ADMIN_MANUAL.md)
- Deployment: **[DEPLOYMENT.md](DEPLOYMENT.md)** · **[docs/DEPLOY_VERCEL_RENDER_NEON.md](docs/DEPLOY_VERCEL_RENDER_NEON.md)** (Vercel + Render + Neon)

## Multi-tenant foundation (Phase 1)

See **[PHASE1_REPORT.md](PHASE1_REPORT.md)** for the churches/tenant layer, isolation middleware, and verification tests.

## Authentication & security (Phase 2)

See **[PHASE2_REPORT.md](PHASE2_REPORT.md)** for password reset/change, lockout, rate limits, token versioning, and helmet/CORS.

## Superadmin portal (Phase 3)

See **[PHASE3_REPORT.md](PHASE3_REPORT.md)** for platform church management.

## Church branding (Phase 4)

See **[PHASE4_REPORT.md](PHASE4_REPORT.md)** for logo/colors theme and `/settings/branding`.

## Church administration (Phase 5)

See **[PHASE5_REPORT.md](PHASE5_REPORT.md)** for multi church-admins and the church admin dashboard.

## Branch management (Phase 6)

See **[PHASE6_REPORT.md](PHASE6_REPORT.md)** for campuses, HQ, and branch context switching.

## Role-based access control (Phase 7)

See **[PHASE7_REPORT.md](PHASE7_REPORT.md)** for granular permissions and custom church roles.

## Approval workflows (Phase 8)

See **[PHASE8_REPORT.md](PHASE8_REPORT.md)** for configurable approvals and member-delete gating.

## Member management (Phase 9)

See **[PHASE9_REPORT.md](PHASE9_REPORT.md)** for extended profiles, search/filter/pagination, import/export.

## Households & families (Phase 10)

See **[PHASE10_REPORT.md](PHASE10_REPORT.md)** for household profiles and family relationships.

## Visitors & follow-up (Phase 11)

See **[PHASE11_REPORT.md](PHASE11_REPORT.md)** for visitor registration, pipeline, and convert-to-member.

## Services & attendance (Phase 12)

See **[PHASE12_REPORT.md](PHASE12_REPORT.md)** for service types, check-in, and attendance statistics.

## Finance & accounting (Phase 13)

See **[PHASE13_REPORT.md](PHASE13_REPORT.md)** for ledger, categories, posting, and reversals.

## Pledges & donations (Phase 14)

See **[PHASE14_REPORT.md](PHASE14_REPORT.md)** for pledges, gifts, receipts, and donor statements.

## Budgets (Phase 15)

See **[PHASE15_REPORT.md](PHASE15_REPORT.md)** for budget workflow and variance reports.

Promote an existing branch login:

```bash
cd backend && npm run create-platform-admin -- you@example.com
```

After pull or fresh DB:

```bash
cd backend && npm run migrate
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new church (tenant) + HQ branch
- `POST /api/auth/login` - Login (lockout after 5 failures)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password (returns new token)
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/logout` - Invalidate current sessions (token version bump)

### Superadmin (platform)
- `GET /api/superadmin/stats` - Platform overview
- `GET /api/superadmin/churches` - List tenants
- `GET /api/superadmin/churches/:id` - Tenant detail
- `POST /api/superadmin/churches` - Create tenant
- `PATCH /api/superadmin/churches/:id` - Update tenant
- `PATCH /api/superadmin/churches/:id/status` - Suspend / activate / archive

### Members
- `GET /api/members` - Get all members
- `GET /api/members/:id` - Get member details
- `POST /api/members` - Create member (admin only)
- `PUT /api/members/:id` - Update member (admin only)
- `DELETE /api/members/:id` - Delete member (admin only)

### Attendance
- `GET /api/attendance/view` - Get all attendances
- `GET /api/attendance/view/:date` - Get attendance by date
- `POST /api/attendance/submit` - Save attendance (admin only)
- `POST /api/attendance/mark` - Mark member attendance (admin only)

### Collections
- `GET /api/collections/offering` - Get collection form data
- `POST /api/collections/save` - Save branch collection (admin only)
- `POST /api/collections/member` - Save member collection (admin only)
- `GET /api/collections/history` - Get collection history

### Events
- `GET /api/events` - Get all events
- `POST /api/events` - Create event (admin only)
- `DELETE /api/events/:id` - Delete event (admin only)

### Groups
- `GET /api/groups` - Get all groups
- `POST /api/groups/create` - Create group (admin only)
- `DELETE /api/groups/:id` - Delete group (admin only)

## License

MIT
