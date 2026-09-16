import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const AssetDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [assign, setAssign] = useState({ location: '', custodianName: '' });
  const [maint, setMaint] = useState({
    serviceDate: new Date().toISOString().slice(0, 10),
    description: '',
    cost: '',
    vendor: '',
    markInRepair: false,
    markActive: false
  });

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/api/assets/${id}`);
      setData(res.data);
      setAssign({
        location: res.data.asset.location || '',
        custodianName: res.data.asset.custodian_name || ''
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveAssign = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/assets/${id}/assign`, assign);
      setMessage('Assignment updated');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Assign failed');
    }
  };

  const saveMaint = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/assets/${id}/maintenance`, {
        ...maint,
        cost: maint.cost ? Number(maint.cost) : 0
      });
      setMessage('Maintenance recorded');
      setMaint({
        serviceDate: new Date().toISOString().slice(0, 10),
        description: '',
        cost: '',
        vendor: '',
        markInRepair: false,
        markActive: false
      });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Maintenance failed');
    }
  };

  const setStatus = async (status) => {
    try {
      await axios.patch(`/api/assets/${id}`, { status });
      setMessage(`Status → ${status}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  if (!data && !error) return <div className="members-page">Loading…</div>;
  if (!data) return <div className="members-page error-message">{error}</div>;

  const a = data.asset;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <p className="members-sub">
            <Link to="/assets">← Assets</Link>
          </p>
          <h1>
            {a.asset_code} — {a.name}
          </h1>
          <p className="members-sub">
            {a.category} · {a.condition_status} · {a.status}
            {a.branchname ? ` · ${a.branchname}` : ''}
          </p>
        </div>
        <div className="members-actions">
          {a.status !== 'in_repair' && (
            <button type="button" className="btn btn-secondary" onClick={() => setStatus('in_repair')}>
              Mark in repair
            </button>
          )}
          {a.status !== 'active' && a.status !== 'disposed' && (
            <button type="button" className="btn btn-primary" onClick={() => setStatus('active')}>
              Mark active
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="card">
        <h2>Details</h2>
        <p>{a.description || 'No description'}</p>
        <p>
          Value:{' '}
          {a.purchase_value != null
            ? Number(a.purchase_value).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
            : '—'}
          {a.purchase_date ? ` · Purchased ${a.purchase_date}` : ''}
        </p>
        <p>Serial: {a.serial_number || '—'} · Location: {a.location || '—'}</p>
        <p>Custodian: {a.custodian_name || '—'}</p>
      </div>

      <div className="card">
        <h2>Assign / relocate</h2>
        <form onSubmit={saveAssign} className="member-form-grid">
          <input
            placeholder="Location"
            value={assign.location}
            onChange={(e) => setAssign({ ...assign, location: e.target.value })}
          />
          <input
            placeholder="Custodian"
            value={assign.custodianName}
            onChange={(e) => setAssign({ ...assign, custodianName: e.target.value })}
          />
          <button type="submit" className="btn btn-primary">
            Save assignment
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Maintenance</h2>
        <form onSubmit={saveMaint} style={{ marginBottom: 12 }}>
          <div className="member-form-grid">
            <input
              type="date"
              value={maint.serviceDate}
              onChange={(e) => setMaint({ ...maint, serviceDate: e.target.value })}
            />
            <input
              required
              placeholder="Description"
              value={maint.description}
              onChange={(e) => setMaint({ ...maint, description: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Cost"
              value={maint.cost}
              onChange={(e) => setMaint({ ...maint, cost: e.target.value })}
            />
            <input
              placeholder="Vendor"
              value={maint.vendor}
              onChange={(e) => setMaint({ ...maint, vendor: e.target.value })}
            />
          </div>
          <div className="members-bulk" style={{ margin: '8px 0' }}>
            <label>
              <input
                type="checkbox"
                checked={maint.markInRepair}
                onChange={(e) => setMaint({ ...maint, markInRepair: e.target.checked })}
              />{' '}
              Mark in repair
            </label>
            <label>
              <input
                type="checkbox"
                checked={maint.markActive}
                onChange={(e) => setMaint({ ...maint, markActive: e.target.checked })}
              />{' '}
              Return to active
            </label>
          </div>
          <button type="submit" className="btn btn-primary">
            Record maintenance
          </button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Cost</th>
              <th>Vendor</th>
            </tr>
          </thead>
          <tbody>
            {(data.maintenance || []).map((m) => (
              <tr key={m.id}>
                <td>{m.service_date}</td>
                <td>{m.description}</td>
                <td>{Number(m.cost || 0).toFixed(2)}</td>
                <td>{m.vendor || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>History</h2>
        <ul>
          {(data.history || []).map((h) => (
            <li key={h.id} style={{ marginBottom: 8 }}>
              <strong>{h.event_type}</strong> · {h.created_at}
              <div>{h.summary}</div>
              {h.details && <div className="members-sub">{h.details}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default AssetDetail;
