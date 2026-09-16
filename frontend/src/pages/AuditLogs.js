import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Members.css';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState({ actions: [], immutable: true });
  const [filters, setFilters] = useState({
    action: '',
    resource: '',
    q: '',
    from: '',
    to: ''
  });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const [list, m] = await Promise.all([
        axios.get('/api/audit', { params }),
        axios.get('/api/audit/meta')
      ]);
      setLogs(list.data.logs || []);
      setTotal(list.data.total || 0);
      setMeta(m.data || { actions: [], immutable: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const parseJson = (v) => {
    if (!v) return null;
    try {
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch (_) {
      return v;
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Audit Log</h1>
          <p className="members-sub">
            Immutable activity history · {total} matching records
            {meta.immutable ? ' · cannot be deleted' : ''}
          </p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn btn-primary" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: '#a00', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="members-filters">
        <select
          value={filters.action}
          onChange={e => setFilters({ ...filters, action: e.target.value })}
        >
          <option value="">All actions</option>
          {(meta.actions || []).map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          placeholder="Resource (e.g. member)"
          value={filters.resource}
          onChange={e => setFilters({ ...filters, resource: e.target.value })}
        />
        <input
          placeholder="Search summary / email"
          value={filters.q}
          onChange={e => setFilters({ ...filters, q: e.target.value })}
        />
        <input
          type="date"
          value={filters.from}
          onChange={e => setFilters({ ...filters, from: e.target.value })}
        />
        <input
          type="date"
          value={filters.to}
          onChange={e => setFilters({ ...filters, to: e.target.value })}
        />
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Resource</th>
                <th>User</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5}>No audit records for these filters.</td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr
                    key={log.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(log)}
                  >
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>
                      <code>{log.action}</code>
                    </td>
                    <td>
                      {log.resource}
                      {log.resource_id ? ` #${log.resource_id}` : ''}
                    </td>
                    <td>{log.user_email || log.user_id || '—'}</td>
                    <td>{log.summary || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="members-header">
            <h3 style={{ margin: 0 }}>Record #{selected.id}</h3>
            <button type="button" className="btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p>
            <strong>{selected.action}</strong> on {selected.resource}
            {selected.resource_id ? ` #${selected.resource_id}` : ''}
          </p>
          <p>{selected.summary}</p>
          <p className="members-sub">
            {selected.user_email || '—'} · IP {selected.ip_address || '—'} ·{' '}
            {new Date(selected.created_at).toLocaleString()}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <h4>Previous</h4>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f7f7f7', padding: 8 }}>
                {JSON.stringify(parseJson(selected.previous_values), null, 2) || '—'}
              </pre>
            </div>
            <div>
              <h4>New</h4>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f7f7f7', padding: 8 }}>
                {JSON.stringify(parseJson(selected.new_values), null, 2) || '—'}
              </pre>
            </div>
          </div>
          {selected.user_agent && (
            <p className="members-sub" style={{ marginTop: 8 }}>
              UA: {selected.user_agent}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
