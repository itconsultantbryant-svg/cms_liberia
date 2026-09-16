import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const EMPTY = {
  title: '',
  eventType: 'custom',
  date: new Date().toISOString().slice(0, 10),
  endDate: '',
  startTime: '10:00',
  endTime: '',
  venue: '',
  organizerName: '',
  details: '',
  groupId: '',
  registrationEnabled: false,
  registrationCapacity: '',
  reminderEnabled: false,
  reminderHoursBefore: 24,
  status: 'published'
};

function monthRange(base) {
  const y = base.getFullYear();
  const m = base.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

const Events = () => {
  const [events, setEvents] = useState([]);
  const [types, setTypes] = useState([]);
  const [ministries, setMinistries] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [filterType, setFilterType] = useState('');
  const [view, setView] = useState('list');
  const [month, setMonth] = useState(() => new Date());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const range = monthRange(month);
      const q = new URLSearchParams();
      if (filterType) q.set('eventType', filterType);
      if (view === 'calendar') {
        q.set('from', range.from);
        q.set('to', range.to);
      } else {
        q.set('upcoming', '1');
      }
      const [list, meta, groups] = await Promise.all([
        axios.get(`/api/events?${q.toString()}`),
        axios.get('/api/events/meta'),
        axios.get('/api/groups')
      ]);
      setEvents(list.data.events || list.data || []);
      setTypes(meta.data.eventTypes || []);
      setMinistries(groups.data.ministries || groups.data.groups || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filterType, month, view]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await axios.post('/api/events', {
        ...form,
        endDate: form.endDate || form.date,
        groupId: form.groupId || undefined,
        registrationCapacity: form.registrationCapacity
          ? Number(form.registrationCapacity)
          : undefined
      });
      setMessage('Event created');
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelEvent = async (id) => {
    if (!window.confirm('Cancel this event?')) return;
    try {
      await axios.delete(`/api/events/${id}`);
      setMessage('Event cancelled');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Cancel failed');
    }
  };

  const daysInMonth = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    return cells;
  }, [month]);

  const byDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const key = String(ev.date).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  const shiftMonth = (delta) => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  if (loading) return <div className="members-page">Loading events…</div>;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Events</h1>
          <p className="members-sub">Calendar, registration, attendance & reminders</p>
        </div>
        <div className="members-actions">
          <button
            type="button"
            className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            type="button"
            className={`btn ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={create}>
        <h2>New event</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>End date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Start time</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>End time</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Venue</label>
            <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Organizer</label>
            <input
              value={form.organizerName}
              onChange={(e) => setForm({ ...form, organizerName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Ministry</label>
            <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
              <option value="">None</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Capacity (registration)</label>
            <input
              type="number"
              min="0"
              value={form.registrationCapacity}
              onChange={(e) => setForm({ ...form, registrationCapacity: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            rows={2}
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
          />
        </div>
        <div className="members-bulk" style={{ marginBottom: 12 }}>
          <label>
            <input
              type="checkbox"
              checked={form.registrationEnabled}
              onChange={(e) => setForm({ ...form, registrationEnabled: e.target.checked })}
            />{' '}
            Enable registration
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.reminderEnabled}
              onChange={(e) => setForm({ ...form, reminderEnabled: e.target.checked })}
            />{' '}
            Reminder ready
          </label>
          {form.reminderEnabled && (
            <input
              type="number"
              min="1"
              style={{ width: 80 }}
              value={form.reminderHoursBefore}
              onChange={(e) => setForm({ ...form, reminderHoursBefore: e.target.value })}
              title="Hours before"
            />
          )}
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create event'}
        </button>
      </form>

      <div className="members-filters">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {view === 'calendar' ? (
        <div className="card">
          <div className="members-header" style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={() => shiftMonth(-1)}>
              ←
            </button>
            <h2 style={{ margin: 0 }}>
              {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <button type="button" className="btn btn-secondary" onClick={() => shiftMonth(1)}>
              →
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
              fontSize: 13
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} style={{ fontWeight: 600, textAlign: 'center', padding: 4 }}>
                {d}
              </div>
            ))}
            {daysInMonth.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />;
              const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = byDate[key] || [];
              return (
                <div
                  key={key}
                  style={{
                    minHeight: 72,
                    border: '1px solid #e5e5e5',
                    borderRadius: 4,
                    padding: 4,
                    background: dayEvents.length ? '#f7fafc' : '#fff'
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{day}</div>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Link to={`/events/${ev.id}`}>{ev.title}</Link>
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div>+{dayEvents.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>Upcoming events</h2>
          {events.length === 0 ? (
            <p className="muted">No upcoming events</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Venue</th>
                  <th>Regs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <Link to={`/events/${ev.id}`}>{ev.title}</Link>
                    </td>
                    <td>{ev.event_type || 'custom'}</td>
                    <td>{String(ev.date).slice(0, 10)}</td>
                    <td>{ev.time || ev.start_time || '—'}</td>
                    <td>{ev.venue || ev.location || '—'}</td>
                    <td>{ev.registration_count || 0}</td>
                    <td>
                      <Link
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: 13 }}
                        to={`/events/${ev.id}`}
                      >
                        Open
                      </Link>{' '}
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: 13 }}
                        onClick={() => cancelEvent(ev.id)}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default Events;
