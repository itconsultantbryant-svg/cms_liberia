import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);

const Register = () => {
  const [formData, setFormData] = useState({
    churchName: '',
    churchSlug: '',
    branchname: '',
    branchcode: 'HQ',
    email: '',
    password: '',
    password_confirmation: '',
    address: '',
    city: '',
    state: '',
    country: '',
    currency: 'USD',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'churchName' && !prev.churchSlugManual) {
        next.churchSlug = slugify(value);
      }
      if (name === 'churchSlug') {
        next.churchSlugManual = true;
        next.churchSlug = slugify(value);
      }
      if (name === 'churchName' && !prev.branchname) {
        next.branchname = value;
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.password_confirmation) {
      setError('Passwords do not match');
      return;
    }
    if (!formData.churchName) {
      setError('Church name is required');
      return;
    }

    setLoading(true);

    try {
      await register({
        ...formData,
        churchSlug: formData.churchSlug || slugify(formData.churchName),
        branchname: formData.branchname || formData.churchName,
      });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Register Your Church</h2>
        <p style={{ color: '#666', marginBottom: '16px', fontSize: '0.95rem' }}>
          Creates a new church tenant and headquarters branch. You become the church administrator.
        </p>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Church Name *</label>
            <input
              type="text"
              name="churchName"
              value={formData.churchName}
              onChange={handleChange}
              required
              placeholder="e.g. Grace Community Church"
            />
          </div>
          <div className="form-group">
            <label>Church Slug (URL identifier) *</label>
            <input
              type="text"
              name="churchSlug"
              value={formData.churchSlug}
              onChange={handleChange}
              required
              placeholder="e.g. grace-community"
            />
          </div>
          <div className="form-group">
            <label>Headquarters Branch Name *</label>
            <input
              type="text"
              name="branchname"
              value={formData.branchname}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Branch Code</label>
            <input
              type="text"
              name="branchcode"
              value={formData.branchcode}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Admin Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Password *</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label>Confirm Password *</label>
            <input
              type="password"
              name="password_confirmation"
              value={formData.password_confirmation}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input type="text" name="address" value={formData.address} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>City</label>
            <input type="text" name="city" value={formData.city} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>State / County</label>
            <input type="text" name="state" value={formData.state} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Country</label>
            <input type="text" name="country" value={formData.country} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <select name="currency" value={formData.currency} onChange={handleChange} required>
              <option value="USD">USD (US Dollar)</option>
              <option value="LRD">LRD (Liberian Dollar)</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Registering...' : 'Register Church'}
          </button>
        </form>
        <p className="auth-link">
          Already have an account? <a href="/login">Login</a>
        </p>
      </div>
    </div>
  );
};

export default Register;
