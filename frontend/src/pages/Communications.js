import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Communications.css';

const Communications = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inbox');
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [selectedCommunication, setSelectedCommunication] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchData();
    fetchUsers();
    // Refresh every 30 seconds for real-time updates
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

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

  if (loading) {
    return <div className="loading">Loading communications...</div>;
  }

  return (
    <div className="communications-container">
      <div className="communications-header">
        <h1>Inter-Office Communications</h1>
        <button className="btn-compose" onClick={() => setShowCompose(true)}>
          ✉️ Compose New Message
        </button>
      </div>

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
      </div>

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

