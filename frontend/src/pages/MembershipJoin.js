import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { assetUrl } from '../config/api';
import './Auth.css';
import './Members.css';

const EMPTY = {
  title: 'Mr',
  firstname: '',
  middlename: '',
  lastname: '',
  email: '',
  phone: '',
  phone_alt: '',
  sex: '',
  dob: '',
  marital_status: '',
  occupation: '',
  address: '',
  city: '',
  state: '',
  country: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  notes: ''
};

const MembershipJoin = () => {
  const { slug } = useParams();
  const [church, setChurch] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get('/api/public/membership/form', { params: { slug } });
        if (cancelled) return;
        setChurch(data.church);
        if (data.church?.primaryColor) {
          document.documentElement.style.setProperty('--church-primary', data.church.primaryColor);
        }
        if (data.church?.secondaryColor) {
          document.documentElement.style.setProperty('--church-secondary', data.church.secondaryColor);
        }
        if (data.church?.name) {
          document.title = `Join · ${data.church.shortName || data.church.name}`;
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Invalid membership link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onChange = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await axios.post(`/api/public/membership/join?slug=${encodeURIComponent(slug)}`, form);
      setDone(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const logo = assetUrl(church?.logoUrl);
  const primary = church?.primaryColor || '#1e3a5f';

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Loading membership form…</p>
        </div>
      </div>
    );
  }

  if (!church) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="error-message">{error || 'Church not found'}</div>
          <p className="auth-link">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-container" style={{ background: `linear-gradient(135deg, ${primary}, ${church.secondaryColor || '#2c7a9b'})` }}>
        <div className="auth-card" style={{ maxWidth: 520 }}>
          {logo && <img className="auth-logo" src={logo} alt="" />}
          <h2>Application received</h2>
          <div className="success-message" style={{ textAlign: 'left' }}>
            {done.message}
          </div>
          <p className="muted" style={{ textAlign: 'left' }}>
            Reference: <code>{done.membershipId || done.memberId}</code>
          </p>
          <p className="auth-link">
            <Link to={`/t/${slug}/login`}>Go to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="auth-container"
      style={{ background: `linear-gradient(135deg, ${primary}, ${church.secondaryColor || '#2c7a9b'})`, alignItems: 'flex-start', paddingTop: '4vh' }}
    >
      <div className="auth-card" style={{ maxWidth: 640, textAlign: 'left' }}>
        {logo && <img className="auth-logo" src={logo} alt={church.name} style={{ marginLeft: 'auto', marginRight: 'auto' }} />}
        <h2 style={{ textAlign: 'center' }}>Membership Application</h2>
        <p className="auth-church-name" style={{ textAlign: 'center' }}>
          {church.name}
        </p>
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          Submit this form to join. A church administrator must approve your application before a
          username and password can be assigned.
        </p>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="member-form-grid">
            <div className="form-group">
              <label>Title</label>
              <select value={form.title} onChange={onChange('title')}>
                {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Rev', 'Pastor'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>First name *</label>
              <input value={form.firstname} onChange={onChange('firstname')} required />
            </div>
            <div className="form-group">
              <label>Middle name</label>
              <input value={form.middlename} onChange={onChange('middlename')} />
            </div>
            <div className="form-group">
              <label>Last name *</label>
              <input value={form.lastname} onChange={onChange('lastname')} required />
            </div>
            <div className="form-group">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={onChange('email')} required />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={onChange('phone')} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.sex} onChange={onChange('sex')}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="form-group">
              <label>Date of birth</label>
              <input type="date" value={form.dob} onChange={onChange('dob')} />
            </div>
            <div className="form-group">
              <label>Marital status</label>
              <input value={form.marital_status} onChange={onChange('marital_status')} />
            </div>
            <div className="form-group">
              <label>Occupation</label>
              <input value={form.occupation} onChange={onChange('occupation')} />
            </div>
            <div className="form-group full">
              <label>Address</label>
              <input value={form.address} onChange={onChange('address')} />
            </div>
            <div className="form-group">
              <label>City</label>
              <input value={form.city} onChange={onChange('city')} />
            </div>
            <div className="form-group">
              <label>State</label>
              <input value={form.state} onChange={onChange('state')} />
            </div>
            <div className="form-group">
              <label>Country</label>
              <input value={form.country} onChange={onChange('country')} />
            </div>
            <div className="form-group">
              <label>Emergency contact</label>
              <input value={form.emergency_contact_name} onChange={onChange('emergency_contact_name')} />
            </div>
            <div className="form-group">
              <label>Emergency phone</label>
              <input value={form.emergency_contact_phone} onChange={onChange('emergency_contact_phone')} />
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <textarea value={form.notes} onChange={onChange('notes')} rows={3} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ background: primary, marginTop: 12 }}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MembershipJoin;
