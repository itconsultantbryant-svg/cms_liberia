import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const RELATIONSHIP_LABELS = {
  head: 'Head of household',
  spouse: 'Spouse',
  child: 'Child',
  dependent: 'Dependent',
  other: 'Other relative'
};

const HouseholdProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [giving, setGiving] = useState(null);
  const [relationships, setRelationships] = useState(['head', 'spouse', 'child', 'dependent', 'other']);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState({ name: '', address: '', city: '', phone: '', notes: '' });
  const [addMemberId, setAddMemberId] = useState('');
  const [addRel, setAddRel] = useState('spouse');
  const [memberOptions, setMemberOptions] = useState([]);

  const canEdit = user?.isadmin || user?.permissionKeys?.includes?.('members.update');

  const load = async () => {
    try {
      const res = await axios.get(`/api/households/${id}`);
      setHousehold(res.data.household);
      setMembers(res.data.members || []);
      setGiving(res.data.giving);
      if (res.data.relationships) setRelationships(res.data.relationships);
      setEdit({
        name: res.data.household.name || '',
        address: res.data.household.address || '',
        city: res.data.household.city || '',
        phone: res.data.household.phone || '',
        notes: res.data.household.notes || ''
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    axios.get('/api/members', { params: { limit: 100, allBranches: user?.isadmin ? '1' : undefined } })
      .then((r) => setMemberOptions(r.data.members || []))
      .catch(() => {});
  }, [id]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/households/${id}`, edit);
      setMessage('Saved');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    if (!addMemberId) return;
    try {
      await axios.post(`/api/households/${id}/members`, {
        memberId: Number(addMemberId),
        relationship: addRel
      });
      setMessage('Member added');
      setAddMemberId('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Add failed');
    }
  };

  const removeMember = async (memberId) => {
    if (!window.confirm('Remove this member from the household?')) return;
    try {
      await axios.delete(`/api/households/${id}/members/${memberId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Remove failed');
    }
  };

  const changeRel = async (memberId, relationship) => {
    try {
      await axios.patch(`/api/households/${id}/members/${memberId}`, { relationship });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  const destroy = async () => {
    if (!window.confirm('Delete this household? Members are not deleted.')) return;
    try {
      await axios.delete(`/api/households/${id}`);
      navigate('/households');
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) return <div>Loading…</div>;
  if (!household) return <div>{error || 'Not found'}</div>;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>{household.name}</h1>
          <p className="members-sub">{members.length} members in household</p>
        </div>
        <div className="members-actions">
          <Link to="/households" className="btn btn-secondary">
            Back
          </Link>
          {canEdit && (
            <button type="button" className="btn btn-secondary" onClick={destroy}>
              Delete
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {canEdit && (
        <form className="card" onSubmit={save}>
          <h2>Household details</h2>
          <div className="member-form-grid">
            <div className="form-group">
              <label>Name</label>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </div>
            <div className="form-group full">
              <label>Address</label>
              <input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </div>
            <div className="form-group">
              <label>City</label>
              <input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
            Save
          </button>
        </form>
      )}

      {!canEdit && (
        <div className="card">
          <p><strong>Address:</strong> {[household.address, household.city].filter(Boolean).join(', ') || '—'}</p>
          <p><strong>Phone:</strong> {household.phone || '—'}</p>
          {household.notes && <p><strong>Notes:</strong> {household.notes}</p>}
        </div>
      )}

      <div className="card">
        <h2>Family members</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Relationship</th>
              <th>Phone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.member_id}>
                <td>
                  <Link to={`/members/${m.member_id}`}>
                    {m.firstname} {m.lastname}
                  </Link>
                  <div style={{ fontSize: 12, color: '#888' }}>{m.membership_id}</div>
                </td>
                <td>
                  {canEdit ? (
                    <select
                      value={m.relationship}
                      onChange={(e) => changeRel(m.member_id, e.target.value)}
                    >
                      {relationships.map((r) => (
                        <option key={r} value={r}>
                          {RELATIONSHIP_LABELS[r] || r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    RELATIONSHIP_LABELS[m.relationship] || m.relationship
                  )}
                </td>
                <td>{m.phone || '—'}</td>
                <td>
                  {canEdit && (
                    <button type="button" className="btn-link" onClick={() => removeMember(m.member_id)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {canEdit && (
          <form onSubmit={addMember} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <select value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)} required>
              <option value="">Select member…</option>
              {memberOptions
                .filter((m) => !members.some((x) => Number(x.member_id) === Number(m.id)))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstname} {m.lastname} ({m.membership_id || m.id})
                  </option>
                ))}
            </select>
            <select value={addRel} onChange={(e) => setAddRel(e.target.value)}>
              {relationships.map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABELS[r] || r}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Add member
            </button>
          </form>
        )}
      </div>

      {giving && (
        <div className="card">
          <h2>Giving history</h2>
          <p>
            <strong>Household total (recent):</strong> {giving.total}
          </p>
          {!giving.entries?.length && <p>No recorded member collections</p>}
          {giving.entries?.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>Type</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {giving.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date_collected}</td>
                    <td>
                      {e.firstname} {e.lastname}
                    </td>
                    <td>{e.collection_type || '—'}</td>
                    <td>{e.amount}</td>
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

export default HouseholdProfile;
