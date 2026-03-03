# Church Management System - Quick Reference Guide

## 🚀 Quick Start

```bash
# Start Backend
cd backend && npm start

# Start Frontend (new terminal)
cd frontend && npm start

# Access System
http://localhost:3003
```

**Default Admin Credentials:**
- Email: `admin@church.com`
- Password: `admin123`

---

## 📋 System Overview

### Core Modules
1. **Members** - Manage church members
2. **Attendance** - Track service attendance
3. **Collections** - Record offerings/tithes
4. **Events** - Manage church events
5. **Groups** - Organize members into groups
6. **Reports** - Generate various reports
7. **User Management** - Admin: Create users & assign roles
8. **Role Management** - Admin: View role hierarchy

---

## 🔐 Authentication Flow

```
Register → First User = PRESIDENT, Others = RESIDENT_PASTOR
    ↓
Login → Get JWT Token + Roles
    ↓
Access Dashboard → Role-Based Features
```

---

## 👥 Role Hierarchy (7 Levels)

### Level 1: National Office
- **PRESIDENT** - Full access, manages all

### Level 2: National Sub-Offices
- **VICE_PRESIDENT_MA** - Mission + Education offices
- **MISSION_SECRETARY** - Can assign roles
- **EXECUTIVE_SECRETARY** - Own office only
- **MISSION_INSPECTORATE_NATIONAL** - Mission offices

### Level 3-7: Mission, Departments, Stations, Local
- Various roles with specific access permissions

**Total Roles**: 36+ predefined roles

---

## 🔑 Key Workflows

### Adding a Member
```
Members Page → Add Member → Fill Form → Submit
Required Role: PRESIDENT, RESIDENT_PASTOR, ASSISTANT_PASTOR, ADMINISTRATIVE_PASTOR
```

### Recording Attendance
```
Attendance Page → Select Date → Select Service → Check Members → Submit
Required Role: PRESIDENT, RESIDENT_PASTOR, ASSISTANT_PASTOR
```

### Recording Collections
```
Collections Page → Select Type → Enter Amount → Select Date → Submit
Required Role: PRESIDENT, RESIDENT_PASTOR, ADMINISTRATIVE_PASTOR
```

### Creating User Account
```
User Management → Create User → Fill Details → Select Role → Submit
Required Role: PRESIDENT or MISSION_SECRETARY
```

### Assigning Role
```
User Management → Select User → Edit Role → Choose Role → Submit
System automatically configures permissions
```

---

## 📊 Database Tables

### Core Tables
- `branches` - User accounts
- `members` - Church members
- `attendances` - Attendance records
- `collections` - Financial collections
- `events` - Church events
- `groups` - Member groups

### Role Tables
- `roles` - All system roles
- `user_roles` - User-role assignments
- `role_hierarchy` - Reporting structure
- `role_access` - Access permissions
- `departments` - Department definitions

---

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register branch
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user

### Members
- `GET /api/members` - List members
- `POST /api/members` - Create member
- `GET /api/members/:id` - Member details

### Attendance
- `GET /api/attendance/view` - View attendance
- `POST /api/attendance/submit` - Record attendance

### Collections
- `POST /api/collections/save` - Save collection
- `GET /api/collections/history` - Collection history

### Users & Roles
- `GET /api/users` - List users (admin)
- `POST /api/users` - Create user (admin)
- `GET /api/roles` - List roles
- `POST /api/roles/assign` - Assign role (admin)

---

## 🎯 Role Permissions Matrix

| Feature | PRESIDENT | RESIDENT_PASTOR | ASSISTANT_PASTOR | Others |
|---------|-----------|-----------------|------------------|--------|
| View Members | ✅ | ✅ | ✅ | ✅ |
| Add Members | ✅ | ✅ | ✅ | ❌ |
| Record Attendance | ✅ | ✅ | ✅ | ❌ |
| Record Collections | ✅ | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ |
| Assign Roles | ✅ | ❌ | ❌ | ❌ |
| View Reports | ✅ | ✅ | ✅ | ✅ |

---

## 🔄 Common Operations

### Create New Branch User
1. Login as PRESIDENT or MISSION_SECRETARY
2. Go to User Management
3. Click "Create New User Account"
4. Fill form + Select role
5. Submit → User created with permissions

### Add Church Member
1. Go to Members page
2. Click "Add Member"
3. Fill personal details
4. Upload photo (optional)
5. Submit → Member added

### Record Sunday Attendance
1. Go to Attendance page
2. Select Sunday date
3. Select "Sunday Service"
4. Check present members
5. Submit → Attendance recorded

### Record Offering
1. Go to Collections page
2. Select "Offering" type
3. Enter amount
4. Select date
5. Submit → Collection saved

### Generate Report
1. Go to Reports page
2. Select report type
3. Choose date range
4. Generate → View report

---

## 🛠️ Troubleshooting

### Can't Login
- Check email/password
- Verify backend running (port 5000)
- Check database exists

### Permission Denied
- Check user role assignment
- Verify role has required permissions
- Contact admin to update role

### Data Not Loading
- Check API endpoint
- Verify authentication token
- Check browser console

### Role Not Working
- Verify role in user_roles table
- Check role_access configuration
- Review role_hierarchy setup

---

## 📁 File Structure

```
church-management-system/
├── backend/
│   ├── routes/          # API routes
│   ├── middleware/       # Auth & role middleware
│   ├── utils/           # Utilities (RoleManager)
│   ├── scripts/         # DB initialization
│   ├── schema.sql       # Database schema
│   └── server.js        # Express server
│
├── frontend/
│   ├── src/
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   ├── context/     # Auth context
│   │   └── App.js       # Main app
│   └── public/          # Static files
│
└── WORKFLOW.md          # Complete workflow doc
```

---

## 🔒 Security Notes

- Passwords: Hashed with bcrypt (10 rounds)
- Tokens: JWT with expiration
- Authorization: Role-based middleware
- SQL Injection: Parameterized queries
- CORS: Configured for frontend origin

---

## 📞 Support

- **Documentation**: See `WORKFLOW.md` for detailed workflows
- **Setup**: See `SETUP.md` for installation
- **Issues**: Check server logs in backend directory

---

**Quick Tips:**
- First registered user = PRESIDENT (full access)
- Roles auto-configure permissions on assignment
- All API calls require authentication token
- Frontend port: 3003, Backend port: 5000
- Database: SQLite (`backend/church.db`)

