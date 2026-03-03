import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const RoleManagement = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, deptRes, hierarchyRes] = await Promise.all([
        axios.get('/api/roles'),
        axios.get('/api/roles/departments'),
        axios.get('/api/roles/hierarchy'),
      ]);

      setRoles(rolesRes.data);
      setDepartments(deptRes.data);
      setHierarchy(hierarchyRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = async (roleCode) => {
    try {
      const [hierarchyRes, usersRes] = await Promise.all([
        axios.get(`/api/roles/hierarchy?role_code=${roleCode}`),
        axios.get(`/api/roles/role/${roleCode}/users`),
      ]);

      setSelectedRole({ roleCode, ...hierarchyRes.data });
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Error fetching role details:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Role Management</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div className="card">
          <h3>Roles by Level</h3>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {Object.entries(roles.reduce((acc, role) => {
              if (!acc[role.level]) acc[role.level] = [];
              acc[role.level].push(role);
              return acc;
            }, {})).map(([level, levelRoles]) => (
              <div key={level} style={{ marginBottom: '20px' }}>
                <h4>Level {level}</h4>
                {levelRoles.map(role => (
                  <div
                    key={role.id}
                    style={{
                      padding: '10px',
                      margin: '5px 0',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: selectedRole?.role?.role_code === role.role_code ? '#e3f2fd' : 'white'
                    }}
                    onClick={() => handleRoleSelect(role.role_code)}
                  >
                    <strong>{role.role_name}</strong>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      {role.office_type} - {role.department || 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {selectedRole && (
          <div className="card">
            <h3>Role Details: {selectedRole.role?.role_name}</h3>
            <div style={{ marginBottom: '20px' }}>
              <p><strong>Level:</strong> {selectedRole.role?.level}</p>
              <p><strong>Office Type:</strong> {selectedRole.role?.office_type}</p>
              <p><strong>Department:</strong> {selectedRole.role?.department || 'N/A'}</p>
              <p><strong>Description:</strong> {selectedRole.role?.description}</p>
            </div>

            {selectedRole.reportsTo && (
              <div style={{ marginBottom: '20px' }}>
                <h4>Reports To:</h4>
                {selectedRole.reportsTo.map(r => (
                  <div key={r.id} style={{ padding: '5px', backgroundColor: '#f0f0f0', margin: '5px 0', borderRadius: '4px' }}>
                    {r.role_name}
                  </div>
                ))}
              </div>
            )}

            {selectedRole.reportsFrom && (
              <div style={{ marginBottom: '20px' }}>
                <h4>Has Authority Over:</h4>
                {selectedRole.reportsFrom.map(r => (
                  <div key={r.id} style={{ padding: '5px', backgroundColor: '#e8f5e9', margin: '5px 0', borderRadius: '4px' }}>
                    {r.role_name}
                  </div>
                ))}
              </div>
            )}

            <div>
              <h4>Users with this Role ({users.length})</h4>
              {users.length === 0 ? (
                <p>No users assigned to this role</p>
              ) : (
                <ul>
                  {users.map(u => (
                    <li key={u.id}>{u.branchname} - {u.email}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h3>Departments</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Department Code</th>
              <th>Department Name</th>
              <th>Office Type</th>
              <th>Location</th>
              <th>Users</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(dept => (
              <tr key={dept.id}>
                <td>{dept.department_code}</td>
                <td>{dept.department_name}</td>
                <td>{dept.office_type}</td>
                <td>{dept.location}</td>
                <td>{dept.user_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RoleManagement;

