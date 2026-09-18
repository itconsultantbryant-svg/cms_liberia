import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const VisitorProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visitor, setVisitor] = useState(null);
  const [history, setHistory] = useState([]);
  const [convertedMember, setConvertedMember] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [nextStatus, setNextStatus] = useState('');

  const canManage = user?.isadmin || user?.permissionKeys?.includes?.('members.create') || user?.permissionKeys?.includes?.('members.update');

  const load = async () => {
    try {
      const res = await axios.get(`/api/visitors/${id}`);
      setVisitor(res.data.visitor);
      setHistory(res.data.history || []);
      setConvertedMember(res.data.convertedMember);
      setStatuses(res.data.followUpStatuses || []);
      setNextStatus(res.data.visitor.follow_up_status);
    } catch (err) {
      setError(err.response?.data?.error || 'Not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const advance = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/visitors/${id}/follow-up`, { status: nextStatus, notes });
      setMessage(`Moved to ${nextStatus}`);
      setNotes('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  const convert = async () => {
    if (!window.confirm('Convert this visitor to a church member? Profile fields will be copied automatically.')) return;
    try {
      const res = await axios.post(`/api/visitors/${id}/convert`);
      setMessage('Converted to member');
      navigate(`/members/${res.data.member.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Convert failed');
    }
  };

  const closeOut = async () => {
    try {
      await axios.post(`/api/visitors/${id}/follow-up`, { status: 'Closed', notes: notes || 'Closed' });
      setMessage('Visitor closed');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Close failed');
    }
  };

  if (loading) return <div>Loading…</div>;
  if (!visitor) return <div>{error || 'Not found'}</div>;

  const canConvert =
    canManage &&
    !visitor.converted_member_id &&
    visitor.follow_up_status !== 'Closed' &&
    visitor.follow_up_status !== 'Converted';

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>
            {visitor.firstname} {visitor.lastname}
          </h1>
          <p className="members-sub">
            <span className={`member-status status-${(visitor.follow_up_status || '').toLowerCase().replace(/\s+/g, '-')}`}>
              {visitor.follow_up_status}
            </span>
            {visitor.first_visit_date ? ` · First visit ${visitor.first_visit_date}` : ''}
          </p>
        </div>
        <div className="members-actions">
          <Link to="/visitors" className="btn btn-secondary">
            Back
          </Link>
          {canConvert && (
            <button type="button" className="btn btn-primary" onClick={convert}>
              Convert to member
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <h2>Visitor details</h2>
        <div className="member-form-grid">
          <p><strong>Phone:</strong> {visitor.phone || '—'}</p>
          <p><strong>Email:</strong> {visitor.email || '—'}</p>
          <p><strong>Gender:</strong> {visitor.sex || '—'}</p>
          <p><strong>Address:</strong> {[visitor.address, visitor.city, visitor.state].filter(Boolean).join(', ') || '—'}</p>
          <p><strong>Invited by:</strong> {visitor.invited_by || '—'}</p>
          <p><strong>Service:</strong> {visitor.service_attended || '—'}</p>
          <p className="full"><strong>Prayer request:</strong> {visitor.prayer_request || '—'}</p>
          <p className="full"><strong>Notes:</strong> {visitor.notes || '—'}</p>
        </div>
        {convertedMember && (
          <p style={{ marginTop: 12 }}>
            Converted to member:{' '}
            <Link to={`/members/${convertedMember.id}`}>
              {convertedMember.firstname} {convertedMember.lastname} ({convertedMember.membership_id})
            </Link>
          </p>
        )}
      </div>

      {canManage && visitor.follow_up_status !== 'Converted' && (
        <form className="card" onSubmit={advance}>
          <h2>Follow-up</h2>
          <div className="member-form-grid">
            <div className="form-group">
              <label>Status</label>
              <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn-primary">
              Update status
            </button>
            {visitor.follow_up_status !== 'Closed' && (
              <button type="button" className="btn btn-secondary" onClick={closeOut}>
                Close
              </button>
            )}
          </div>
        </form>
      )}

      <div className="card">
        <h2>Follow-up history</h2>
        {!history.length && <p>No history yet</p>}
        <ul>
          {history.map((h) => (
            <li key={h.id}>
              <strong>{h.from_status || '—'}</strong> → <strong>{h.to_status}</strong>
              {h.notes ? ` — ${h.notes}` : ''}
              <div style={{ fontSize: 12, color: '#888' }}>
                {h.created_at}
                {h.created_by_name ? ` · ${h.created_by_name}` : ''}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default VisitorProfile;
