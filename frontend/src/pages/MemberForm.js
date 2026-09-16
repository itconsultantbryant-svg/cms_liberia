import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const empty = {
  title: 'Mr',
  firstname: '',
  middlename: '',
  lastname: '',
  email: '',
  phone: '',
  phone_alt: '',
  sex: 'male',
  dob: '',
  address: '',
  city: '',
  state: '',
  country: '',
  occupation: '',
  marital_status: 'single',
  membership_status: 'Active',
  member_since: '',
  baptism_status: 'unknown',
  baptism_date: '',
  ministry: '',
  department: '',
  position: 'member',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  notes: ''
};

const MemberForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id) && id !== 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState(['Active', 'Inactive', 'Visitor', 'Transferred', 'Deceased', 'Suspended']);

  useEffect(() => {
    axios.get('/api/members/meta').then((r) => {
      if (r.data.membershipStatuses) setStatuses(r.data.membershipStatuses);
    }).catch(() => {});

    if (isEdit) {
      axios.get(`/api/members/${id}`).then((r) => {
        const m = r.data.member;
        setForm({ ...empty, ...m });
      }).catch(() => setError('Could not load member'));
    }
  }, [id, isEdit]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await axios.put(`/api/members/${id}`, form);
        navigate(`/members/${id}`);
      } else {
        const res = await axios.post('/api/members', form);
        navigate(`/members/${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <h1>{isEdit ? 'Edit Member' : 'Add Member'}</h1>
        <Link to="/members" className="btn btn-secondary">
          Back
        </Link>
      </div>
      {error && <div className="error-message">{error}</div>}
      <form className="card" onSubmit={submit}>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Title</label>
            <select value={form.title || 'Mr'} onChange={set('title')}>
              {['Mr', 'Mrs', 'Miss', 'Dr', 'Prof', 'Elder'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Membership status</label>
            <select value={form.membership_status || 'Active'} onChange={set('membership_status')}>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>First name *</label>
            <input required value={form.firstname || ''} onChange={set('firstname')} />
          </div>
          <div className="form-group">
            <label>Middle name</label>
            <input value={form.middlename || ''} onChange={set('middlename')} />
          </div>
          <div className="form-group">
            <label>Last name *</label>
            <input required value={form.lastname || ''} onChange={set('lastname')} />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" required value={form.email || ''} onChange={set('email')} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={form.phone || ''} onChange={set('phone')} />
          </div>
          <div className="form-group">
            <label>Alternative phone</label>
            <input value={form.phone_alt || ''} onChange={set('phone_alt')} />
          </div>
          <div className="form-group">
            <label>Gender</label>
            <select value={form.sex || ''} onChange={set('sex')}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="form-group">
            <label>Date of birth</label>
            <input type="date" value={form.dob || ''} onChange={set('dob')} />
          </div>
          <div className="form-group">
            <label>Marital status</label>
            <select value={form.marital_status || ''} onChange={set('marital_status')}>
              <option value="single">Single</option>
              <option value="married">Married</option>
            </select>
          </div>
          <div className="form-group">
            <label>Occupation</label>
            <input value={form.occupation || ''} onChange={set('occupation')} />
          </div>
          <div className="form-group full">
            <label>Address</label>
            <input value={form.address || ''} onChange={set('address')} />
          </div>
          <div className="form-group">
            <label>City</label>
            <input value={form.city || ''} onChange={set('city')} />
          </div>
          <div className="form-group">
            <label>County / State</label>
            <input value={form.state || ''} onChange={set('state')} />
          </div>
          <div className="form-group">
            <label>Country</label>
            <input value={form.country || ''} onChange={set('country')} />
          </div>
          <div className="form-group">
            <label>Membership date</label>
            <input type="date" value={form.member_since || ''} onChange={set('member_since')} />
          </div>
          <div className="form-group">
            <label>Baptism status</label>
            <select value={form.baptism_status || 'unknown'} onChange={set('baptism_status')}>
              <option value="baptized">Baptized</option>
              <option value="not_baptized">Not baptized</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="form-group">
            <label>Baptism date</label>
            <input type="date" value={form.baptism_date || ''} onChange={set('baptism_date')} />
          </div>
          <div className="form-group">
            <label>Ministry</label>
            <input value={form.ministry || ''} onChange={set('ministry')} />
          </div>
          <div className="form-group">
            <label>Department</label>
            <input value={form.department || ''} onChange={set('department')} />
          </div>
          <div className="form-group">
            <label>Position</label>
            <input value={form.position || 'member'} onChange={set('position')} />
          </div>
          <div className="form-group">
            <label>Emergency contact</label>
            <input value={form.emergency_contact_name || ''} onChange={set('emergency_contact_name')} />
          </div>
          <div className="form-group">
            <label>Emergency phone</label>
            <input value={form.emergency_contact_phone || ''} onChange={set('emergency_contact_phone')} />
          </div>
          <div className="form-group full">
            <label>Notes</label>
            <textarea rows={3} value={form.notes || ''} onChange={set('notes')} />
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <Link to="/members" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
};

export default MemberForm;
