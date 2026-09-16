import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const Households = () => {
  const [households, setHouseholds] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/households', { params: { q: q || undefined, page, limit: 25 } });
      setHouseholds(res.data.households || []);
      setPagination(res.data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load households');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load(1);
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/households', { name, address });
      setShowCreate(false);
      setName('');
      setAddress('');
      window.location.href = `/households/${res.data.household.id}`;
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Households</h1>
          <p className="members-sub">{pagination.total} families · head, spouse, children & dependents</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : 'New Household'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showCreate && (
        <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="member-form-grid">
            <div className="form-group">
              <label>Household name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Johnson Family" />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
            Create
          </button>
        </form>
      )}

      <div className="members-filters">
        <input
          type="search"
          placeholder="Search households…"
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
                <th>Head</th>
                <th>Members</th>
                <th>City</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!households.length && (
                <tr>
                  <td colSpan={5}>No households yet</td>
                </tr>
              )}
              {households.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td>
                    {h.head_firstname
                      ? `${h.head_firstname} ${h.head_lastname || ''}`
                      : '—'}
                  </td>
                  <td>{h.member_count || 0}</td>
                  <td>{h.city || '—'}</td>
                  <td>
                    <Link to={`/households/${h.id}`} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 14 }}>
                      View
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

export default Households;
