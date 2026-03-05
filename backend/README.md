# Backend API

Express.js backend for Church Management System.

## Setup

1. Install dependencies: `npm install`
2. Initialize database: `npm run init-db`
3. Start server: `npm start` (or `npm run dev` for development with nodemon)

## Environment Variables

Create a `.env` file:
```
PORT=5000
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

## Database

SQLite database file: `database.sqlite`

To reset the database, delete `database.sqlite` and run `npm run init-db` again.

### Migrations (existing databases)

If you have an existing database and need branch permissions and payroll tables, run:
`sqlite3 database.sqlite < migrations/001_branch_permissions_and_payroll.sql`
(If the `permissions` column already exists on `branches`, skip the ALTER and run only the CREATE TABLE statements.)

## User login credentials

There are two ways to get your first login:

### Option A: Register the first user (recommended for production)

1. Open the app and go to **Register** (e.g. `/register`).
2. Create a branch with your chosen **email** and **password**.
3. The **first** registered branch becomes the super-admin (President). Use that email and password to log in.

### Option B: Default admin (for local/testing)

Run the create-admin script to add a predefined admin user:

```bash
cd backend
npm run create-admin
```

Then log in with:

| Field     | Value              |
|----------|--------------------|
| **Email**    | `admin@church.com` |
| **Password** | `admin123`         |

This user has the **President** role (full access). Change the password after first login.

