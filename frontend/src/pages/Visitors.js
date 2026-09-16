import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const Visitors = () => {
  const [visitors, setVisitors] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    firstname: '',
    lastname: '',
    phone: '',
    email: '',
    sex: 'male',
    first_visit_date: new Date().toISOString().slice(0, 10),
    invited_by: '',
    service_attended: '',
    prayer_request: '',
    notes: ''
  });

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/visitors', {
        params: { q: q || undefined, status: status || undefined, page, limit: 25 }
      });
      setVisitors(res.data.visitors || []);
      setPipeline(res.data.pipeline || []);
      setPagination(res.data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load visitors');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    load(1);
  }, [load]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/visitors', form);
      setShowCreate(false);
      window.location.href = `/visitors/${res.data.visitor.id}`;
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Visitors</h1>
          <p className="members-sub">Registration & follow-up pipeline</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : 'Register Visitor'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="members-bulk" style={{ flexWrap: 'wrap' }}>
        {pipeline.map((p) => (
          <button
            key={p.status}
            type="button"
            className={`btn ${status === p.status ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatus(status === p.status ? '' : p.status)}
          >
            {p.status} ({p.count})
          </button>
        ))}
      </div>

      {showCreate && (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="member-form-grid">
            <div className="form-group">
              <label>First name *</label>
              <input required value={form.firstname} onChange={set('firstname')} />
            </div>
            <div className="form-group">
              <label>Last name *</label>
              <input required value={form.lastname} onChange={set('lastname')} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.sex} onChange={set('sex')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="form-group">
              <label>First visit</label>
              <input type="date" value={form.first_visit_date} onChange={set('first_visit_date')} />
            </div>
            <div className="form-group">
              <label>Invited by</label>
              <input value={form.invited_by} onChange={set('invited_by')} />
            </div>
            <div className="form-group">
              <label>Service attended</label>
              <input value={form.service_attended} onChange={set('service_attended')} placeholder="Sunday worship" />
            </div>
            <div className="form-group full">
              <label>Prayer request</label>
              <textarea rows={2} value={form.prayer_request} onChange={set('prayer_request')} />
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={set('notes')} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
            Save visitor
          </button>
        </form>
      )}

      <div className="members-filters">
        <input
          type="search"
          placeholder="Search visitors…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={() => load(1)}>
          Search
        </button>
      </div>

      <div className="card members-table-wrap">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>First visit</th>
                <th>Status</th>
                <th>Assigned</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!visitors.length && (
                <tr>
                  <td colSpan={6}>
                    No visitors yet. Use “Add visitor” above to start the follow-up pipeline.
                  </td>
                </tr>
              )}
              {visitors.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.firstname} {v.lastname}
                  </td>
                  <td>
                    {v.phone || '—'}
                    {v.email ? <div style={{ fontSize: 12, color: '#888' }}>{v.email}</div> : null}
                  </td>
                  <td>{v.first_visit_date || '—'}</td>
                  <td>
                    <span className={`member-status status-${(v.follow_up_status || 'New').toLowerCase().replace(/\s+/g, '-')}`}>
                      {v.follow_up_status}
                    </span>
                  </td>
                  <td>{v.assigned_name || '—'}</td>
                  <td>
                    <Link to={`/visitors/${v.id}`} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 14 }}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="members-pager">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pagination.page <= 1}
          onClick={() => load(pagination.page - 1)}
        >
          Previous
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => load(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Visitors;
