# User Management & Role Assignment

## Overview

Admins (President and Mission Secretary) can now create user accounts and assign roles with all necessary permissions automatically configured.

## Features

### 1. Create User Accounts
- Create new branch/user accounts
- Assign role during creation
- Set department and location
- All permissions automatically configured based on role

### 2. Assign/Update Roles
- Change user roles
- Update department assignments
- Update location assignments
- Permissions automatically updated

### 3. View All Users
- See all users with their roles
- View primary role, level, department, and location
- Edit or delete users

## Access Control

Only users with these roles can manage users:
- **PRESIDENT** (Head of Mission)
- **MISSION_SECRETARY**

## How to Use

### Creating a New User Account

1. Navigate to **User Management** in the sidebar (visible only to President/Mission Secretary)
2. Click **"Create New User Account"**
3. Fill in the form:
   - **Branch Name** (required)
   - **Email** (required, must be unique)
   - **Password** (required, minimum 6 characters)
   - **Role** (required) - Select from dropdown
   - **Department** (optional) - Select if applicable
   - **Location** (optional) - e.g., "Liberia", "Monrovia", etc.
   - **Address, City, State, Country, Currency** (optional)
4. Click **"Create User"**

The system will:
- Create the user account
- Assign the selected role
- Configure all permissions automatically based on role
- Create a default admin member for the branch

### Updating User Role

1. Find the user in the table
2. Click **"Edit Role"**
3. Select new role, department, and/or location
4. Click **"Update Role"**

The system will:
- Deactivate old role
- Assign new role
- Update all permissions automatically

### Deleting a User

1. Find the user in the table
2. Click **"Delete"**
3. Confirm deletion

⚠️ **Warning**: This permanently deletes the user and all associated data.

## Automatic Permission Configuration

When a role is assigned, the system automatically:

1. **Grants Access** - Based on `role_access` table
2. **Sets Reporting Relationships** - Based on `role_hierarchy` table
3. **Configures Department Access** - If department is specified
4. **Sets Location Scope** - If location is specified

### Permission Examples

- **PRESIDENT** - Gets access to ALL offices and departments
- **HOME_MISSION_PASTOR** - Gets access to Home Mission departments and Liberia stations only
- **FINANCE_OFFICER** - Gets access to finance functions only
- **RESIDENT_PASTOR_HQ** - Gets access to HQ offices except Finance

## API Endpoints

### Create User
```
POST /api/users
Body: {
  branchname, email, password, roleCode,
  departmentId?, location?, address?, city?, state?, country?, currency?
}
```

### Get All Users
```
GET /api/users
Returns: Array of users with roles
```

### Update User Role
```
PUT /api/users/:id/role
Body: { roleCode, departmentId?, location? }
```

### Add Additional Role
```
POST /api/users/:id/roles
Body: { roleCode, departmentId?, location? }
```

### Remove Role
```
DELETE /api/users/:id/roles/:roleId
```

### Delete User
```
DELETE /api/users/:id
```

## Role Assignment Flow

1. Admin selects role from dropdown
2. System validates role exists
3. User account created
4. Role assigned via `RoleManager.assignRole()`
5. Permissions automatically configured from `role_access` table
6. Reporting relationships set from `role_hierarchy` table
7. User can immediately access features based on role

## Security

- Only President and Mission Secretary can create/manage users
- Password is hashed using bcrypt
- Role assignments are logged (assigned_by field)
- All API endpoints require authentication
- Role-based access control enforced on all routes

## Notes

- Users can have multiple roles (though typically one primary role)
- Department assignment is optional but recommended for department-specific roles
- Location helps filter data for regional/national roles
- First registered user automatically gets PRESIDENT role
- Role changes take effect immediately

