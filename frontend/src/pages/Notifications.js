import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Members.css';

const TYPE_COLORS = {
  approval: '#c0392b',
  birthday: '#8e44ad',
  event: '#2980b9',
  subscription: '#d35400',
  announcement: '#16a085',
  assignment: '#27ae60',
  member: '#2c3e50',
  system: '#7f8c8d'
};

const Notifications = () => {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [meta, setMeta] = useState({ types: [], labels: {} });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [announce, setAnnounce] = useState({ title: '', message: '', audience: 'admins' });
  const [showAnnounce, setShowAnnounce] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = { limit: 100 };
      if (type) params.type = type;
      if (unreadOnly) params.unreadOnly = '1';
      const [list, m] = await Promise.all([
        axios.get('/api/notifications', { params }),
        axios.get('/api/notifications/meta')
      ]);
      setItems(list.data.notifications || []);
      setUnreadCount(list.data.unreadCount || 0);
      setTotal(list.data.total || 0);
      setMeta(m.data || { types: [], labels: {} });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [type, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id) => {
    await axios.put(`/api/notifications/${id}/read`);
    load();
  };

  const markAll = async () => {
    await axios.put('/api/notifications/read-all');
    setMessage('All marked as read');
    load();
  };

  const runScan = async () => {
    try {
      const res = await axios.post('/api/notifications/scan');
      const c = res.data.created || {};
      setMessage(
        `Scan complete — birthdays: ${c.birthdays || 0}, events: ${c.events || 0}, subscriptions: ${c.subscriptions || 0}`
      );
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Scan failed');
    }
  };

  const sendAnnounce = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/notifications/announce', announce);
      setMessage('Announcement sent');
      setAnnounce({ title: '', message: '', audience: 'admins' });
      setShowAnnounce(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Announce failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Notification Center</h1>
          <p className="members-sub">
            {unreadCount} unread · {total} in view
          </p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn" onClick={runScan}>
            Refresh alerts
          </button>
          {unreadCount > 0 && (
            <button type="button" className="btn" onClick={markAll}>
              Mark all read
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setShowAnnounce(!showAnnounce)}>
            Announce
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: '#a00', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {message && (
        <div className="card" style={{ color: '#060', marginBottom: 12 }}>
          {message}
        </div>
      )}

      {showAnnounce && (
        <form className="card" onSubmit={sendAnnounce} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>System announcement</h3>
          <div className="members-filters">
            <input
              placeholder="Title"
              value={announce.title}
              onChange={e => setAnnounce({ ...announce, title: e.target.value })}
              required
            />
            <select
              value={announce.audience}
              onChange={e => setAnnounce({ ...announce, audience: e.target.value })}
            >
              <option value="admins">Church admins</option>
              <option value="all_users">All church users</option>
            </select>
          </div>
          <textarea
            rows={3}
            placeholder="Message"
            value={announce.message}
            onChange={e => setAnnounce({ ...announce, message: e.target.value })}
            required
            style={{ width: '100%', marginBottom: 8 }}
          />
          <button type="submit" className="btn btn-primary">
            Send
          </button>
        </form>
      )}

      <div className="members-filters">
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="">All types</option>
          {(meta.types || []).map(t => (
            <option key={t} value={t}>
              {meta.labels?.[t] || t}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => setUnreadOnly(e.target.checked)}
          />
          Unread only
        </label>
      </div>

      <div className="card">
        {items.length === 0 ? (
          <p className="members-sub">No notifications yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map(n => (
              <li
                key={n.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #eee',
                  opacity: n.is_read ? 0.75 : 1,
                  cursor: n.is_read ? 'default' : 'pointer'
                }}
                onClick={() => {
                  if (!n.is_read) markRead(n.id);
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      color: TYPE_COLORS[n.notification_type] || '#555',
                      fontWeight: 600
                    }}
                  >
                    {meta.labels?.[n.notification_type] || n.notification_type}
                  </span>
                  {!n.is_read && (
                    <span style={{ fontSize: 11, background: '#3498db', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>
                      new
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontWeight: n.is_read ? 500 : 650 }}>{n.title}</div>
                <div style={{ color: '#444', marginTop: 2 }}>{n.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Notifications;
