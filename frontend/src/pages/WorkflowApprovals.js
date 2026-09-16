import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './ChurchBranding.css';

const WorkflowApprovals = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [definitions, setDefinitions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});

  const load = useCallback(async () => {
    setError('');
    try {
      const [reqRes, defRes] = await Promise.all([
        axios.get('/api/workflows/requests', { params: { status: filter || undefined } }),
        axios.get('/api/workflows/definitions')
      ]);
      setRequests(reqRes.data.requests || []);
      setDefinitions(defRes.data.workflows || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id, action) => {
    setMessage('');
    setError('');
    try {
      await axios.post(`/api/workflows/requests/${id}/decide`, {
        action,
        comments: comments[id] || ''
      });
      setMessage(action === 'approve' ? 'Approved' : 'Rejected');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const cancel = async (id) => {
    try {
      await axios.post(`/api/workflows/requests/${id}/cancel`);
      setMessage('Cancelled');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="branding-page" style={{ maxWidth: 960 }}>
      <h1>Approval Workflows</h1>
      <p className="branding-sub">
        Sensitive actions (member deletion, expenses, role changes) require authorization before they become final.
      </p>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['pending', 'approved', 'rejected', 'cancelled', ''].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}
          >
            {s || 'all'}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="branding-form card">
          {!requests.length && <p>No workflow requests</p>}
          {requests.map((r) => (
            <div
              key={r.id}
              style={{
                borderBottom: '1px solid #eee',
                padding: '12px 0',
                marginBottom: 8
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <strong>{r.action_type}</strong>{' '}
                  <span className={`status-pill status-${r.status === 'approved' ? 'active' : r.status === 'pending' ? 'suspended' : 'archived'}`}>
                    {r.status}
                  </span>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    By {r.requester_name || r.requester_email || `#${r.requester_id}`}
                    {r.branch_name ? ` · ${r.branch_name}` : ''}
                    {r.amount != null ? ` · amount ${r.amount}` : ''}
                  </div>
                  {r.reason && <p style={{ margin: '6px 0' }}>{r.reason}</p>}
                  {r.record_type && (
                    <p style={{ fontSize: 12, color: '#888' }}>
                      {r.record_type} #{r.record_id}
                    </p>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {r.requested_at && new Date(r.requested_at).toLocaleString()}
                </div>
              </div>

              {r.status === 'pending' && (
                <div style={{ marginTop: 8 }}>
                  <input
                    placeholder="Comments"
                    value={comments[r.id] || ''}
                    onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })}
                    style={{ width: '100%', marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {r.canApprove && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => decide(r.id, 'approve')}>
                          Approve
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => decide(r.id, 'reject')}>
                          Reject
                        </button>
                      </>
                    )}
                    {(Number(r.requester_id) === Number(user?.id) || user?.isadmin) && (
                      <button type="button" className="btn-link" onClick={() => cancel(r.id)}>
                        Cancel
                      </button>
                    )}
                    {!r.canApprove && Number(r.requester_id) === Number(user?.id) && (
                      <span style={{ fontSize: 13, color: '#92400e' }}>
                        Waiting for another approver (self-approval not allowed)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="branding-form card" style={{ marginTop: 20 }}>
        <h3>Workflow definitions</h3>
        <ul>
          {definitions.map((d) => (
            <li key={`${d.id}-${d.action_type}`}>
              <strong>{d.name}</strong> ({d.action_type})
              {d.church_id ? ' · church override' : ' · platform default'}
              {' · '}
              {d.require_approval ? 'requires approval' : 'auto'}
              {d.allow_self_approve ? ' · self-approve OK' : ' · no self-approve'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default WorkflowApprovals;
