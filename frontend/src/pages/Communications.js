import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Communications.css';

const Communications = () => {
  const [activeTab, setActiveTab] = useState('inbox');
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [selectedCommunication, setSelectedCommunication] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [channelSettings, setChannelSettings] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [ministries, setMinistries] = useState([]);
  const [annForm, setAnnForm] = useState({
    title: '',
    body: '',
    audienceType: 'branch',
    audienceRefId: '',
    channels: { in_app: true, email: false, sms: false, whatsapp: false }
  });
  const [outreachMsg, setOutreachMsg] = useState('');
  const [outreachErr, setOutreachErr] = useState('');

  useEffect(() => {
    fetchData();
    fetchUsers();
    // Refresh every 30 seconds for real-time updates
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (['announcements', 'channels', 'reminders'].includes(activeTab)) {
      loadOutreach(activeTab);
    }
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const [inboxRes, sentRes, unreadRes] = await Promise.all([
        axios.get('/api/communications/inbox'),
        axios.get('/api/communications/sent'),
        axios.get('/api/communications/inbox/unread-count')
      ]);
      
      setInbox(inboxRes.data || []);
      setSent(sentRes.data || []);
      setUnreadCount(unreadRes.data?.unreadCount || 0);
    } catch (error) {
      console.error('Error fetching communications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOutreach = async (tab) => {
    setOutreachErr('');
    try {
      if (tab === 'announcements') {
        const [a, g] = await Promise.all([
          axios.get('/api/outreach/announcements'),
          axios.get('/api/groups')
        ]);
        setAnnouncements(a.data.announcements || []);
        setMinistries(g.data.ministries || g.data.groups || []);
      } else if (tab === 'channels') {
        const c = await axios.get('/api/outreach/channels');
        setChannelSettings(c.data);
      } else if (tab === 'reminders') {
        const r = await axios.get('/api/outreach/reminders?status=ready');
        setReminders(r.data.reminders || []);
      }
    } catch (err) {
      setOutreachErr(err.response?.data?.error || err.message);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleMarkAsRead = async (commId) => {
    try {
      await axios.post(`/api/communications/${commId}/read`);
      fetchData();
      if (selectedCommunication?.id === commId) {
        setSelectedCommunication({ ...selectedCommunication, is_read: 1, status: 'read' });
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleAcknowledge = async (commId, message) => {
    try {
      await axios.post(`/api/communications/${commId}/acknowledge`, {
        acknowledgment_message: message
      });
      fetchData();
      if (selectedCommunication?.id === commId) {
        setSelectedCommunication({ ...selectedCommunication, is_acknowledged: 1, status: 'acknowledged' });
      }
    } catch (error) {
      console.error('Error acknowledging:', error);
    }
  };

  const handleReply = async (commId, message, files) => {
    try {
      const formData = new FormData();
      formData.append('message', message);
      if (files && files.length > 0) {
        Array.from(files).forEach(file => {
          formData.append('attachments', file);
        });
      }
      await axios.post(`/api/communications/${commId}/reply`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      fetchData();
      if (selectedCommunication?.id === commId) {
        const comm = activeTab === 'inbox' 
          ? inbox.find(c => c.id === commId)
          : sent.find(c => c.id === commId);
        if (comm) {
          const fullComm = await axios.get(`/api/communications/${commId}`);
          setSelectedCommunication(fullComm.data);
        }
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply: ' + (error.response?.data?.error || error.message));
    }
  };

  const getStatusBadge = (status, isRead, isAcknowledged) => {
    if (isAcknowledged) {
      return <span className="badge badge-acknowledged">✓ Acknowledged</span>;
    }
    if (isRead) {
      return <span className="badge badge-read">✓ Read</span>;
    }
    return <span className="badge badge-unread">● Unread</span>;
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      urgent: 'badge-urgent',
      high: 'badge-high',
      normal: 'badge-normal',
      low: 'badge-low'
    };
    return <span className={`badge ${colors[priority] || 'badge-normal'}`}>{priority}</span>;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const createAnnouncement = async (e) => {
    e.preventDefault();
    setOutreachErr('');
    try {
      const res = await axios.post('/api/outreach/announcements', {
        ...annForm,
        audienceRefId: annForm.audienceRefId || undefined
      });
      if (window.confirm('Send now?')) {
        await axios.post(`/api/outreach/announcements/${res.data.id}/send`);
        setOutreachMsg('Announcement sent');
      } else {
        setOutreachMsg('Announcement saved as draft');
      }
      setAnnForm({
        title: '',
        body: '',
        audienceType: 'branch',
        audienceRefId: '',
        channels: { in_app: true, email: false, sms: false, whatsapp: false }
      });
      loadOutreach('announcements');
    } catch (err) {
      setOutreachErr(err.response?.data?.error || 'Failed');
    }
  };

  const saveChannels = async () => {
    try {
      const s = channelSettings?.settings || {};
      await axios.patch('/api/outreach/channels', {
        emailEnabled: !!s.email_enabled,
        emailProviderReady: !!s.email_provider_ready,
        emailFrom: s.email_from || '',
        smsEnabled: !!s.sms_enabled,
        smsProviderReady: !!s.sms_provider_ready,
        whatsappEnabled: !!s.whatsapp_enabled,
        whatsappProviderReady: !!s.whatsapp_provider_ready
      });
      setOutreachMsg('Channel settings saved');
      loadOutreach('channels');
    } catch (err) {
      setOutreachErr(err.response?.data?.error || 'Save failed');
    }
  };

  const scanReminders = async () => {
    try {
      const res = await axios.post('/api/outreach/reminders/scan');
      setOutreachMsg(`Scan complete — ${res.data.created} new reminder(s)`);
      loadOutreach('reminders');
    } catch (err) {
      setOutreachErr(err.response?.data?.error || 'Scan failed');
    }
  };

  const dispatchReminder = async (id) => {
    try {
      await axios.post(`/api/outreach/reminders/${id}/dispatch`);
      setOutreachMsg('Reminder dispatched');
      loadOutreach('reminders');
    } catch (err) {
      setOutreachErr(err.response?.data?.error || 'Dispatch failed');
    }
  };

  if (loading) {
    return <div className="loading">Loading communications...</div>;
  }

  return (
    <div className="communications-container">
      <div className="communications-header">
        <h1>Communications</h1>
        {(activeTab === 'inbox' || activeTab === 'sent') && (
          <button className="btn-compose" onClick={() => setShowCompose(true)}>
            Compose New Message
          </button>
        )}
      </div>

      {outreachMsg && <div className="success-message">{outreachMsg}</div>}
      {outreachErr && <div className="error-message">{outreachErr}</div>}

      <div className="communications-tabs">
        <button
          className={`tab ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          Inbox {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
        </button>
        <button
          className={`tab ${activeTab === 'sent' ? 'active' : ''}`}
          onClick={() => setActiveTab('sent')}
        >
          Sent
        </button>
        <button
          className={`tab ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          Announcements
        </button>
        <button
          className={`tab ${activeTab === 'channels' ? 'active' : ''}`}
          onClick={() => setActiveTab('channels')}
        >
          Channels
        </button>
        <button
          className={`tab ${activeTab === 'reminders' ? 'active' : ''}`}
          onClick={() => setActiveTab('reminders')}
        >
          Reminders
        </button>
      </div>

      {activeTab === 'announcements' && (
        <div style={{ padding: 16 }}>
          <form className="card" onSubmit={createAnnouncement} style={{ padding: 16, marginBottom: 16 }}>
            <h2>New announcement</h2>
            <div className="form-group">
              <label>Title</label>
              <input
                required
                value={annForm.title}
                onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Body</label>
              <textarea
                required
                rows={3}
                value={annForm.body}
                onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Audience</label>
              <select
                value={annForm.audienceType}
                onChange={(e) => setAnnForm({ ...annForm, audienceType: e.target.value })}
              >
                <option value="church">Entire church</option>
                <option value="branch">This branch</option>
                <option value="ministry">Ministry / group</option>
                <option value="staff">Staff</option>
                <option value="department">Department</option>
              </select>
            </div>
            {annForm.audienceType === 'ministry' && (
              <div className="form-group">
                <label>Ministry</label>
                <select
                  value={annForm.audienceRefId}
                  onChange={(e) => setAnnForm({ ...annForm, audienceRefId: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {ministries.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {['in_app', 'email', 'sms', 'whatsapp'].map((ch) => (
                <label key={ch}>
                  <input
                    type="checkbox"
                    checked={!!annForm.channels[ch]}
                    onChange={(e) =>
                      setAnnForm({
                        ...annForm,
                        channels: { ...annForm.channels, [ch]: e.target.checked }
                      })
                    }
                  />{' '}
                  {ch}
                </label>
              ))}
            </div>
            <button type="submit" className="btn btn-primary">
              Save &amp; send
            </button>
          </form>
          <div className="card" style={{ padding: 16 }}>
            <h2>Recent announcements</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Recipients</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{a.audience_type}</td>
                    <td>{a.status}</td>
                    <td>{a.recipient_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'channels' && channelSettings && (
        <div className="card" style={{ padding: 16, margin: 16 }}>
          <h2>Channel readiness</h2>
          <p>Mark providers ready when credentials are configured (delivery in Phase 24).</p>
          {[
            ['email_enabled', 'email_provider_ready', 'Email'],
            ['sms_enabled', 'sms_provider_ready', 'SMS'],
            ['whatsapp_enabled', 'whatsapp_provider_ready', 'WhatsApp']
          ].map(([en, ready, label]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <strong>{label}</strong>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={!!channelSettings.settings[en]}
                  onChange={(e) =>
                    setChannelSettings({
                      ...channelSettings,
                      settings: { ...channelSettings.settings, [en]: e.target.checked ? 1 : 0 }
                    })
                  }
                />{' '}
                Enabled
              </label>{' '}
              <label>
                <input
                  type="checkbox"
                  checked={!!channelSettings.settings[ready]}
                  onChange={(e) =>
                    setChannelSettings({
                      ...channelSettings,
                      settings: { ...channelSettings.settings, [ready]: e.target.checked ? 1 : 0 }
                    })
                  }
                />{' '}
                Provider ready
              </label>
            </div>
          ))}
          <div className="form-group">
            <label>Email from</label>
            <input
              value={channelSettings.settings.email_from || ''}
              onChange={(e) =>
                setChannelSettings({
                  ...channelSettings,
                  settings: { ...channelSettings.settings, email_from: e.target.value }
                })
              }
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={saveChannels}>
            Save channels
          </button>
        </div>
      )}

      {activeTab === 'reminders' && (
        <div className="card" style={{ padding: 16, margin: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Reminder queue</h2>
            <button type="button" className="btn btn-secondary" onClick={scanReminders}>
              Scan events / birthdays / follow-ups
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reminders.map((r) => (
                <tr key={r.id}>
                  <td>{r.reminder_type}</td>
                  <td>{r.title}</td>
                  <td>{r.due_at || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '4px 8px', fontSize: 13 }}
                      onClick={() => dispatchReminder(r.id)}
                    >
                      Dispatch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(activeTab === 'inbox' || activeTab === 'sent') && (
      <div className="communications-content">
        <div className="communications-list">
          {(activeTab === 'inbox' ? inbox : sent).length === 0 ? (
            <div className="no-communications">
              No {activeTab === 'inbox' ? 'received' : 'sent'} communications
            </div>
          ) : (
            (activeTab === 'inbox' ? inbox : sent).map(comm => (
              <div
                key={comm.id}
                className={`communication-item ${!comm.is_read && activeTab === 'inbox' ? 'unread' : ''}`}
                onClick={() => {
                  setSelectedCommunication(comm);
                  if (activeTab === 'inbox' && !comm.is_read) {
                    handleMarkAsRead(comm.id);
                  }
                }}
              >
                <div className="communication-item-header">
                  <div>
                    <h3>{comm.subject}</h3>
                    <p className="communication-meta">
                      {activeTab === 'inbox' ? `From: ${comm.sender_name}` : `To: ${comm.recipient_name}`}
                      {comm.sender_role && ` (${comm.sender_role})`}
                    </p>
                  </div>
                  <div className="communication-badges">
                    {getStatusBadge(comm.status, comm.is_read, comm.is_acknowledged)}
                    {getPriorityBadge(comm.priority)}
                  </div>
                </div>
                <p className="communication-preview">{comm.message.substring(0, 100)}...</p>
                <div className="communication-footer">
                  <span className="communication-date">{formatDate(comm.created_at)}</span>
                  {comm.reply_count > 0 && (
                    <span className="reply-count">{comm.reply_count} reply{comm.reply_count > 1 ? 'ies' : ''}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {selectedCommunication && (
          <CommunicationDetail
            communication={selectedCommunication}
            activeTab={activeTab}
            onAcknowledge={handleAcknowledge}
            onReply={handleReply}
            onClose={() => setSelectedCommunication(null)}
          />
        )}
      </div>
      )}

      {showCompose && (
        <ComposeModal
          users={users}
          onClose={() => setShowCompose(false)}
          onSend={() => {
            setShowCompose(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

const CommunicationDetail = ({ communication, activeTab, onAcknowledge, onReply, onClose }) => {
  const [replyMessage, setReplyMessage] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [showAcknowledge, setShowAcknowledge] = useState(false);
  const [acknowledgeMessage, setAcknowledgeMessage] = useState('');
  const [replyFiles, setReplyFiles] = useState(null);

  const handleReplySubmit = () => {
    if (!replyMessage.trim()) {
      alert('Please enter a reply message');
      return;
    }
    onReply(communication.id, replyMessage, replyFiles);
    setReplyMessage('');
    setReplyFiles(null);
    setShowReply(false);
  };

  const handleAcknowledgeSubmit = () => {
    onAcknowledge(communication.id, acknowledgeMessage);
    setAcknowledgeMessage('');
    setShowAcknowledge(false);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="communication-detail">
      <div className="communication-detail-header">
        <h2>{communication.subject}</h2>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      <div className="communication-detail-body">
        <div className="communication-info">
          <p><strong>From:</strong> {communication.sender_name} {communication.sender_role && `(${communication.sender_role})`}</p>
          <p><strong>To:</strong> {communication.recipient_name} {communication.recipient_role && `(${communication.recipient_role})`}</p>
          <p><strong>Type:</strong> {communication.communication_type}</p>
          <p><strong>Priority:</strong> {communication.priority}</p>
          <p><strong>Sent:</strong> {formatDate(communication.created_at)}</p>
          {communication.read_at && <p><strong>Read:</strong> {formatDate(communication.read_at)}</p>}
          {communication.acknowledged_at && (
            <>
              <p><strong>Acknowledged:</strong> {formatDate(communication.acknowledged_at)}</p>
              {communication.acknowledgment_message && (
                <p><strong>Acknowledgment:</strong> {communication.acknowledgment_message}</p>
              )}
            </>
          )}
        </div>

        <div className="communication-message">
          <h3>Message:</h3>
          <div className="message-content">{communication.message}</div>
        </div>

        {communication.attachments && JSON.parse(communication.attachments || '[]').length > 0 && (
          <div className="communication-attachments">
            <h3>Attachments:</h3>
            {JSON.parse(communication.attachments).map((file, idx) => (
              <a key={idx} href={file} target="_blank" rel="noopener noreferrer" className="attachment-link">
                📎 {file.split('/').pop()}
              </a>
            ))}
          </div>
        )}

        {communication.replies && communication.replies.length > 0 && (
          <div className="communication-replies">
            <h3>Replies ({communication.replies.length}):</h3>
            {communication.replies.map((reply, idx) => (
              <div key={idx} className="reply-item">
                <div className="reply-header">
                  <strong>{reply.sender_name}</strong>
                  <span className="reply-date">{formatDate(reply.created_at)}</span>
                </div>
                <div className="reply-message">{reply.message}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'inbox' && !communication.is_acknowledged && (
          <div className="communication-actions">
            {!communication.is_read && (
              <button className="btn-mark-read" onClick={() => onAcknowledge(communication.id, '')}>
                Mark as Read
              </button>
            )}
            {!communication.is_acknowledged && (
              <>
                <button className="btn-acknowledge" onClick={() => setShowAcknowledge(true)}>
                  Acknowledge
                </button>
                <button className="btn-reply" onClick={() => setShowReply(true)}>
                  Reply
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'sent' && (
          <div className="communication-actions">
            <button className="btn-reply" onClick={() => setShowReply(true)}>
              Reply
            </button>
          </div>
        )}
      </div>

      {showReply && (
        <div className="reply-modal">
          <h3>Reply to {communication.subject}</h3>
          <textarea
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            placeholder="Type your reply..."
            rows="5"
          />
          <input
            type="file"
            multiple
            onChange={(e) => setReplyFiles(e.target.files)}
            style={{ marginTop: '10px' }}
          />
          <div className="modal-actions">
            <button className="btn-send" onClick={handleReplySubmit}>Send Reply</button>
            <button className="btn-cancel" onClick={() => setShowReply(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showAcknowledge && (
        <div className="acknowledge-modal">
          <h3>Acknowledge Communication</h3>
          <textarea
            value={acknowledgeMessage}
            onChange={(e) => setAcknowledgeMessage(e.target.value)}
            placeholder="Optional acknowledgment message..."
            rows="3"
          />
          <div className="modal-actions">
            <button className="btn-send" onClick={handleAcknowledgeSubmit}>Acknowledge</button>
            <button className="btn-cancel" onClick={() => setShowAcknowledge(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

const ComposeModal = ({ users, onClose, onSend }) => {
  const [recipient_id, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [communicationType, setCommunicationType] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [files, setFiles] = useState(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!recipient_id || !subject || !message) {
      alert('Please fill in all required fields');
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('recipient_id', recipient_id);
      formData.append('recipient_type', 'branch');
      formData.append('subject', subject);
      formData.append('message', message);
      formData.append('communication_type', communicationType);
      formData.append('priority', priority);
      if (files && files.length > 0) {
        Array.from(files).forEach(file => {
          formData.append('attachments', file);
        });
      }

      await axios.post('/api/communications', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert('Communication sent successfully!');
      onSend();
    } catch (error) {
      console.error('Error sending communication:', error);
      alert('Failed to send communication: ' + (error.response?.data?.error || error.message));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content compose-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Compose New Communication</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>To: *</label>
            <select
              value={recipient_id}
              onChange={(e) => setRecipientId(e.target.value)}
              required
            >
              <option value="">Select recipient...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.branchname || user.email} {user.primaryRole && `(${user.primaryRole.role_name})`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Subject: *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="Enter subject..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Type:</label>
              <select
                value={communicationType}
                onChange={(e) => setCommunicationType(e.target.value)}
              >
                <option value="general">General</option>
                <option value="outreach">Outreach</option>
                <option value="meeting">Meeting</option>
                <option value="announcement">Announcement</option>
                <option value="request">Request</option>
                <option value="report">Report</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="form-group">
              <label>Priority:</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Message: *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows="8"
              placeholder="Type your message..."
            />
          </div>

          <div className="form-group">
            <label>Attachments:</label>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-send" disabled={sending}>
              {sending ? 'Sending...' : 'Send Communication'}
            </button>
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Communications;

