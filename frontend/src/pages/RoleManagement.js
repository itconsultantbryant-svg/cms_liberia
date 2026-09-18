import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const RoleManagement = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [customForm, setCustomForm] = useState({
    roleName: '',
    description: '',
    permissions: []
  });

  const canManage = user?.isadmin || (user?.permissionKeys || []).includes('roles.manage');

  const fetchData = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        axios.get('/api/roles'),
        axios.get('/api/roles/permissions')
      ]);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      setPermissions(permsRes.data.permissions || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRoleSelect = async (role) => {
    setSelectedRole(role);
    setSelectedPerms(role.permissions || []);
    setMessage('');
    try {
      const usersRes = await axios.get(`/api/roles/role/${role.role_code}/users`);
      setUsers(usersRes.data || []);
    } catch (_) {
      setUsers([]);
    }
  };

  const togglePerm = (key) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const savePerms = async () => {
    if (!selectedRole?.is_custom) return;
    setError('');
    try {
      await axios.put(`/api/roles/${selectedRole.id}/permissions`, {
        permissions: selectedPerms
      });
      setMessage('Permissions saved');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const createCustom = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await axios.post('/api/roles/custom', customForm);
      setMessage('Custom role created');
      setCustomForm({ roleName: '', description: '', permissions: [] });
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const toggleCustomPerm = (key) => {
    setCustomForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key]
    }));
  };

  if (loading) return <div className="members-page muted">Loading…</div>;

  const byScope = roles.reduce((acc, role) => {
    const scope = role.scope || 'church';
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(role);
    return acc;
  }, {});

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Role &amp; Permission Management</h1>
          <p className="members-sub">
            Platform, church, and branch role templates plus church-specific custom roles.
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="role-layout">
        <div className="card">
          <h3>Roles</h3>
          {Object.entries(byScope).map(([scope, list]) => (
            <div key={scope} style={{ marginBottom: 16 }}>
              <h4 style={{ textTransform: 'capitalize', margin: '0 0 8px' }}>{scope} roles</h4>
              {list.map((role) => (
                <button
                  type="button"
                  key={role.id}
                  onClick={() => handleRoleSelect(role)}
                  className={`role-list-item${selectedRole?.id === role.id ? ' is-selected' : ''}`}
                >
                  <strong>{role.role_name}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    {role.role_code}
                    {role.is_custom ? ' · custom' : ' · system'}
                    {' · '}
                    {(role.permissions || []).length} permissions
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="card">
          {selectedRole ? (
            <>
              <h3>{selectedRole.role_name}</h3>
              <p className="muted">{selectedRole.description}</p>
              <h4>Permissions</h4>
              <div className="perm-scroll">
                {permissions.map((p) => (
                  <label key={p.perm_key} className="perm-row">
                    <input
                      type="checkbox"
                      checked={selectedPerms.includes(p.perm_key)}
                      disabled={!selectedRole.is_custom || !canManage}
                      onChange={() => togglePerm(p.perm_key)}
                    />
                    <span>
                      <code>{p.perm_key}</code> — {p.description}
                    </span>
                  </label>
                ))}
              </div>
              {selectedRole.is_custom && canManage && (
                <button type="button" className="btn btn-primary" onClick={savePerms}>
                  Save permissions
                </button>
              )}
              <h4 style={{ marginTop: 16 }}>Assigned users (this church)</h4>
              <ul>
                {users.map((u) => (
                  <li key={u.id}>
                    {u.branchname} ({u.email})
                  </li>
                ))}
                {!users.length && <li className="muted">None</li>}
              </ul>
            </>
          ) : (
            <p className="muted">Select a role to view permissions</p>
          )}
        </div>
      </div>

      {canManage && (
        <form className="card" onSubmit={createCustom}>
          <h3>Create custom church role</h3>
          <div className="member-form-grid">
            <div className="form-group">
              <label htmlFor="role-name">Role name</label>
              <input
                id="role-name"
                value={customForm.roleName}
                onChange={(e) => setCustomForm({ ...customForm, roleName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="role-desc">Description</label>
              <input
                id="role-desc"
                value={customForm.description}
                onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
              />
            </div>
          </div>
          <h4>Permissions</h4>
          <div className="perm-scroll">
            {permissions
              .filter((p) => !p.perm_key.startsWith('platform.'))
              .map((p) => (
                <label key={p.perm_key} className="perm-row">
                  <input
                    type="checkbox"
                    checked={customForm.permissions.includes(p.perm_key)}
                    onChange={() => toggleCustomPerm(p.perm_key)}
                  />
                  <code>{p.perm_key}</code>
                </label>
              ))}
          </div>
          <button type="submit" className="btn btn-primary">
            Create role
          </button>
        </form>
      )}
    </div>
  );
};

export default RoleManagement;
