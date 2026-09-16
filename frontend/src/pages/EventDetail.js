import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const EventDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState([]);

  const load = useCallback(async () => {
    try {
      const [detail, mem] = await Promise.all([
        axios.get(`/api/events/${id}`),
        axios.get('/api/members?limit=100')
      ]);
      setData(detail.data);
      setMembers(mem.data.members || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const register = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post(`/api/events/${id}/register`, {
        memberId: memberId || undefined,
        guestName: guestName || undefined
      });
      setMessage('Registered');
      setMemberId('');
      setGuestName('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  const markAttendance = async () => {
    if (!selected.length) return;
    try {
      await axios.post(`/api/events/${id}/attendance`, {
        registrationIds: selected,
        attended: true
      });
      setMessage('Attendance marked');
      setSelected([]);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Attendance failed');
    }
  };

  const toggleSelect = (regId) => {
    setSelected((prev) =>
      prev.includes(regId) ? prev.filter((x) => x !== regId) : [...prev, regId]
    );
  };

  const cancelReg = async (regId) => {
    try {
      await axios.patch(`/api/events/${id}/registrations/${regId}`, { status: 'cancelled' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('attachment', file);
    try {
      await axios.post(`/api/events/${id}/attachments`, fd);
      setMessage('Attachment uploaded');
      setFile(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
  };

  if (!data && !error) return <div className="members-page">Loading…</div>;
  if (!data) return <div className="members-page error-message">{error}</div>;

  const ev = data.event;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <p className="members-sub">
            <Link to="/events">← Events</Link>
          </p>
          <h1>{ev.title}</h1>
          <p className="members-sub">
            {ev.event_type} · {String(ev.date).slice(0, 10)}
            {ev.time ? ` · ${ev.time}` : ''}
            {ev.end_time ? `–${ev.end_time}` : ''}
            {ev.venue || ev.location ? ` · ${ev.venue || ev.location}` : ''}
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <h2>Details</h2>
        <p>{ev.details || ev.description || 'No description'}</p>
        <p>
          Organizer: {ev.organizer_name || ev.by_who || '—'}
          {ev.ministry_name ? ` · Ministry: ${ev.ministry_name}` : ''}
        </p>
        <p>
          Status: {ev.status || 'published'}
          {ev.registration_enabled
            ? ` · Registration open${
                ev.registration_capacity ? ` (cap ${ev.registration_capacity})` : ''
              }`
            : ' · Registration closed'}
          {ev.reminder_enabled
            ? ` · Reminder ${ev.reminder_hours_before || 24}h before`
            : ''}
        </p>
        <p>
          Stats: {data.stats?.registered || 0} registered · {data.stats?.waitlist || 0} waitlist ·{' '}
          {data.stats?.attended || 0} attended
        </p>
      </div>

      {!!ev.registration_enabled && (
        <div className="card">
          <h2>Register</h2>
          <form onSubmit={register} className="members-bulk">
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstname} {m.lastname}
                </option>
              ))}
            </select>
            <input
              placeholder="Or guest name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Register
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="members-header">
          <h2 style={{ margin: 0 }}>Registrations</h2>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selected.length}
            onClick={markAttendance}
          >
            Mark selected attended
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th>Status</th>
              <th>Attended</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data.registrations || []).map((r) => {
              const name =
                r.firstname || r.lastname
                  ? `${r.firstname || ''} ${r.lastname || ''}`.trim()
                  : r.guest_name || '—';
              return (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      disabled={r.status === 'cancelled'}
                    />
                  </td>
                  <td>{name}</td>
                  <td>{r.status}</td>
                  <td>{r.attended ? 'Yes' : 'No'}</td>
                  <td>
                    {r.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: 13 }}
                        onClick={() => cancelReg(r.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Attachments</h2>
        <form onSubmit={upload} className="members-bulk" style={{ marginBottom: 12 }}>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="submit" className="btn btn-primary" disabled={!file}>
            Upload
          </button>
        </form>
        <ul>
          {(data.attachments || []).map((a) => (
            <li key={a.id}>
              <a href={`/uploads/events/${a.filename}`} target="_blank" rel="noreferrer">
                {a.original_name || a.filename}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default EventDetail;
