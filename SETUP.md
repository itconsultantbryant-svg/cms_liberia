# Setup Instructions

## Quick Start

1. **Install dependencies for both backend and frontend:**
   ```bash
   npm run install-all
   ```

2. **Initialize the database:**
   ```bash
   npm run init-db
   ```

3. **Start both servers:**
   ```bash
   npm start
   ```
   Or use the start script:
   ```bash
   ./start.sh
   ```

## Manual Start

### Backend (Terminal 1)
```bash
cd backend
npm install
npm run init-db  # Only needed first time
npm start
```
Backend runs on: http://localhost:5000

### Frontend (Terminal 2)
```bash
cd frontend
npm install
npm start
```
Frontend runs on: http://localhost:3003

## First Time Setup

1. Open http://localhost:3003 in your browser
2. Click "Register" to create the first branch (this becomes super-admin)
3. Fill in the registration form
4. After registration, login with your credentials
5. Start managing your church!

## Default Credentials

After registration, use the email and password you provided during registration.

## Features Available

- ✅ Member Management
- ✅ Attendance Tracking
- ✅ Collections/Offerings
- ✅ Events & Calendar
- ✅ Groups Management
- ✅ Reports (Membership, Collections, Attendance)
- ✅ Multi-branch Support

## Troubleshooting

### Backend won't start
- Check if port 5000 is available
- Ensure SQLite database file exists: `backend/database.sqlite`
- Run `npm run init-db` to recreate database

### Frontend won't start
- Check if port 3003 is available
- Ensure backend is running first
- Clear browser cache

### Database issues
- Delete `backend/database.sqlite` and run `npm run init-db` again
- Check file permissions

## Development

### Backend Development
```bash
cd backend
npm run dev  # Uses nodemon for auto-reload
```

### Frontend Development
```bash
cd frontend
npm start  # React dev server with hot reload
```

## Production Build

### Frontend
```bash
cd frontend
npm run build
```
Build output will be in `frontend/build/`

### Backend
The backend is already production-ready. Just ensure:
- Set `NODE_ENV=production` in `.env`
- Use a strong `JWT_SECRET`
- Configure proper CORS settings if needed

