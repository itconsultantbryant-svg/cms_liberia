# Administrative Office Layout & Role System

## Implementation Status: ✅ COMPLETE

The complete hierarchical administrative office layout has been implemented and integrated into the Church Management System.

## System Architecture

### Database Structure

1. **Roles Table** - Defines all 30+ administrative roles with:
   - Role code (unique identifier)
   - Role name
   - Hierarchy level (1 = highest)
   - Office type (national, mission, department, station, local)
   - Department assignment
   - Description

2. **Role Hierarchy Table** - Defines reporting relationships between roles

3. **Role Access Table** - Defines which offices/roles each role can access

4. **Departments Table** - Organizational departments structure

5. **User Roles Table** - Links users (branches/members) to their assigned roles

## Implemented Roles

### NATIONAL OFFICE
- ✅ **PRESIDENT** (Head of Mission) - Access to all offices, reports to no one
- ✅ **VICE_PRESIDENT_MA** - Access to Mission Office and Education Office
- ✅ **MISSION_INSPECTORATE_NATIONAL** - Access to all Mission Office departments
- ✅ **EXECUTIVE_SECRETARY** - Access to own office only
- ✅ **MISSION_SECRETARY** - Access to all Mission Office departments

### MISSION OFFICE
- ✅ **VICE_PRESIDENT_MISSION** - Access to all Mission Office departments
- ✅ **MISSION_INSPECTORATE_MISSION** - Access to Mission Office departments
- ✅ **MISSION_SECRETARY_MISSION** - Access to Mission Office
- ✅ **HOME_MISSION_PASTOR** - Access to Home Mission departments and Liberia stations
- ✅ **FOREIGN_MISSION_PASTOR** - Access to Foreign Mission departments and foreign stations

### HOME MISSION DEPARTMENT
- ✅ **TRAINING_DEV_HOME** - Training and Development
- ✅ **LEGAL_SERVICES_HOME** - Legal Services
- ✅ **CHURCH_GROWTH_EXPANSION** - Church Growth and Expansion

### FOREIGN MISSION DEPARTMENT
- ✅ **TRAINING_DEV_FOREIGN** - Training and Manpower Development
- ✅ **LEGAL_SERVICES_FOREIGN** - Legal Services
- ✅ **FINANCE_BUDGET_FOREIGN** - Finance and Budget

### PERSONNEL DEPARTMENT
- ✅ **PERSONNEL_OFFICER** - Personnel management

### EDUCATION OFFICE
- ✅ **EDUCATION_SECRETARY** - Access to all Education departments
- ✅ **DIRECTOR_PRIMARY_SECONDARY** - Primary-Secondary Education
- ✅ **DIRECTOR_HIGHER_LEARNING** - Higher Learning
- ✅ **PRIMARY_SECONDARY_SCHOOL** - School level
- ✅ **HIGHER_LEARNING** - Higher learning institutions

### STATIONS (OUTSIDE HEADQUARTERS)
- ✅ **REGIONAL_PASTOR** - Coordinates multiple countries
- ✅ **NATIONAL_PASTOR** - Coordinates stations in a country
- ✅ **STATE_COUNTY_PASTOR** - Coordinates stations in state/county
- ✅ **RESIDENT_PASTOR** - Station-level pastor
- ✅ **ASSISTANT_PASTOR** - Assistant to resident pastor
- ✅ **ADMINISTRATIVE_PASTOR** - Administrative duties
- ✅ **AUXILIARY_STAFF** - Support staff

### HEADQUARTERS LOCAL ADMINISTRATIVE
- ✅ **RESIDENT_PASTOR_HQ** - Headquarters resident pastor (no finance access)
- ✅ **ASSISTANT_RESIDENT_PASTOR** - Access to church growth only
- ✅ **CHURCH_GROWTH_DEPT** - Members, Stewards, Homecell data
- ✅ **FINANCE_OFFICER** - Finance department access
- ✅ **MUSIC_PASTOR** - Music department
- ✅ **OFFICE_ASSISTANT** - Office support
- ✅ **PASTOR_ON_DUTY** - Duty pastor

## Features Implemented

### 1. Role-Based Access Control
- ✅ Middleware for role checking (`requireRole`)
- ✅ Access control middleware (`requireAction`)
- ✅ Dynamic permission checking based on role hierarchy
- ✅ President has access to everything automatically

### 2. Reporting Structure
- ✅ Complete reporting hierarchy implemented
- ✅ Each role knows who it reports to
- ✅ Each role knows who reports to it
- ✅ API endpoints to query reporting relationships

### 3. Department Management
- ✅ Department structure with parent-child relationships
- ✅ Department assignment to roles
- ✅ Location-based filtering (Liberia vs Foreign)

### 4. User Role Assignment
- ✅ Assign roles to users (branches)
- ✅ Multiple roles per user support
- ✅ Department and location assignment
- ✅ Role activation/deactivation

### 5. API Endpoints

#### Role Management
- `GET /api/roles` - Get all roles
- `GET /api/roles/hierarchy` - Get role hierarchy
- `GET /api/roles/me` - Get current user's roles
- `GET /api/roles/user/:userId` - Get user's roles
- `POST /api/roles/assign` - Assign role to user
- `GET /api/roles/departments` - Get all departments
- `GET /api/roles/role/:roleCode/users` - Get users with specific role
- `POST /api/roles/check-access` - Check if user has access

### 6. Frontend Integration
- ✅ Role Management page (`/roles`)
- ✅ Role display in user profile
- ✅ Role-based navigation (Role Management visible only to President/Mission Secretary)
- ✅ Role badge in profile dropdown

### 7. Action Permissions
Implemented action-based permissions:
- `create_member` - Create new members
- `edit_member` - Edit member information
- `delete_member` - Delete members
- `view_finance` - View financial data
- `edit_finance` - Edit financial data
- `view_reports` - View reports
- `manage_roles` - Manage role assignments
- `mark_attendance` - Mark attendance
- `record_collection` - Record collections

## Usage

### Assigning Roles
Only President and Mission Secretary can assign roles:

```javascript
POST /api/roles/assign
{
  "userId": 1,
  "userType": "branch",
  "roleCode": "RESIDENT_PASTOR",
  "departmentId": null,
  "location": "Liberia"
}
```

### Checking Access
```javascript
POST /api/roles/check-access
{
  "targetRoleCode": "FINANCE_OFFICER"
}
```

### Getting User Roles
```javascript
GET /api/roles/me
// Returns: roles, primaryRole, accessibleRoles, reportingRoles
```

## Access Control Examples

1. **President** - Can access everything, assign roles, perform all actions
2. **Finance Officer** - Can view/edit finance, but cannot access other departments
3. **Resident Pastor HQ** - Can access most HQ offices except Finance
4. **Assistant Resident Pastor** - Can only access Church Growth department
5. **Home Mission Pastor** - Can access Home Mission departments and Liberia stations only

## Database Initialization

Roles and hierarchy are automatically initialized when running:
```bash
npm run init-db
```

The system creates:
- All 30+ roles
- Complete reporting hierarchy
- Department structure
- Access permissions

## Next Steps

1. **Assign roles to existing users** - Use the Role Management page or API
2. **Test access control** - Verify permissions work correctly
3. **Customize permissions** - Adjust action permissions in `backend/utils/roles.js`
4. **Add more roles** - Extend the system as needed

## Notes

- First registered branch automatically gets PRESIDENT role
- Roles can be assigned to both branches and members
- Multiple roles per user are supported
- Role hierarchy determines default access (higher level can access lower levels)
- Explicit access rules override hierarchy defaults

