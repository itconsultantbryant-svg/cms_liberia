import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const money = (amount, currency = 'USD') => {
  if (amount == null || amount === '') return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2
    }).format(Number(amount) || 0);
  } catch (_) {
    return String(amount);
  }
};

const MemberProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [attendance, setAttendance] = useState({ yes: 0, no: 0 });
  const [documents, setDocuments] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [householdPeers, setHouseholdPeers] = useState([]);
  const [relatives, setRelatives] = useState([]);
  const [church, setChurch] = useState(null);
  const [branch, setBranch] = useState(null);
  const [staffRecords, setStaffRecords] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  const canEdit = user?.isadmin || user?.permissionKeys?.includes?.('members.update');
  const canDelete = user?.isadmin || user?.permissionKeys?.includes?.('members.delete');

  const fetchMember = async () => {
    try {
      const response = await axios.get(`/api/members/${id}`);
      setMember(response.data.member);
      setAttendance(response.data.attendance || { yes: 0, no: 0 });
      setDocuments(response.data.documents || []);
      setHouseholds(response.data.households || []);
      setHouseholdPeers(response.data.householdPeers || []);
      setRelatives(response.data.relatives || []);
      setChurch(response.data.church || null);
      setBranch(response.data.branch || null);
      setStaffRecords(response.data.staffRecords || []);
      setFinancial(response.data.financial || null);
      setAccount(response.data.account || null);
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

  const approve = async () => {
    setActing(true);
    setError('');
    try {
      const { data } = await axios.post(`/api/members/${id}/approve`);
      setMessage(data.message || 'Approved');
      await fetchMember();
    } catch (err) {
      setError(err.response?.data?.error || 'Approve failed');
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    const reason = window.prompt('Rejection reason (optional):') || '';
    setActing(true);
    setError('');
    try {
      const { data } = await axios.post(`/api/members/${id}/reject`, { reason });
      setMessage(data.message || 'Rejected');
      await fetchMember();
    } catch (err) {
      setError(err.response?.data?.error || 'Reject failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="members-page muted">Loading…</div>;
  if (!member) return <div className="members-page">{error || 'Member not found'}</div>;

  const fullName = [member.title, member.firstname, member.middlename, member.lastname]
    .filter(Boolean)
    .join(' ');
  const location = [member.address, member.address2, member.city, member.state, member.postal, member.country]
    .filter(Boolean)
    .join(', ');
  const isPending = String(member.membership_status || '').toLowerCase() === 'pending';
  const currency = user?.currency || user?.church?.currency || 'USD';

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
            {church?.name ? ` · ${church.name}` : ''}
          </p>
        </div>
        <div className="members-actions">
          {isPending && canEdit && (
            <>
              <button type="button" className="btn btn-primary" disabled={acting} onClick={approve}>
                Approve membership
              </button>
              <button type="button" className="btn btn-danger" disabled={acting} onClick={reject}>
                Reject
              </button>
            </>
          )}
          {!isPending && canEdit && !account && (
            <Link to="/users" className="btn btn-secondary">
              Assign login (User Management)
            </Link>
          )}
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

      {isPending && (
        <div className="warning-message">
          This application is awaiting approval. Approve before assigning a username and password.
        </div>
      )}

      <div className="card">
        <h2>Contact &amp; location</h2>
        <div className="member-form-grid">
          <p><strong>Email:</strong> {member.email || '—'}</p>
          <p><strong>Phone:</strong> {member.phone || '—'}{member.phone_alt ? ` / ${member.phone_alt}` : ''}</p>
          <p className="full"><strong>Current location / address:</strong> {location || '—'}</p>
          <p><strong>Emergency contact:</strong> {member.emergency_contact_name || '—'}{member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ''}</p>
        </div>
      </div>

      <div className="card">
        <h2>Personal &amp; family</h2>
        <div className="member-form-grid">
          <p><strong>Gender:</strong> {member.sex || '—'}</p>
          <p><strong>Date of birth:</strong> {member.dob || '—'}</p>
          <p><strong>Marital / family status:</strong> {member.marital_status || '—'}</p>
          <p><strong>Wedding anniversary:</strong> {member.wedding_anniversary || '—'}</p>
          <p><strong>Occupation:</strong> {member.occupation || '—'}</p>
          <p><strong>Member type:</strong> {member.member_status || '—'}</p>
        </div>
        {relatives.length > 0 && (
          <>
            <h3>Recorded relationships</h3>
            <ul>
              {relatives.map((r, i) => (
                <li key={i}>
                  {typeof r === 'string' ? r : `${r.name || r.relative || '—'} (${r.relationship || 'relative'})`}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="card">
        <h2>Church affiliation</h2>
        <div className="member-form-grid">
          <p><strong>Church:</strong> {church?.name || user?.church?.name || '—'}</p>
          <p><strong>Branch / campus:</strong> {branch?.branchname || '—'}</p>
          <p><strong>Member since:</strong> {member.member_since || '—'}</p>
          <p><strong>Baptism:</strong> {member.baptism_status || '—'}{member.baptism_date ? ` (${member.baptism_date})` : ''}</p>
          <p><strong>Ministry:</strong> {member.ministry || '—'}</p>
          <p><strong>Department:</strong> {member.department || '—'}</p>
          <p><strong>Current position:</strong> {member.position || '—'}</p>
          <p>
            <strong>Portal account:</strong>{' '}
            {account
              ? `${account.email} (${account.status || 'active'}${account.loginEnabled ? '' : ', login disabled'})`
              : 'No login assigned yet'}
          </p>
        </div>
      </div>

      {households.length > 0 && (
        <div className="card">
          <h2>Household &amp; family links</h2>
          {households.map((h) => (
            <div key={h.id} style={{ marginBottom: 12 }}>
              <p>
                <Link to={`/households/${h.id}`}>{h.name}</Link>
                {h.relationship ? ` · relationship: ${h.relationship}` : ''}
                {h.is_primary ? ' · primary' : ''}
              </p>
              {(householdPeers.find((p) => p.householdId === h.id)?.members || []).length > 0 && (
                <ul>
                  {(householdPeers.find((p) => p.householdId === h.id)?.members || []).map((m) => (
                    <li key={m.id}>
                      <Link to={`/members/${m.id}`}>
                        {m.firstname} {m.lastname}
                      </Link>
                      {m.relationship ? ` · ${m.relationship}` : ''}
                      {m.membership_id ? ` · ${m.membership_id}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Employment / church positions</h2>
        {staffRecords.length === 0 ? (
          <p className="muted">No staff employment records linked to this member.</p>
        ) : (
          <div className="members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Employment date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {staffRecords.map((s) => (
                  <tr key={s.id}>
                    <td>{s.position || '—'}</td>
                    <td>{s.department_name || '—'}</td>
                    <td>{s.employment_date ? new Date(s.employment_date).toLocaleDateString() : '—'}</td>
                    <td>{s.is_active === 0 || s.is_active === false ? 'Past / inactive' : 'Current'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: 8 }}>
          <strong>Profile position field:</strong> {member.position || '—'}
        </p>
      </div>

      <div className="card">
        <h2>Financial records</h2>
        <div className="member-form-grid">
          <p><strong>Donations total:</strong> {money(financial?.summary?.donationsTotal, currency)}</p>
          <p><strong>Collections / offerings total:</strong> {money(financial?.summary?.collectionsTotal, currency)}</p>
          <p><strong>Donation count:</strong> {financial?.summary?.donationsCount || 0}</p>
          <p><strong>Pledges:</strong> {financial?.summary?.pledgesCount || 0}</p>
        </div>

        <h3>Donations / special offerings / projects</h3>
        {(financial?.donations || []).length === 0 ? (
          <p className="muted">No donation records.</p>
        ) : (
          <div className="members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Fund / project</th>
                  <th>Receipt</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {financial.donations.map((d) => (
                  <tr key={d.id}>
                    <td>{d.donation_date ? new Date(d.donation_date).toLocaleDateString() : '—'}</td>
                    <td>{money(d.amount, d.currency || currency)}</td>
                    <td>{d.fund || '—'}</td>
                    <td>{d.receipt_number || '—'}</td>
                    <td>{d.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Tithes &amp; member collections</h3>
        {(financial?.collections || []).length === 0 ? (
          <p className="muted">No tithe / collection line items.</p>
        ) : (
          <div className="members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {financial.collections.map((c) => (
                  <tr key={c.id}>
                    <td>{c.collection_date ? new Date(c.collection_date).toLocaleDateString() : '—'}</td>
                    <td>{c.collection_type || c.type || '—'}</td>
                    <td>{money(c.amount, c.currency || currency)}</td>
                    <td>{c.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Pledges</h3>
        {(financial?.pledges || []).length === 0 ? (
          <p className="muted">No pledges.</p>
        ) : (
          <div className="members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Amount</th>
                  <th>Fund</th>
                  <th>Status</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {financial.pledges.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title || '—'}</td>
                    <td>{money(p.amount, p.currency || currency)}</td>
                    <td>{p.fund || '—'}</td>
                    <td>{p.status || '—'}</td>
                    <td>
                      {[p.start_date, p.end_date].filter(Boolean).map((d) => new Date(d).toLocaleDateString()).join(' – ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Attendance</h2>
        <p>
          <strong>Present:</strong> {attendance.yes || 0} · <strong>Absent:</strong> {attendance.no || 0}
        </p>
      </div>

      {member.notes && (
        <div className="card">
          <h2>Notes</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{member.notes}</p>
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
