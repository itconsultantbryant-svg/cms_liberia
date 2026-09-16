import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const MinistryDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [membersList, setMembersList] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [addMemberId, setAddMemberId] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [meeting, setMeeting] = useState({
    meetingDate: new Date().toISOString().slice(0, 10),
    title: 'Meeting',
    attendanceCount: 0,
    notes: ''
  });
  const [announcement, setAnnouncement] = useState({ title: '', body: '' });
  const [docFile, setDocFile] = useState(null);

  const load = useCallback(async () => {
    try {
      const [detail, members] = await Promise.all([
        axios.get(`/api/groups/${id}`),
        axios.get('/api/members?limit=100')
      ]);
      setData(detail.data);
      setMembersList(members.data.members || members.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addMember = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post(`/api/groups/${id}/members`, {
        memberId: Number(addMemberId),
        role: addRole
      });
      setMessage('Member added');
      setAddMemberId('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Add failed');
    }
  };

  const setRole = async (memberId, role) => {
    try {
      await axios.patch(`/api/groups/${id}/members/${memberId}`, { role });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Role update failed');
    }
  };

  const removeMember = async (memberId) => {
    if (!window.confirm('Remove this member from the ministry?')) return;
    try {
      await axios.delete(`/api/groups/${id}/members/${memberId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Remove failed');
    }
  };

  const recordMeeting = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/groups/${id}/meetings`, meeting);
      setMessage('Meeting recorded');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Meeting failed');
    }
  };

  const postAnnouncement = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/groups/${id}/announcements`, announcement);
      setMessage('Announcement posted');
      setAnnouncement({ title: '', body: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Announcement failed');
    }
  };

  const uploadDoc = async (e) => {
    e.preventDefault();
    if (!docFile) return;
    const fd = new FormData();
    fd.append('document', docFile);
    try {
      await axios.post(`/api/groups/${id}/documents`, fd);
      setMessage('Document uploaded');
      setDocFile(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
  };

  if (!data && !error) return <div className="members-page">Loading…</div>;
  if (!data) return <div className="members-page error-message">{error}</div>;

  const g = data.group;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <p className="members-sub">
            <Link to="/groups">← Ministries</Link>
          </p>
          <h1>{g.name}</h1>
          <p className="members-sub">
            {g.category}
            {g.description ? ` · ${g.description}` : ''}
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <h2>Schedule</h2>
        <p>
          {[g.meeting_day, g.meeting_time, g.meeting_location].filter(Boolean).join(' · ') ||
            'No regular meeting set'}
        </p>
        <p>
          Leader:{' '}
          {g.leader_firstname
            ? `${g.leader_firstname} ${g.leader_lastname || ''}`
            : '—'}
          {' · '}
          Assistant:{' '}
          {g.assistant_firstname
            ? `${g.assistant_firstname} ${g.assistant_lastname || ''}`
            : '—'}
        </p>
      </div>

      <div className="card">
        <h2>Members ({data.members?.length || 0})</h2>
        <form onSubmit={addMember} className="members-bulk" style={{ marginBottom: 12 }}>
          <select
            required
            value={addMemberId}
            onChange={(e) => setAddMemberId(e.target.value)}
          >
            <option value="">Select member…</option>
            {membersList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstname} {m.lastname}
                {m.membership_id ? ` (${m.membership_id})` : ''}
              </option>
            ))}
          </select>
          <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="assistant">Assistant</option>
            <option value="leader">Leader</option>
          </select>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data.members || []).map((m) => (
              <tr key={m.member_id || m.id}>
                <td>
                  {m.firstname} {m.lastname}
                </td>
                <td>
                  <select
                    value={m.role || 'member'}
                    onChange={(e) => setRole(m.member_id, e.target.value)}
                  >
                    <option value="leader">Leader</option>
                    <option value="assistant">Assistant</option>
                    <option value="member">Member</option>
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '4px 8px', fontSize: 13 }}
                    onClick={() => removeMember(m.member_id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Meetings & attendance</h2>
        <form onSubmit={recordMeeting} className="member-form-grid" style={{ marginBottom: 12 }}>
          <input
            type="date"
            value={meeting.meetingDate}
            onChange={(e) => setMeeting({ ...meeting, meetingDate: e.target.value })}
          />
          <input
            placeholder="Title"
            value={meeting.title}
            onChange={(e) => setMeeting({ ...meeting, title: e.target.value })}
          />
          <input
            type="number"
            min="0"
            placeholder="Attendance"
            value={meeting.attendanceCount}
            onChange={(e) => setMeeting({ ...meeting, attendanceCount: e.target.value })}
          />
          <button type="submit" className="btn btn-primary">
            Record
          </button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {(data.meetings || []).map((m) => (
              <tr key={m.id}>
                <td>{m.meeting_date}</td>
                <td>{m.title}</td>
                <td>{m.attendance_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Announcements</h2>
        <form onSubmit={postAnnouncement} style={{ marginBottom: 12 }}>
          <div className="form-group">
            <input
              required
              placeholder="Title"
              value={announcement.title}
              onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
            />
          </div>
          <div className="form-group">
            <textarea
              rows={2}
              placeholder="Body"
              value={announcement.body}
              onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Post
          </button>
        </form>
        <ul>
          {(data.announcements || []).map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>
              {a.body ? ` — ${a.body}` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Documents</h2>
        <form onSubmit={uploadDoc} className="members-bulk" style={{ marginBottom: 12 }}>
          <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
          <button type="submit" className="btn btn-primary" disabled={!docFile}>
            Upload
          </button>
        </form>
        <ul>
          {(data.documents || []).map((d) => (
            <li key={d.id}>
              <a href={`/uploads/ministries/${d.filename}`} target="_blank" rel="noreferrer">
                {d.original_name || d.filename}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {(data.events || []).length > 0 && (
        <div className="card">
          <h2>Related events</h2>
          <ul>
            {data.events.map((ev) => (
              <li key={ev.id}>{ev.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MinistryDetail;
