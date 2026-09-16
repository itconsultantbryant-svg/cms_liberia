import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const PastoralCaseDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState({ body: '', noteType: 'note' });
  const [visit, setVisit] = useState({
    visitType: 'home',
    visitDate: new Date().toISOString().slice(0, 10),
    visitTime: '',
    location: '',
    notes: ''
  });

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/api/pastoral/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/pastoral/${id}/notes`, note);
      setMessage('Note added');
      setNote({ body: '', noteType: 'note' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Note failed');
    }
  };

  const addVisit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/pastoral/${id}/visits`, visit);
      setMessage('Visit recorded');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Visit failed');
    }
  };

  const setStatus = async (status) => {
    try {
      await axios.patch(`/api/pastoral/${id}`, { status });
      setMessage(`Status → ${status}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  if (!data && !error) return <div className="members-page">Loading…</div>;
  if (!data) return <div className="members-page error-message">{error}</div>;

  const c = data.case;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <p className="members-sub">
            <Link to="/pastoral">← Pastoral Care</Link>
          </p>
          <h1>{c.title}</h1>
          <p className="members-sub">
            {String(c.case_type).replace(/_/g, ' ')} · {c.priority} · {c.status}
            {' · '}
            Confidential
          </p>
        </div>
        <div className="members-actions">
          {c.status !== 'in_progress' && (
            <button type="button" className="btn btn-secondary" onClick={() => setStatus('in_progress')}>
              In progress
            </button>
          )}
          {c.status !== 'closed' && (
            <button type="button" className="btn btn-danger" onClick={() => setStatus('closed')}>
              Close
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <h2>Subject</h2>
        <p>
          {c.member_firstname
            ? `${c.member_firstname} ${c.member_lastname || ''}${
                c.membership_id ? ` (${c.membership_id})` : ''
              }`
            : c.subject_name || '—'}
        </p>
        <p>{c.summary || 'No summary'}</p>
        {c.follow_up_date && <p>Follow-up: {c.follow_up_date}</p>}
      </div>

      <div className="card">
        <h2>Notes</h2>
        <form onSubmit={addNote} style={{ marginBottom: 12 }}>
          <div className="members-bulk">
            <select
              value={note.noteType}
              onChange={(e) => setNote({ ...note, noteType: e.target.value })}
            >
              <option value="note">Note</option>
              <option value="counseling_note">Counseling note</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </div>
          <div className="form-group">
            <textarea
              required
              rows={3}
              value={note.body}
              onChange={(e) => setNote({ ...note, body: e.target.value })}
              placeholder="Confidential note…"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Add note
          </button>
        </form>
        <ul>
          {(data.notes || []).map((n) => (
            <li key={n.id} style={{ marginBottom: 8 }}>
              <strong>{n.note_type}</strong> · {n.created_at}
              <div>{n.body}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Visits</h2>
        <form onSubmit={addVisit} className="member-form-grid" style={{ marginBottom: 12 }}>
          <select
            value={visit.visitType}
            onChange={(e) => setVisit({ ...visit, visitType: e.target.value })}
          >
            <option value="home">Home</option>
            <option value="hospital">Hospital</option>
            <option value="other">Other</option>
          </select>
          <input
            type="date"
            value={visit.visitDate}
            onChange={(e) => setVisit({ ...visit, visitDate: e.target.value })}
          />
          <input
            type="time"
            value={visit.visitTime}
            onChange={(e) => setVisit({ ...visit, visitTime: e.target.value })}
          />
          <input
            placeholder="Location"
            value={visit.location}
            onChange={(e) => setVisit({ ...visit, location: e.target.value })}
          />
          <button type="submit" className="btn btn-primary">
            Record visit
          </button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Location</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data.visits || []).map((v) => (
              <tr key={v.id}>
                <td>
                  {v.visit_date}
                  {v.visit_time ? ` ${v.visit_time}` : ''}
                </td>
                <td>{v.visit_type}</td>
                <td>{v.location || '—'}</td>
                <td>{v.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PastoralCaseDetail;
