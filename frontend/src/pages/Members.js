import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const STATUSES = ['', 'Active', 'Inactive', 'Visitor', 'Transferred', 'Deceased', 'Suspended'];

const Members = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sex, setSex] = useState('');
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const canManage = user?.isadmin || user?.permissionKeys?.includes?.('members.create');

  const fetchMembers = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/members', {
        params: {
          q: q || undefined,
          status: status || undefined,
          sex: sex || undefined,
          page,
          limit: pagination.limit,
          allBranches: user?.isadmin ? '1' : undefined
        }
      });
      const list = response.data.members || response.data.data || (Array.isArray(response.data) ? response.data : []);
      setMembers(list);
      if (response.data.pagination) setPagination(response.data.pagination);
      setSelected([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [q, status, sex, pagination.limit, user?.isadmin]);

  useEffect(() => {
    fetchMembers(1);
  }, [fetchMembers]);

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selected.length === members.length) setSelected([]);
    else setSelected(members.map((m) => m.id));
  };

  const exportCsv = () => {
    axios
      .get('/api/members/export', {
        params: { q: q || undefined, status: status || undefined, allBranches: user?.isadmin ? '1' : undefined },
        responseType: 'blob'
      })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'members.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => setError('Export failed'));
  };

  const bulkStatus = async (membershipStatus) => {
    if (!selected.length) return;
    try {
      await axios.post('/api/members/bulk', { ids: selected, action: 'set_status', membershipStatus });
      setMessage(`Updated ${selected.length} member(s) to ${membershipStatus}`);
      fetchMembers(pagination.page);
    } catch (err) {
      setError(err.response?.data?.error || 'Bulk update failed');
    }
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post('/api/members/import', form);
      setMessage(`Imported ${res.data.created} (skipped ${res.data.skipped})`);
      fetchMembers(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Members</h1>
          <p className="members-sub">{pagination.total} total · search, filter, import &amp; export</p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          {canManage && (
            <>
              <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                {importing ? 'Importing…' : 'Import CSV'}
                <input type="file" accept=".csv,text/csv" hidden onChange={onImport} />
              </label>
              <Link to="/members/new" className="btn btn-primary">
                Add Member
              </Link>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="members-filters">
        <input
          type="search"
          placeholder="Search name, email, phone, membership ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
        <select value={sex} onChange={(e) => setSex(e.target.value)}>
          <option value="">All genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={() => fetchMembers(1)}>
          Apply
        </button>
      </div>

      {selected.length > 0 && (
        <div className="members-bulk">
          <span>{selected.length} selected</span>
          <button type="button" className="btn btn-secondary" onClick={() => bulkStatus('Active')}>
            Mark Active
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => bulkStatus('Inactive')}>
            Mark Inactive
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => bulkStatus('Suspended')}>
            Suspend
          </button>
        </div>
      )}

      <div className="card members-table-wrap">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={members.length > 0 && selected.length === members.length}
                    onChange={toggleAll}
                  />
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Ministry</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!members.length && (
                <tr>
                  <td colSpan={8}>
                    {q || status || sex
                      ? 'No members match your search or filters.'
                      : 'No members yet.'}{' '}
                    {canManage && !q && !status && !sex && (
                      <Link to="/members/new">Add the first member</Link>
                    )}
                  </td>
                </tr>
              )}
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(member.id)}
                      onChange={() => toggleSelect(member.id)}
                    />
                  </td>
                  <td>
                    <code>{member.membership_id || member.id}</code>
                  </td>
                  <td>
                    {member.firstname} {member.middlename || ''} {member.lastname}
                  </td>
                  <td>{member.email}</td>
                  <td>{member.phone || '—'}</td>
                  <td>
                    <span className={`member-status status-${(member.membership_status || 'Active').toLowerCase()}`}>
                      {member.membership_status || 'Active'}
                    </span>
                  </td>
                  <td>{member.ministry || '—'}</td>
                  <td>
                    <Link to={`/members/${member.id}`} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 14 }}>
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
          onClick={() => fetchMembers(pagination.page - 1)}
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
          onClick={() => fetchMembers(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Members;
