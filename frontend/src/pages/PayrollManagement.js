import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './Members.css';

const PayrollManagement = () => {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [newRun, setNewRun] = useState({ title: '', period_start: '', period_end: '' });
  const [addEntry, setAddEntry] = useState({ staff_id: '', base_salary: '', allowances: 0, deductions: 0, notes: '' });

  const isFinance = user?.primaryRole?.role_code === 'FINANCE_OFFICER';
  const isAdmin = ['PRESIDENT', 'MISSION_SECRETARY'].includes(user?.primaryRole?.role_code);

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      const res = await axios.get('/api/payroll');
      setRuns(res.data || []);
    } catch (e) {
      setMessage('Error loading payroll: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await axios.get('/api/staff');
      setStaff(res.data || []);
    } catch (e) {
      setStaff([]);
    }
  };

  const fetchRunDetail = async (id) => {
    try {
      const res = await axios.get(`/api/payroll/${id}`);
      setRunDetail(res.data);
      setSelectedRun(id);
      if (res.data.status === 'draft' && isFinance) fetchStaff();
    } catch (e) {
      setMessage('Error loading run details');
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    if (amount == null) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount);
  };

  const handleCreateRun = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await axios.post('/api/payroll', newRun);
      setMessage('Payroll run created');
      setShowCreate(false);
      setNewRun({ title: '', period_start: '', period_end: '' });
      fetchRuns();
    } catch (e) {
      setMessage(e.response?.data?.error || 'Error creating run');
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!selectedRun || !addEntry.staff_id || addEntry.base_salary === '') return;
    setMessage('');
    try {
      await axios.post(`/api/payroll/${selectedRun}/entries`, {
        staff_id: addEntry.staff_id,
        base_salary: parseFloat(addEntry.base_salary),
        allowances: parseFloat(addEntry.allowances) || 0,
        deductions: parseFloat(addEntry.deductions) || 0,
        notes: addEntry.notes
      });
      setMessage('Entry added');
      setAddEntry({ staff_id: '', base_salary: '', allowances: 0, deductions: 0, notes: '' });
      fetchRunDetail(selectedRun);
    } catch (e) {
      setMessage(e.response?.data?.error || 'Error adding entry');
    }
  };

  const handleSubmitRun = async () => {
    if (!selectedRun) return;
    try {
      await axios.post(`/api/payroll/${selectedRun}/submit`);
      setMessage('Payroll submitted for admin approval');
      fetchRuns();
      setSelectedRun(null);
      setRunDetail(null);
    } catch (e) {
      setMessage(e.response?.data?.error || 'Error submitting');
    }
  };

  const handleReview = async (runId, action, rejectionReason) => {
    try {
      await axios.post(`/api/payroll/${runId}/review`, { action, rejection_reason: rejectionReason });
      setMessage(action === 'approve' ? 'Payroll approved' : 'Payroll rejected');
      fetchRuns();
      if (parseInt(selectedRun) === parseInt(runId)) {
        setSelectedRun(null);
        setRunDetail(null);
      }
    } catch (e) {
      setMessage(e.response?.data?.error || 'Error');
    }
  };

  const getStatusBadge = (status) => {
    const map = { draft: 'badge-default', submitted: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
    return <span className={`status-badge ${map[status] || 'badge-default'}`}>{status}</span>;
  };

  if (loading) return <div className="members-page muted">Loading…</div>;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Payroll Management</h1>
          <p className="members-sub">Create, submit, and review payroll runs</p>
        </div>
        {isFinance && (
          <div className="members-actions">
            <button type="button" className="btn btn-primary" onClick={() => { setShowCreate(true); fetchStaff(); }}>
              New Payroll Run
            </button>
          </div>
        )}
      </div>

      {message && <div className={message.includes('Error') ? 'error-message' : 'success-message'}>{message}</div>}

      {showCreate && isFinance && (
        <div className="card">
          <h3>Create Payroll Run</h3>
          <form onSubmit={handleCreateRun}>
            <div className="member-form-grid">
              <div className="form-group full">
                <label htmlFor="payroll-title">Title *</label>
                <input id="payroll-title" value={newRun.title} onChange={e => setNewRun({ ...newRun, title: e.target.value })} required placeholder="e.g. March 2025" />
              </div>
              <div className="form-group">
                <label htmlFor="payroll-start">Period Start *</label>
                <input id="payroll-start" type="date" value={newRun.period_start} onChange={e => setNewRun({ ...newRun, period_start: e.target.value })} required />
              </div>
              <div className="form-group">
                <label htmlFor="payroll-end">Period End *</label>
                <input id="payroll-end" type="date" value={newRun.period_end} onChange={e => setNewRun({ ...newRun, period_end: e.target.value })} required />
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="submit" className="btn btn-primary">Create</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Payroll Runs</h3>
        <div className="members-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Period</th>
              <th>Total</th>
              <th>Status</th>
              <th>Submitted By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{r.period_start && r.period_end ? `${new Date(r.period_start).toLocaleDateString()} - ${new Date(r.period_end).toLocaleDateString()}` : '-'}</td>
                <td>{formatCurrency(r.total_amount, r.currency)}</td>
                <td>{getStatusBadge(r.status)}</td>
                <td>{r.submitted_by_name || '-'}</td>
                <td>
                  <button type="button" className="btn btn-primary" style={{ marginRight: '8px', padding: '4px 10px' }} onClick={() => fetchRunDetail(r.id)}>View</button>
                  {isAdmin && r.status === 'submitted' && (
                    <>
                      <button type="button" className="btn btn-primary" style={{ marginRight: '8px', padding: '4px 10px' }} onClick={() => handleReview(r.id, 'approve')}>Approve</button>
                      <button type="button" className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={() => handleReview(r.id, 'reject', window.prompt('Rejection reason?'))}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {runs.length === 0 && <p className="muted">No payroll runs.</p>}
      </div>

      {runDetail && (
        <div className="card">
          <h3>{runDetail.title} — {getStatusBadge(runDetail.status)}</h3>
          <p className="muted">Period: {new Date(runDetail.period_start).toLocaleDateString()} - {new Date(runDetail.period_end).toLocaleDateString()} | Total: {formatCurrency(runDetail.total_amount, runDetail.currency)}</p>

          {isFinance && runDetail.status === 'draft' && (
            <>
              <h4>Add Staff Entry</h4>
              <form onSubmit={handleAddEntry} className="member-form-grid" style={{ marginBottom: '16px', alignItems: 'end' }}>
                <div className="form-group">
                  <label htmlFor="entry-staff">Staff</label>
                  <select id="entry-staff" value={addEntry.staff_id} onChange={e => setAddEntry({ ...addEntry, staff_id: e.target.value })} required>
                    <option value="">Select</option>
                    {staff.length === 0 && <option value="" disabled>Load staff first</option>}
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.firstname} {s.lastname} — {s.position} ({formatCurrency(s.salary, s.currency)})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="entry-base">Base Salary</label>
                  <input id="entry-base" type="number" step="0.01" value={addEntry.base_salary} onChange={e => setAddEntry({ ...addEntry, base_salary: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label htmlFor="entry-allow">Allowances</label>
                  <input id="entry-allow" type="number" step="0.01" value={addEntry.allowances} onChange={e => setAddEntry({ ...addEntry, allowances: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="entry-deduct">Deductions</label>
                  <input id="entry-deduct" type="number" step="0.01" value={addEntry.deductions} onChange={e => setAddEntry({ ...addEntry, deductions: e.target.value })} />
                </div>
                <div className="form-group">
                  <button type="submit" className="btn btn-primary">Add Entry</button>
                </div>
              </form>
              {runDetail.entries?.length > 0 && (
                <button type="button" className="btn btn-primary" onClick={handleSubmitRun} style={{ marginBottom: '12px' }}>Submit for Admin Approval</button>
              )}
            </>
          )}

          <h4>Entries ({runDetail.entries?.length || 0})</h4>
          <div className="members-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Position</th>
                <th>Base</th>
                <th>Allowances</th>
                <th>Deductions</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {(runDetail.entries || []).map(entry => (
                <tr key={entry.id}>
                  <td>{entry.firstname} {entry.lastname}</td>
                  <td>{entry.position}</td>
                  <td>{formatCurrency(entry.base_salary, entry.currency)}</td>
                  <td>{formatCurrency(entry.allowances, entry.currency)}</td>
                  <td>{formatCurrency(entry.deductions, entry.currency)}</td>
                  <td>{formatCurrency(entry.net_amount, entry.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setSelectedRun(null); setRunDetail(null); }}>Close</button>
          </div>
        </div>
      )}

      <p className="muted" style={{ marginTop: '16px' }}>
        <Link to="/finance">Back to Finance Dashboard</Link>
      </p>
    </div>
  );
};

export default PayrollManagement;
