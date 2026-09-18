import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CurrencySelect from '../components/CurrencySelect';
import './Members.css';

const StaffManagement = () => {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    email: '',
    phone: '',
    position: '',
    department_id: '',
    employment_date: '',
    salary: '',
    currency: user?.currency || 'USD',
    address: '',
    city: '',
    state: '',
    country: '',
    notes: ''
  });

  const canManage = ['FINANCE_OFFICER', 'RESIDENT_PASTOR', 'RESIDENT_PASTOR_HQ', 'PRESIDENT', 'MISSION_SECRETARY'].includes(user?.primaryRole?.role_code) || user?.isadmin;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [staffRes, deptRes] = await Promise.all([
        axios.get('/api/staff'),
        axios.get('/api/roles/departments').catch(() => ({ data: [] }))
      ]);
      setStaff(staffRes.data || []);
      setDepartments(deptRes.data || []);
    } catch (e) {
      setMessage('Error loading staff: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      firstname: '',
      lastname: '',
      email: '',
      phone: '',
      position: '',
      department_id: '',
      employment_date: '',
      salary: '',
      currency: user?.currency || 'USD',
      address: '',
      city: '',
      state: '',
      country: '',
      notes: ''
    });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (editing) {
        await axios.put(`/api/staff/${editing.id}`, {
          ...formData,
          department_id: formData.department_id || null
        });
        setMessage('Staff updated successfully');
      } else {
        await axios.post('/api/staff', {
          ...formData,
          department_id: formData.department_id || null
        });
        setMessage('Staff added successfully');
      }
      resetForm();
      fetchData();
    } catch (e) {
      setMessage(e.response?.data?.error || 'Error saving staff');
    }
  };

  const handleEdit = (s) => {
    setEditing(s);
    setFormData({
      firstname: s.firstname,
      lastname: s.lastname,
      email: s.email || '',
      phone: s.phone || '',
      position: s.position,
      department_id: s.department_id || '',
      employment_date: s.employment_date ? s.employment_date.split('T')[0] : '',
      salary: s.salary ?? '',
      currency: s.currency || 'USD',
      address: s.address || '',
      city: s.city || '',
      state: s.state || '',
      country: s.country || '',
      notes: s.notes || ''
    });
    setShowForm(true);
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this staff member?')) return;
    try {
      await axios.delete(`/api/staff/${id}`);
      setMessage('Staff deactivated');
      fetchData();
    } catch (e) {
      setMessage(e.response?.data?.error || 'Error');
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    if (amount == null) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount);
  };

  if (loading) return <div className="members-page muted">Loading…</div>;

  if (!canManage) {
    return <div className="members-page"><div className="card"><p>You do not have permission to manage staff.</p></div></div>;
  }

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Staff Management</h1>
          <p className="members-sub">Manage church staff records and employment details</p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            Add Staff
          </button>
        </div>
      </div>

      {message && <div className={message.includes('Error') ? 'error-message' : 'success-message'}>{message}</div>}

      {showForm && (
        <div className="card">
          <h3>{editing ? 'Edit Staff' : 'Add Staff'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="member-form-grid">
              <div className="form-group">
                <label htmlFor="staff-firstname">First Name *</label>
                <input id="staff-firstname" name="firstname" value={formData.firstname} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="staff-lastname">Last Name *</label>
                <input id="staff-lastname" name="lastname" value={formData.lastname} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="staff-email">Email</label>
                <input id="staff-email" name="email" type="email" value={formData.email} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-phone">Phone</label>
                <input id="staff-phone" name="phone" value={formData.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-position">Position *</label>
                <input id="staff-position" name="position" value={formData.position} onChange={handleChange} required placeholder="e.g. Secretary, Pastor" />
              </div>
              <div className="form-group">
                <label htmlFor="staff-department">Department</label>
                <select id="staff-department" name="department_id" value={formData.department_id} onChange={handleChange}>
                  <option value="">None</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="staff-employment">Employment Date</label>
                <input id="staff-employment" name="employment_date" type="date" value={formData.employment_date} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-salary">Salary</label>
                <input id="staff-salary" name="salary" type="number" step="0.01" value={formData.salary} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-currency">Currency</label>
                <CurrencySelect id="staff-currency" name="currency" value={formData.currency} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-address">Address</label>
                <input id="staff-address" name="address" value={formData.address} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-city">City</label>
                <input id="staff-city" name="city" value={formData.city} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-state">State</label>
                <input id="staff-state" name="state" value={formData.state} onChange={handleChange} />
              </div>
              <div className="form-group full">
                <label htmlFor="staff-country">Country</label>
                <input id="staff-country" name="country" value={formData.country} onChange={handleChange} />
              </div>
              <div className="form-group full">
                <label htmlFor="staff-notes">Notes</label>
                <textarea id="staff-notes" name="notes" value={formData.notes} onChange={handleChange} rows={2} />
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'} Staff</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Staff List ({staff.length})</h3>
        <div className="members-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Department</th>
                <th>Salary</th>
                <th>Employment Date</th>
                {user?.primaryRole?.role_code === 'FINANCE_OFFICER' && <th>Pastor</th>}
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td>{s.firstname} {s.lastname}</td>
                  <td>{s.position}</td>
                  <td>{s.department_name || '-'}</td>
                  <td>{formatCurrency(s.salary, s.currency)}</td>
                  <td>{s.employment_date ? new Date(s.employment_date).toLocaleDateString() : '-'}</td>
                  {user?.primaryRole?.role_code === 'FINANCE_OFFICER' && <td>{s.pastor_name || '-'}</td>}
                  {canManage && (
                    <td>
                      <div className="members-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleEdit(s)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeactivate(s.id)}>Deactivate</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {staff.length === 0 && <p className="muted">No staff records.</p>}
      </div>
    </div>
  );
};

export default StaffManagement;
