import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

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

  if (loading) return <div>Loading...</div>;

  const byScope = roles.reduce((acc, role) => {
    const scope = role.scope || 'church';
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(role);
    return acc;
  }, {});

  return (
    <div>
      <h2>Role & Permission Management</h2>
      <p style={{ color: '#666' }}>
        Platform, church, and branch role templates plus church-specific custom roles. Authorization uses
        granular permission keys checked on the server.
      </p>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3>Roles</h3>
          {Object.entries(byScope).map(([scope, list]) => (
            <div key={scope} style={{ marginBottom: 16 }}>
              <h4 style={{ textTransform: 'capitalize' }}>{scope} roles</h4>
              {list.map((role) => (
                <div
                  key={role.id}
                  onClick={() => handleRoleSelect(role)}
                  style={{
                    padding: 10,
                    margin: '5px 0',
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background:
                      selectedRole?.id === role.id ? 'var(--church-secondary, #e3f2fd)' : '#fff'
                  }}
                >
                  <strong>{role.role_name}</strong>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {role.role_code}
                    {role.is_custom ? ' · custom' : ' · system'}
                    {' · '}
                    {(role.permissions || []).length} permissions
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 16 }}>
          {selectedRole ? (
            <>
              <h3>{selectedRole.role_name}</h3>
              <p style={{ fontSize: 13, color: '#666' }}>{selectedRole.description}</p>
              <h4>Permissions</h4>
              <div style={{ maxHeight: 280, overflow: 'auto', marginBottom: 12 }}>
                {permissions.map((p) => (
                  <label
                    key={p.perm_key}
                    style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}
                  >
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
                {!users.length && <li>None</li>}
              </ul>
            </>
          ) : (
            <p>Select a role to view permissions</p>
          )}
        </div>
      </div>

      {canManage && (
        <form className="card" style={{ padding: 16, marginTop: 20 }} onSubmit={createCustom}>
          <h3>Create custom church role</h3>
          <div className="form-group">
            <label>Role name</label>
            <input
              value={customForm.roleName}
              onChange={(e) => setCustomForm({ ...customForm, roleName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              value={customForm.description}
              onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
            />
          </div>
          <h4>Permissions</h4>
          <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12 }}>
            {permissions
              .filter((p) => !p.perm_key.startsWith('platform.'))
              .map((p) => (
                <label key={p.perm_key} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
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
