import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { AVAILABLE_PERMISSIONS } from '../config/permissions';

const UserManagement = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    branchname: '',
    branchcode: '',
    email: '',
    password: '',
    address: '',
    city: '',
    state: '',
    country: '',
    currency: 'USD',
    roleCode: '',
    departmentId: '',
    location: '',
    permissions: []
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, rolesRes, deptRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get('/api/roles'),
        axios.get('/api/roles/departments'),
      ]);

      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setDepartments(deptRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage('Error loading data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox' && name.startsWith('perm_')) {
      const key = name.replace('perm_', '');
      setFormData(prev => ({
        ...prev,
        permissions: checked ? [...(prev.permissions || []), key] : (prev.permissions || []).filter(p => p !== key)
      }));
    } else {
      setFormData({ ...formData, [e.target.name]: value });
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      await axios.post('/api/users', {
        ...formData,
        permissions: formData.permissions || []
      });
      setMessage('User account created successfully!');
      setShowCreateForm(false);
      setFormData({
        branchname: '',
        branchcode: '',
        email: '',
        password: '',
        address: '',
        city: '',
        state: '',
        country: '',
        currency: 'USD',
        roleCode: '',
        departmentId: '',
        location: '',
        permissions: []
      });
      fetchData();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEditRole = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    setEditingUser(user);
    setFormData({
      branchname: user.branchname,
      branchcode: user.branchcode || '',
      email: user.email,
      password: '',
      address: user.address || '',
      city: user.city || '',
      state: user.state || '',
      country: user.country || '',
      currency: user.currency || 'USD',
      roleCode: user.primaryRole?.role_code || '',
      departmentId: user.primaryRole?.department_id || '',
      location: user.primaryRole?.location || '',
      permissions: Array.isArray(user.permissions) ? user.permissions : []
    });
    setShowCreateForm(true);
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      await axios.put(`/api/users/${editingUser.id}/role`, {
        roleCode: formData.roleCode,
        departmentId: formData.departmentId || null,
        location: formData.location || null,
        permissions: formData.permissions || []
      });
      setMessage('Role and permissions updated successfully!');
      setShowCreateForm(false);
      setEditingUser(null);
      fetchData();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`/api/users/${userId}`);
      setMessage('User deleted successfully!');
      fetchData();
    } catch (error) {
      setMessage('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const canManageUsers = user?.primaryRole?.role_code === 'PRESIDENT' || user?.primaryRole?.role_code === 'MISSION_SECRETARY';

  if (!canManageUsers) {
    return <div>You do not have permission to manage users.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>User Management</h2>
        <button onClick={() => { setShowCreateForm(true); setEditingUser(null); }} className="btn btn-primary">
          Create New User Account
        </button>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ marginBottom: '20px' }}>
          {message}
        </div>
      )}

      {showCreateForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>{editingUser ? 'Update User Role' : 'Create New User Account'}</h3>
          <form onSubmit={editingUser ? handleUpdateRole : handleCreateUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group">
                <label>Branch Name *</label>
                <input
                  type="text"
                  name="branchname"
                  value={formData.branchname}
                  onChange={handleChange}
                  required
                  disabled={!!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Branch Code</label>
                <input
                  type="text"
                  name="branchcode"
                  value={formData.branchcode}
                  onChange={handleChange}
                  disabled={!!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={!!editingUser}
                />
              </div>
              {!editingUser && (
                <div className="form-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength="6"
                  />
                </div>
              )}
              <div className="form-group">
                <label>Role *</label>
                <select
                  name="roleCode"
                  value={formData.roleCode}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select Role</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.role_code}>
                      {role.role_name} (Level {role.level})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Department</label>
                <select
                  name="departmentId"
                  value={formData.departmentId}
                  onChange={handleChange}
                >
                  <option value="">None</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g., Liberia, Monrovia, etc."
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  disabled={!!editingUser}
                />
              </div>
              <div className="form-group">
                <label>City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  disabled={!!editingUser}
                />
              </div>
              <div className="form-group">
                <label>State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  disabled={!!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Country</label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  disabled={!!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  disabled={!!editingUser}
                >
                  <option value="USD">USD (US Dollar)</option>
                  <option value="LRD">LRD (Liberian Dollar)</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', marginBottom: '10px' }}>Permissions (what this user can see and do)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {AVAILABLE_PERMISSIONS.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      name={`perm_${p.key}`}
                      checked={(formData.permissions || []).includes(p.key)}
                      onChange={handleChange}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-primary">
                {editingUser ? 'Update Role' : 'Create User'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingUser(null);
                  setFormData({
                    branchname: '',
                    branchcode: '',
                    email: '',
                    password: '',
                    address: '',
                    city: '',
                    state: '',
                    country: '',
                    currency: 'USD',
                    roleCode: '',
                    departmentId: '',
                    location: '',
                    permissions: []
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>All Users</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Branch Name</th>
              <th>Email</th>
              <th>Primary Role</th>
              <th>Level</th>
              <th>Department</th>
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(userItem => (
              <tr key={userItem.id}>
                <td>{userItem.branchname}</td>
                <td>{userItem.email}</td>
                <td>
                  {userItem.primaryRole ? (
                    <span style={{ fontWeight: 'bold' }}>{userItem.primaryRole.role_name}</span>
                  ) : (
                    <span style={{ color: '#999' }}>No role assigned</span>
                  )}
                </td>
                <td>{userItem.primaryRole?.level || '-'}</td>
                <td>
                  {userItem.primaryRole?.department || '-'}
                </td>
                <td>{userItem.primaryRole?.location || '-'}</td>
                <td>
                  <button
                    onClick={() => handleEditRole(userItem.id)}
                    className="btn btn-primary"
                    style={{ padding: '5px 10px', fontSize: '14px', marginRight: '5px' }}
                  >
                    Edit Role
                  </button>
                  <button
                    onClick={() => handleDeleteUser(userItem.id)}
                    className="btn btn-danger"
                    style={{ padding: '5px 10px', fontSize: '14px' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;

