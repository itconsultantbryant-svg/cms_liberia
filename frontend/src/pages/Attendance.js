import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const Attendance = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState('headcount');
  const [attendances, setAttendances] = useState([]);
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    male: 0,
    female: 0,
    children: 0,
    type: ''
  });
  const [checkIn, setCheckIn] = useState({
    date: new Date().toISOString().split('T')[0],
    type: '',
    membershipId: ''
  });
  const [bulk, setBulk] = useState({
    date: new Date().toISOString().split('T')[0],
    type: '',
    selected: {}
  });
  const [statsGroup, setStatsGroup] = useState('service');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canManage = user?.isadmin || user?.permissionKeys?.includes?.('attendance.manage');

  const fetchData = async () => {
    try {
      const [attendancesRes, membersRes, servicesRes] = await Promise.all([
        axios.get('/api/attendance/view'),
        axios.get('/api/members', { params: { limit: 100 } }),
        axios.get('/api/services').catch(() => axios.get('/api/branches/tools/service-type'))
      ]);

      setAttendances(attendancesRes.data);
      const memberList =
        membersRes.data.members ||
        membersRes.data.data ||
        (Array.isArray(membersRes.data) ? membersRes.data : []);
      setMembers(memberList);
      setServices(servicesRes.data.services || servicesRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const loadStats = async (groupBy = statsGroup) => {
    try {
      const res = await axios.get('/api/attendance/stats/detailed', { params: { groupBy } });
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Stats failed');
    }
  };

  useEffect(() => {
    if (tab === 'stats') loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await axios.post('/api/attendance/submit', formData);
      setMessage('Attendance saved successfully');
      setFormData({
        date: new Date().toISOString().split('T')[0],
        male: 0,
        female: 0,
        children: 0,
        type: formData.type
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving attendance');
    }
  };

  const doCheckIn = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const res = await axios.post('/api/attendance/check-in', {
        date: checkIn.date,
        serviceId: checkIn.type,
        membershipId: checkIn.membershipId
      });
      setMessage(res.data.already ? 'Already checked in' : `Checked in ${res.data.member?.name || ''}`);
      setCheckIn({ ...checkIn, membershipId: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Check-in failed');
    }
  };

  const saveBulk = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    const list = members.map((m) => ({
      id: m.id,
      attendance: bulk.selected[m.id] ? 'yes' : 'no'
    }));
    try {
      const res = await axios.post('/api/attendance/mark-bulk', {
        date: bulk.date,
        serviceId: bulk.type,
        members: list.filter((x) => x.attendance === 'yes')
      });
      setMessage(`Bulk saved (${res.data.saved} new, ${res.data.updated} updated)`);
    } catch (err) {
      setError(err.response?.data?.error || 'Bulk failed');
    }
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Attendance</h1>
          <p className="members-sub">Headcount, member check-in, bulk &amp; statistics</p>
        </div>
      </div>

      <div className="members-bulk">
        {['headcount', 'checkin', 'bulk', 'stats'].map((t) => (
          <button
            key={t}
            type="button"
            className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t === 'headcount' ? 'Headcount' : t === 'checkin' ? 'Member / ID check-in' : t === 'bulk' ? 'Bulk select' : 'Statistics'}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {tab === 'headcount' && canManage && (
        <div className="card">
          <h2>Manual headcount</h2>
          <form onSubmit={handleSubmit}>
            <div className="member-form-grid">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Service</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="">Select service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Male</label>
                <input
                  type="number"
                  min="0"
                  value={formData.male}
                  onChange={(e) => setFormData({ ...formData, male: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Female</label>
                <input
                  type="number"
                  min="0"
                  value={formData.female}
                  onChange={(e) => setFormData({ ...formData, female: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Children</label>
                <input
                  type="number"
                  min="0"
                  value={formData.children}
                  onChange={(e) => setFormData({ ...formData, children: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
              Save
            </button>
          </form>
        </div>
      )}

      {tab === 'checkin' && canManage && (
        <div className="card">
          <h2>Check in by membership ID</h2>
          <p className="members-sub">Also accepts QR tokens via API (`POST /api/attendance/check-in`).</p>
          <form onSubmit={doCheckIn}>
            <div className="member-form-grid">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={checkIn.date}
                  onChange={(e) => setCheckIn({ ...checkIn, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Service</label>
                <select
                  value={checkIn.type}
                  onChange={(e) => setCheckIn({ ...checkIn, type: e.target.value })}
                  required
                >
                  <option value="">Select service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group full">
                <label>Membership ID</label>
                <input
                  required
                  placeholder="e.g. MEM-001-00042"
                  value={checkIn.membershipId}
                  onChange={(e) => setCheckIn({ ...checkIn, membershipId: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
              Check in
            </button>
          </form>
        </div>
      )}

      {tab === 'bulk' && canManage && (
        <form className="card" onSubmit={saveBulk}>
          <h2>Bulk member selection</h2>
          <div className="member-form-grid">
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={bulk.date}
                onChange={(e) => setBulk({ ...bulk, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Service</label>
              <select
                value={bulk.type}
                onChange={(e) => setBulk({ ...bulk, type: e.target.value })}
                required
              >
                <option value="">Select service</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 12 }}>
            {members.map((m) => (
              <label key={m.id} style={{ display: 'block', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={!!bulk.selected[m.id]}
                  onChange={(e) =>
                    setBulk({
                      ...bulk,
                      selected: { ...bulk.selected, [m.id]: e.target.checked }
                    })
                  }
                />{' '}
                {m.firstname} {m.lastname}{' '}
                <span style={{ color: '#888', fontSize: 12 }}>({m.membership_id || m.id})</span>
              </label>
            ))}
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
            Save present members
          </button>
        </form>
      )}

      {tab === 'stats' && (
        <div className="card">
          <h2>Attendance statistics</h2>
          <div className="members-filters">
            <select
              value={statsGroup}
              onChange={(e) => {
                setStatsGroup(e.target.value);
                loadStats(e.target.value);
              }}
            >
              {['service', 'date', 'branch', 'gender', 'age_group', 'ministry', 'month', 'quarter', 'year'].map(
                (g) => (
                  <option key={g} value={g}>
                    By {g.replace('_', ' ')}
                  </option>
                )
              )}
            </select>
            <button type="button" className="btn btn-secondary" onClick={() => loadStats()}>
              Refresh
            </button>
          </div>
          {stats && (
            <>
              {stats.headcount && (
                <p>
                  Headcount totals — M: {stats.headcount.male} F: {stats.headcount.female} C:{' '}
                  {stats.headcount.children}
                </p>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th>{stats.groupBy}</th>
                    <th>Present</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.rows || []).map((r) => (
                    <tr key={r.key || 'x'}>
                      <td>{r.key || '—'}</td>
                      <td>{r.present}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="card members-table-wrap">
        <h2>Recent headcounts</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Service</th>
              <th>Male</th>
              <th>Female</th>
              <th>Children</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(attendances) ? attendances : []).map((a) => (
              <tr key={a.id}>
                <td>{a.attendance_date}</td>
                <td>{a.service_type_name || a.service_types_id}</td>
                <td>{a.male}</td>
                <td>{a.female}</td>
                <td>{a.children}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;
