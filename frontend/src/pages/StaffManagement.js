import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CurrencySelect from '../components/CurrencySelect';

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

  if (loading) return <div>Loading...</div>;

  if (!canManage) {
    return <div className="card"><p>You do not have permission to manage staff.</p></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Staff Management</h2>
        <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          Add Staff
        </button>
      </div>

      {message && <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ marginBottom: '16px' }}>{message}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>{editing ? 'Edit Staff' : 'Add Staff'}</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>First Name *</label>
                <input name="firstname" value={formData.firstname} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Last Name *</label>
                <input name="lastname" value={formData.lastname} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input name="email" type="email" value={formData.email} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input name="phone" value={formData.phone} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Position *</label>
                <input name="position" value={formData.position} onChange={handleChange} required placeholder="e.g. Secretary, Pastor" />
              </div>
              <div className="form-group">
                <label>Department</label>
                <select name="department_id" value={formData.department_id} onChange={handleChange}>
                  <option value="">None</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Employment Date</label>
                <input name="employment_date" type="date" value={formData.employment_date} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Salary</label>
                <input name="salary" type="number" step="0.01" value={formData.salary} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <CurrencySelect name="currency" value={formData.currency} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input name="address" value={formData.address} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>City</label>
                <input name="city" value={formData.city} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>State</label>
                <input name="state" value={formData.state} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Country</label>
                <input name="country" value={formData.country} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'} Staff</button>
              <button type="button" className="btn btn-danger" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Staff List ({staff.length})</h3>
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
                    <button type="button" className="btn btn-primary" style={{ marginRight: '8px', padding: '4px 10px' }} onClick={() => handleEdit(s)}>Edit</button>
                    <button type="button" className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={() => handleDeactivate(s.id)}>Deactivate</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {staff.length === 0 && <p style={{ padding: '16px', color: '#666' }}>No staff records.</p>}
      </div>
    </div>
  );
};

export default StaffManagement;
