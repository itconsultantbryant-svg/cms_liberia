import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const MemberProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [attendance, setAttendance] = useState({ yes: 0, no: 0 });
  const [documents, setDocuments] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canEdit = user?.isadmin || user?.permissionKeys?.includes?.('members.update');
  const canDelete = user?.isadmin || user?.permissionKeys?.includes?.('members.delete');

  const fetchMember = async () => {
    try {
      const response = await axios.get(`/api/members/${id}`);
      setMember(response.data.member);
      setAttendance(response.data.attendance || { yes: 0, no: 0 });
      setDocuments(response.data.documents || []);
      setHouseholds(response.data.households || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Member not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('document', file);
    form.append('doc_type', 'other');
    try {
      await axios.post(`/api/members/${id}/documents`, form);
      setMessage('Document uploaded');
      fetchMember();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
    e.target.value = '';
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this member?')) return;
    try {
      const res = await axios.delete(`/api/members/${id}`, { data: { reason: 'Deleted from profile' } });
      if (res.status === 202) {
        setMessage('Deletion submitted for approval');
      } else {
        navigate('/members');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) return <div>Loading…</div>;
  if (!member) return <div>{error || 'Member not found'}</div>;

  const fullName = [member.firstname, member.middlename, member.lastname].filter(Boolean).join(' ');

  return (
    <div className="members-page member-profile-print">
      <div className="members-header no-print">
        <div>
          <h1>{fullName}</h1>
          <p className="members-sub">
            <code>{member.membership_id || `ID ${member.id}`}</code>
            {' · '}
            <span className={`member-status status-${(member.membership_status || 'Active').toLowerCase()}`}>
              {member.membership_status || 'Active'}
            </span>
          </p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Print
          </button>
          {canEdit && (
            <Link to={`/members/${id}/edit`} className="btn btn-secondary">
              Edit
            </Link>
          )}
          {canDelete && (
            <button type="button" className="btn btn-secondary" onClick={onDelete}>
              Delete
            </button>
          )}
          <Link to="/members" className="btn btn-primary">
            Back
          </Link>
        </div>
      </div>

      {error && <div className="error-message no-print">{error}</div>}
      {message && <div className="success-message no-print">{message}</div>}

      <div className="card">
        <h2>Profile</h2>
        <div className="member-form-grid">
          <p><strong>Email:</strong> {member.email}</p>
          <p><strong>Phone:</strong> {member.phone || '—'}{member.phone_alt ? ` / ${member.phone_alt}` : ''}</p>
          <p><strong>Gender:</strong> {member.sex || '—'}</p>
          <p><strong>Date of birth:</strong> {member.dob || '—'}</p>
          <p><strong>Marital status:</strong> {member.marital_status || '—'}</p>
          <p><strong>Occupation:</strong> {member.occupation || '—'}</p>
          <p><strong>Address:</strong> {[member.address, member.city, member.state, member.country].filter(Boolean).join(', ') || '—'}</p>
          <p><strong>Member since:</strong> {member.member_since || '—'}</p>
          <p><strong>Baptism:</strong> {member.baptism_status || '—'}{member.baptism_date ? ` (${member.baptism_date})` : ''}</p>
          <p><strong>Ministry / Dept:</strong> {[member.ministry, member.department].filter(Boolean).join(' / ') || '—'}</p>
          <p><strong>Position:</strong> {member.position || '—'}</p>
          <p><strong>Emergency:</strong> {member.emergency_contact_name || '—'}{member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ''}</p>
          {member.notes && <p className="full"><strong>Notes:</strong> {member.notes}</p>}
        </div>
      </div>

      <div className="card">
        <h2>Attendance</h2>
        <p><strong>Present:</strong> {attendance.yes || 0} · <strong>Absent:</strong> {attendance.no || 0}</p>
      </div>

      {households.length > 0 && (
        <div className="card">
          <h2>Household</h2>
          <ul>
            {households.map((h) => (
              <li key={h.id}>
                <Link to={`/households/${h.id}`}>{h.name}</Link>
                {h.relationship ? ` · ${h.relationship}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Documents</h2>
          {canEdit && (
            <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              Upload
              <input type="file" hidden onChange={onUpload} />
            </label>
          )}
        </div>
        {!documents.length && <p style={{ marginTop: 12 }}>No documents</p>}
        <ul>
          {documents.map((d) => (
            <li key={d.id}>
              <a href={`/uploads/${d.filename}`} target="_blank" rel="noreferrer">
                {d.original_name || d.filename}
              </a>
              {d.doc_type ? ` (${d.doc_type})` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MemberProfile;
