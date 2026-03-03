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

- Deploying with the included Blueprint (`render.yaml`)
- Environment variables (`JWT_SECRET`, optional `DATABASE_PATH` for persistent SQLite)
- Using a persistent disk so data survives deploys

Build and start are configured in the root `package.json`: the backend serves the built React app and the API.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new branch
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

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
