# Church Management System - Complete Workflow Documentation

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Authentication & Authorization Flow](#authentication--authorization-flow)
3. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
4. [Core Feature Workflows](#core-feature-workflows)
5. [User Management Workflow](#user-management-workflow)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [API Workflow](#api-workflow)

---

## System Architecture

### Technology Stack
- **Frontend**: React 18.2.0 with React Router 6.16.0
- **Backend**: Node.js with Express.js
- **Database**: SQLite3
- **Authentication**: JWT (JSON Web Tokens)
- **HTTP Client**: Axios
- **Ports**: 
  - Backend: `http://localhost:5000`
  - Frontend: `http://localhost:3003`

### System Components
```
┌─────────────────┐
│   React Frontend │
│   (Port 3003)    │
└────────┬─────────┘
         │ HTTP/REST API
         │
┌────────▼─────────┐
│  Express Backend  │
│   (Port 5000)    │
└────────┬─────────┘
         │
┌────────▼─────────┐
│   SQLite DB      │
│  (church.db)     │
└──────────────────┘
```

---

## Authentication & Authorization Flow

### 1. Registration Flow
```
User → Register Page → Fill Form → POST /api/auth/register
  ↓
Backend validates → Create Branch → Assign Role (First = PRESIDENT, Others = RESIDENT_PASTOR)
  ↓
Return Success → Redirect to Login
```

**Registration Process:**
- First registered branch automatically gets `PRESIDENT` role
- Subsequent branches get `RESIDENT_PASTOR` role
- Creates entry in `branches` table
- Creates default admin member for the branch
- Returns success message

### 2. Login Flow
```
User → Login Page → Enter Credentials → POST /api/auth/login
  ↓
Backend validates email/password → Check user exists → Verify password
  ↓
Generate JWT Token → Fetch user roles → Return token + user data + roles
  ↓
Frontend stores token → Store user info + roles → Redirect to Dashboard
```

**Login Response Includes:**
- JWT token
- User information (branch details)
- User roles array
- Primary role (highest level role)
- Admin status

### 3. Protected Route Flow
```
User navigates → PrivateRoute checks → Is authenticated?
  ↓ NO                          ↓ YES
Redirect to Login → Check token → Load user data → Render page
```

**Token Management:**
- Token stored in localStorage
- Token included in Authorization header for API calls
- Token expires after 24 hours (configurable)
- Auto-logout on token expiration

---

## Role-Based Access Control (RBAC)

### Role Hierarchy Structure

The system implements a 7-level hierarchical role structure:

#### Level 1: National Office
- **PRESIDENT** - Head of Mission
  - Access: All offices
  - Reports to: None (Top level)
  - Can: Manage all users, assign roles, view all data

#### Level 2: National Office (Sub-level)
- **VICE_PRESIDENT_MA** - Vice President
  - Access: Mission Office + Education Office
  - Reports to: President
  
- **MISSION_INSPECTORATE_NATIONAL** - Mission Inspectorate Pastor
  - Access: All Mission Office departments
  - Reports to: Vice President MA

- **EXECUTIVE_SECRETARY** - Executive Secretary
  - Access: Own office only
  - Reports to: All National offices except Mission Secretary

- **MISSION_SECRETARY** - Mission Secretary
  - Access: All Mission Office departments
  - Reports to: All National offices except Executive Secretary
  - Can: Assign roles, manage users

#### Level 3: Mission Office
- **VICE_PRESIDENT_MISSION** - Vice President (Mission)
- **MISSION_INSPECTORATE_MISSION** - Mission Inspectorate Pastor
- **MISSION_SECRETARY_MISSION** - Mission Secretary
- **EDUCATION_SECRETARY** - Education Secretary

#### Level 4: Departments
- **PERSONNEL_OFFICER** - Personnel Department
- **DIRECTOR_PRIMARY_SECONDARY** - Education Department
- **DIRECTOR_HIGHER_LEARNING** - Higher Learning Department

#### Level 5: Sub-Departments
- **HOME_MISSION_PASTOR** - Home Mission Department
- **FOREIGN_MISSION_PASTOR** - Foreign Mission Department
- **PRIMARY_SECONDARY_SCHOOL** - Primary/Secondary Schools
- **HIGHER_LEARNING** - Higher Learning Institutions

#### Level 6: Station Offices
- **STATE_COUNTY_PASTOR** - State/County Pastors
- **REGIONAL_PASTOR** - Regional Pastors
- **NATIONAL_PASTOR** - National Pastors

#### Level 7: Local Offices
- **RESIDENT_PASTOR** - Resident Pastor
- **ASSISTANT_PASTOR** - Assistant Pastor
- **ADMINISTRATIVE_PASTOR** - Administrative Pastor
- **AUXILIARY_STAFF** - Auxiliary Staff

### Role Assignment Workflow
```
Admin (President/Mission Secretary) → User Management Page
  ↓
Select User → Choose Role → Select Department (if applicable) → Select Location
  ↓
Submit → Backend validates → Check hierarchy → Assign role
  ↓
Create user_roles entry → Set up access permissions → Set reporting relationships
  ↓
Return success → User can now access features based on role
```

### Access Control Implementation
- **Middleware**: `requireRole()` checks user's role before allowing access
- **Frontend**: Conditional rendering based on `user.primaryRole`
- **API**: Role-based middleware on protected endpoints
- **Database**: `role_access` table defines accessible offices
- **Hierarchy**: `role_hierarchy` table defines reporting structure

---

## Core Feature Workflows

### 1. Member Management Workflow

#### Adding a Member
```
Authorized User → Members Page → Click "Add Member"
  ↓
Fill Member Form:
  - Personal Info (name, email, phone, DOB)
  - Address Details
  - Position (worker, pastor, elder, member, etc.)
  - Marital Status
  - Photo Upload (optional)
  ↓
Submit → POST /api/members
  ↓
Backend validates → Check role permissions → Create member record
  ↓
Return success → Refresh member list → Show new member
```

**Required Permissions:**
- Roles: PRESIDENT, RESIDENT_PASTOR, ASSISTANT_PASTOR, ADMINISTRATIVE_PASTOR
- Can view: All authenticated users
- Can edit/delete: Only authorized roles

#### Viewing Member Profile
```
User → Members List → Click Member Name
  ↓
GET /api/members/:id → Fetch member details
  ↓
Display:
  - Personal Information
  - Contact Details
  - Attendance History
  - Collection History
  - Group Memberships
  - Photo
```

### 2. Attendance Tracking Workflow

#### Recording Attendance
```
Authorized User → Attendance Page → Select Date → Select Service Type
  ↓
Display Member List → Check boxes for present members
  ↓
Submit → POST /api/attendance/submit
  ↓
Backend creates attendance record → Creates member_attendances entries
  ↓
Return success → Show attendance summary
```

**Service Types:**
- Sunday Service
- Midweek Service
- Prayer Meeting
- Bible Study
- Special Service

#### Viewing Attendance
```
User → Attendance Page → Select Date Range
  ↓
GET /api/attendance/view?start=DATE&end=DATE
  ↓
Display:
  - Total Attendance by Date
  - Attendance by Service Type
  - Member Attendance History
  - Statistics and Trends
```

### 3. Collections Management Workflow

#### Recording Branch Collection
```
Authorized User → Collections Page → Select Collection Type
  ↓
Enter Amount → Select Date → Add Notes (optional)
  ↓
Submit → POST /api/collections/save
  ↓
Backend creates collection record → Updates totals
  ↓
Return success → Show collection summary
```

**Collection Types:**
- Offering
- Tithe
- Special Offering
- Building Fund
- Mission Fund
- Other

#### Recording Member Collection
```
User → Collections Page → "Member Collection" Tab
  ↓
Select Member → Select Collection Type → Enter Amount → Select Date
  ↓
Submit → POST /api/collections/member
  ↓
Backend creates member_collection record → Links to member
  ↓
Return success → Update member's collection history
```

#### Viewing Collection History
```
User → Collections Page → "History" Tab
  ↓
GET /api/collections/history?start=DATE&end=DATE
  ↓
Display:
  - Collections by Date
  - Collections by Type
  - Total Collections
  - Member Contributions
  - Branch Totals
```

### 4. Events & Announcements Workflow

#### Creating an Event
```
Authorized User → Events Page → Click "Add Event"
  ↓
Fill Event Form:
  - Event Title
  - Description
  - Date & Time
  - Location
  - Event Type
  ↓
Submit → POST /api/events
  ↓
Backend creates event → Creates announcement (if selected)
  ↓
Return success → Event appears in calendar → Notification sent
```

#### Viewing Events
```
User → Events Page → View Calendar/List
  ↓
GET /api/events → Fetch all events
  ↓
Display:
  - Upcoming Events
  - Past Events
  - Event Details
  - Announcements
```

### 5. Groups Management Workflow

#### Creating a Group
```
Authorized User → Groups Page → Click "Create Group"
  ↓
Enter Group Name → Select Group Type → Add Description
  ↓
Submit → POST /api/groups/create
  ↓
Backend creates group → Returns group ID
  ↓
Add Members → Select members → Add to group
  ↓
POST /api/groups/:id/members → Add members to group
```

#### Managing Group Members
```
User → Groups Page → Select Group → "Members" Tab
  ↓
View Current Members → Add/Remove Members
  ↓
POST /api/groups/:id/members → Add member
DELETE /api/groups/:id/members/:memberId → Remove member
```

### 6. Reports Generation Workflow

#### Generating Reports
```
User → Reports Page → Select Report Type
  ↓
Choose Parameters:
  - Date Range
  - Branch/Department Filter
  - Report Format
  ↓
Generate → GET /api/reports/:type?params
  ↓
Backend queries data → Formats report → Returns data
  ↓
Display Report:
  - Membership Reports
  - Attendance Reports
  - Collection Reports
  - Financial Reports
```

**Report Types:**
- Membership Statistics
- Attendance Summary
- Collection Summary
- Member Contributions
- Department Reports

---

## User Management Workflow

### Creating User Account with Role Assignment

#### Step-by-Step Process
```
Admin (President/Mission Secretary) → User Management Page
  ↓
Click "Create New User Account"
  ↓
Fill Form:
  1. Branch Information:
     - Branch Name
     - Email
     - Password
     - Address Details
  
  2. Role Assignment:
     - Select Role (from dropdown)
     - Select Department (if role requires)
     - Enter Location (country/region/state)
  
  3. Additional Details:
     - City, State, Country
     - Currency
  ↓
Submit → POST /api/users
  ↓
Backend Process:
  1. Validate email uniqueness
  2. Hash password
  3. Create branch record
  4. Assign selected role
  5. Set up role permissions automatically
  6. Configure reporting relationships
  7. Create default admin member
  ↓
Return Success → User appears in list → Can login with assigned role
```

### Editing User Roles
```
Admin → User Management → Select User → Click "Edit Role"
  ↓
Select New Role → Choose Department → Enter Location
  ↓
Submit → PUT /api/users/:id/role
  ↓
Backend updates role → Updates permissions → Updates hierarchy
  ↓
Return success → User's access updated immediately
```

### Role Permissions Auto-Configuration
When a role is assigned, the system automatically:
1. **Sets Access Permissions**: Based on `role_access` table
2. **Configures Reporting**: Based on `role_hierarchy` table
3. **Assigns Department**: Links to department if applicable
4. **Sets Location**: Records location for regional roles
5. **Enables Features**: Grants access to appropriate modules

---

## Data Flow Diagrams

### Member Creation Flow
```
Frontend Form
    ↓
POST /api/members
    ↓
authMiddleware → Verify JWT
    ↓
requireRole → Check role permissions
    ↓
Validate Data → Check duplicates
    ↓
INSERT INTO members
    ↓
Return Member Object
    ↓
Frontend Updates UI
```

### Attendance Recording Flow
```
Frontend Attendance Form
    ↓
POST /api/attendance/submit
    ↓
authMiddleware → Verify JWT
    ↓
requireRole → Check permissions
    ↓
BEGIN TRANSACTION
    ↓
INSERT INTO attendances
    ↓
FOR EACH member:
    INSERT INTO member_attendances
    ↓
COMMIT TRANSACTION
    ↓
Return Success
    ↓
Frontend Shows Summary
```

### Role Assignment Flow
```
Admin Selects User & Role
    ↓
POST /api/users/:id/roles
    ↓
authMiddleware → Verify Admin
    ↓
Check Role Hierarchy
    ↓
INSERT INTO user_roles
    ↓
Fetch Role Access Rules
    ↓
Configure Permissions
    ↓
Set Reporting Relationships
    ↓
Return Success
    ↓
User Access Updated
```

---

## API Workflow

### Request Flow
```
Client Request
    ↓
CORS Middleware
    ↓
JSON Parser
    ↓
Route Handler
    ↓
authMiddleware (if protected)
    ↓
attachRoleInfo (if role-based)
    ↓
requireRole (if specific role needed)
    ↓
Business Logic
    ↓
Database Query
    ↓
Response Formatter
    ↓
Client Response
```

### Error Handling Flow
```
Error Occurs
    ↓
Catch Block
    ↓
Log Error
    ↓
Determine Error Type:
    - Validation Error → 400
    - Authentication Error → 401
    - Authorization Error → 403
    - Not Found → 404
    - Server Error → 500
    ↓
Return Error Response
    ↓
Frontend Displays Error Message
```

### API Endpoints Summary

#### Authentication
- `POST /api/auth/register` - Register new branch
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

#### Members
- `GET /api/members` - List all members
- `GET /api/members/:id` - Get member details
- `POST /api/members` - Create member (role-protected)
- `PUT /api/members/:id` - Update member (role-protected)
- `DELETE /api/members/:id` - Delete member (role-protected)

#### Attendance
- `GET /api/attendance/view` - View attendance records
- `GET /api/attendance/view/:date` - Get attendance by date
- `POST /api/attendance/submit` - Submit attendance (role-protected)
- `POST /api/attendance/mark` - Mark individual attendance (role-protected)

#### Collections
- `GET /api/collections/offering` - Get collection form data
- `POST /api/collections/save` - Save branch collection (role-protected)
- `POST /api/collections/member` - Save member collection (role-protected)
- `GET /api/collections/history` - Get collection history

#### Events
- `GET /api/events` - Get all events
- `GET /api/events/announcements` - Get announcements
- `POST /api/events` - Create event (role-protected)
- `DELETE /api/events/:id` - Delete event (role-protected)

#### Groups
- `GET /api/groups` - Get all groups
- `POST /api/groups/create` - Create group (role-protected)
- `DELETE /api/groups/:id` - Delete group (role-protected)

#### Roles & Users
- `GET /api/roles` - Get all roles
- `GET /api/roles/hierarchy` - Get role hierarchy
- `GET /api/roles/user/:userId` - Get user roles
- `GET /api/roles/me` - Get current user roles
- `POST /api/roles/assign` - Assign role (President/Mission Secretary only)
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create user account (admin only)
- `PUT /api/users/:id/role` - Update user role (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

#### Reports
- `GET /api/reports` - Get all reports (filtered by role)
- `GET /api/reports/:id` - Get single report
- `POST /api/reports` - Create report
- `PUT /api/reports/:id` - Update report
- `POST /api/reports/:id/submit` - Submit report
- `POST /api/reports/:id/approve` - Approve report (President only)
- `DELETE /api/reports/:id` - Delete report

---

## Database Schema Overview

### Core Tables
1. **branches** - User accounts (church branches)
2. **members** - Church members
3. **attendances** - Attendance records
4. **member_attendances** - Member attendance links
5. **collections** - Branch collections
6. **member_collections** - Member contributions
7. **events** - Church events
8. **announcements** - Announcements
9. **groups** - Member groups
10. **group_members** - Group membership links

### Role Management Tables
1. **roles** - All system roles (36+ roles)
2. **departments** - Department definitions
3. **role_hierarchy** - Reporting relationships
4. **role_access** - Access permissions
5. **user_roles** - User-role assignments

### Supporting Tables
1. **service_types** - Service type definitions
2. **collections_types** - Collection type definitions
3. **settings** - System settings
4. **options** - Configuration options
5. **collection_commissions** - Commission tracking
6. **payments** - Payment records
7. **messaging** - Internal messaging

---

## Frontend Navigation Flow

### Main Navigation Structure
```
Dashboard (Home)
    ├── Members
    │   └── Member Profile
    ├── Attendance
    ├── Collections
    ├── Events
    ├── Groups
    ├── Reports
    ├── User Management (Admin Only)
    └── Role Management (Admin Only)
```

### Conditional Navigation
- **User Management**: Visible to PRESIDENT and MISSION_SECRETARY
- **Role Management**: Visible to PRESIDENT and MISSION_SECRETARY
- **Member Management**: Visible based on role permissions
- **Attendance/Collections**: Visible based on role permissions

---

## Security Features

### Authentication Security
- Password hashing using bcrypt (10 rounds)
- JWT tokens with expiration
- Token stored in localStorage
- Auto-logout on token expiration

### Authorization Security
- Role-based access control (RBAC)
- Middleware-based route protection
- Frontend conditional rendering
- API-level permission checks

### Data Security
- SQL injection prevention (parameterized queries)
- Input validation on all endpoints
- CORS configuration
- Error message sanitization

---

## System Initialization Flow

### First-Time Setup
```
1. Install Dependencies
   - Backend: npm install
   - Frontend: npm install

2. Initialize Database
   - Run: npm run init-db (backend)
   - Creates all tables
   - Inserts default roles
   - Creates departments

3. Create Admin User
   - Run: npm run create-admin (backend)
   - Creates default admin@church.com
   - Assigns PRESIDENT role

4. Start Servers
   - Backend: npm start (port 5000)
   - Frontend: npm start (port 3003)

5. Access System
   - Navigate to http://localhost:3003
   - Login with admin credentials
   - Start managing church operations
```

---

## Common User Journeys

### Journey 1: New Branch Registration
1. Navigate to Register page
2. Fill branch information
3. Submit registration
4. System assigns RESIDENT_PASTOR role
5. Redirect to login
6. Login with credentials
7. Access dashboard with assigned permissions

### Journey 2: Adding a Member
1. Login as authorized user
2. Navigate to Members page
3. Click "Add Member"
4. Fill member form
5. Upload photo (optional)
6. Submit form
7. Member appears in list
8. View member profile

### Journey 3: Recording Sunday Attendance
1. Login as authorized user
2. Navigate to Attendance page
3. Select date (Sunday)
4. Select "Sunday Service"
5. Check boxes for present members
6. Submit attendance
7. View attendance summary
8. Check statistics

### Journey 4: Recording Collections
1. Login as authorized user
2. Navigate to Collections page
3. Select collection type (Offering/Tithe)
4. Enter amount
5. Select date
6. Submit collection
7. View collection history
8. Generate reports

### Journey 5: Admin Assigning Role
1. Login as President/Mission Secretary
2. Navigate to User Management
3. Click "Create New User Account"
4. Fill user details
5. Select role from dropdown
6. Choose department (if applicable)
7. Enter location
8. Submit form
9. System configures permissions automatically
10. User can login with new role

---

## Troubleshooting Common Issues

### Issue: Cannot Login
- Check email/password correctness
- Verify backend server is running
- Check database connection
- Verify user exists in branches table

### Issue: Permission Denied
- Check user's assigned role
- Verify role has required permissions
- Check role_access table
- Contact admin to update role

### Issue: Data Not Loading
- Check API endpoint accessibility
- Verify authentication token
- Check browser console for errors
- Verify database connection

### Issue: Role Not Working
- Verify role assignment in user_roles table
- Check role_access configuration
- Verify role_hierarchy setup
- Check middleware configuration

---

## System Maintenance

### Regular Tasks
1. **Database Backup**: Regular SQLite database backups
2. **Log Review**: Check server logs for errors
3. **User Audit**: Review user roles and permissions
4. **Data Cleanup**: Archive old records
5. **Security Updates**: Keep dependencies updated

### Backup Procedure
```bash
# Backup database
cp backend
cp church.db church_backup_$(date +%Y%m%d).db
```

### Restore Procedure
```bash
cd backend
cp church_backup_YYYYMMDD.db church.db
```

---

## Future Enhancements

### Planned Features
1. Email notifications
2. SMS integration
3. Mobile app
4. Advanced reporting
5. Financial management
6. Document management
7. Multi-language support
8. Export to PDF/Excel

---

## Support & Documentation

### Key Files
- `README.md` - Installation and setup
- `SETUP.md` - Detailed setup instructions
- `WORKFLOW.md` - This document
- `backend/schema.sql` - Database schema
- `backend/schema_roles.sql` - Role definitions

### Contact
For issues or questions, refer to the system administrator or development team.

---

**Last Updated**: 2024
**Version**: 1.0.0

