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

