import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const EMPTY = {
  caseType: 'prayer_request',
  title: '',
  summary: '',
  memberId: '',
  subjectName: '',
  priority: 'normal',
  followUpDate: ''
};

const PastoralCare = () => {
  const [cases, setCases] = useState([]);
  const [meta, setMeta] = useState({ caseTypes: [], priorities: [] });
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [filterType, setFilterType] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const q = filterType ? `?caseType=${encodeURIComponent(filterType)}` : '';
      const [list, m, mem] = await Promise.all([
        axios.get(`/api/pastoral${q}`),
        axios.get('/api/pastoral/meta'),
        axios.get('/api/members?limit=100')
      ]);
      setCases(list.data.cases || []);
      setMeta(m.data);
      setMembers(mem.data.members || []);
      setForbidden(false);
    } catch (err) {
      if (err.response?.status === 403) {
        setForbidden(true);
        setError('Confidential pastoral care — access requires pastoral permission.');
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/pastoral', {
        ...form,
        memberId: form.memberId ? Number(form.memberId) : undefined,
        subjectName: form.subjectName || undefined
      });
      setMessage('Case created');
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  const closeCase = async (id) => {
    if (!window.confirm('Close this pastoral case?')) return;
    try {
      await axios.delete(`/api/pastoral/${id}`);
      setMessage('Case closed');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Close failed');
    }
  };

  if (loading) return <div className="members-page">Loading pastoral care…</div>;

  if (forbidden) {
    return (
      <div className="members-page">
        <h1>Pastoral Care</h1>
        <div className="error-message">{error}</div>
        <p className="members-sub">
          This module is confidential. Ordinary church administrators cannot view it unless they hold a
          pastoral role (e.g. Senior Pastor, Resident Pastor).
        </p>
      </div>
    );
  }

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Pastoral Care</h1>
          <p className="members-sub">Confidential — prayer, counseling, visits, bereavement & welfare</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={create}>
        <h2>New case</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Type</label>
            <select
              value={form.caseType}
              onChange={(e) => setForm({ ...form, caseType: e.target.value })}
            >
              {(meta.caseTypes || []).map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Member</label>
            <select
              value={form.memberId}
              onChange={(e) => setForm({ ...form, memberId: e.target.value })}
            >
              <option value="">Select…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstname} {m.lastname}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Or subject name</label>
            <input
              value={form.subjectName}
              onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {(meta.priorities || ['low', 'normal', 'high', 'urgent']).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Follow-up date</label>
            <input
              type="date"
              value={form.followUpDate}
              onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Summary</label>
          <textarea
            rows={2}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Create case
        </button>
      </form>

      <div className="members-filters">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {(meta.caseTypes || []).map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>Open cases</h2>
        {cases.length === 0 ? (
          <p className="muted">No open pastoral cases</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/pastoral/${c.id}`}>{c.title}</Link>
                  </td>
                  <td>{String(c.case_type).replace(/_/g, ' ')}</td>
                  <td>
                    {c.member_firstname
                      ? `${c.member_firstname} ${c.member_lastname || ''}`
                      : c.subject_name || '—'}
                  </td>
                  <td>{c.priority}</td>
                  <td>{c.status}</td>
                  <td>
                    <Link
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: 13 }}
                      to={`/pastoral/${c.id}`}
                    >
                      Open
                    </Link>{' '}
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '4px 8px', fontSize: 13 }}
                      onClick={() => closeCase(c.id)}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PastoralCare;
