import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './FinanceDashboard.css';

const FinanceDashboard = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [financeReports, setFinanceReports] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    totalCollections: 0,
    totalRequests: 0,
    pendingReports: 0,
    staffCount: 0,
    payrollPending: 0,
    payrollApproved: 0
  });
  const [ledgerSummary, setLedgerSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [action, setAction] = useState('approve');
  const [comments, setComments] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('[Finance Dashboard] Fetching data...');
      
      const [requestsRes, collectionsRes, reportsRes, staffRes, payrollRes, ledgerRes] = await Promise.all([
        axios.get('/api/requests').catch(err => { return { data: [] }; }),
        axios.get('/api/collections/history').catch(err => { return { data: [] }; }),
        axios.get('/api/finance-reports').catch(err => { return { data: [] }; }),
        axios.get('/api/staff').catch(err => { return { data: [] }; }),
        axios.get('/api/payroll').catch(err => { return { data: [] }; }),
        axios.get('/api/finance/dashboard').catch(() => ({ data: null }))
      ]);

      if (ledgerRes.data) setLedgerSummary(ledgerRes.data);

      console.log('[Finance Dashboard] API Response - Requests:', requestsRes.data?.length || 0);
      console.log('[Finance Dashboard] API Response - Collections:', collectionsRes.data?.length || 0);
      console.log('[Finance Dashboard] API Response - Reports:', reportsRes.data?.length || 0);
      
      if (requestsRes.data && requestsRes.data.length > 0) {
        console.log('[Finance Dashboard] All request statuses:', requestsRes.data.map(r => ({ id: r.id, title: r.title, status: r.status })));
      }

      // Finance Officer sees ALL requests approved by Mission Secretary (second approver)
      // Finance Officer should see ALL request types, not just financial
      const allRequests = (requestsRes.data || []).filter(r => 
        r.status === 'approved_by_mission_secretary' || 
        r.status === 'approved_by_finance' || 
        r.status === 'rejected_by_finance' ||
        r.status === 'approved_by_vice_president' ||
        r.status === 'rejected_by_vice_president' ||
        r.status === 'approved' ||
        r.status === 'rejected'
      );

      const pendingRequests = allRequests.filter(r => r.status === 'approved_by_mission_secretary');
      console.log('[Finance Dashboard] Filtered requests:', allRequests.length);
      console.log('[Finance Dashboard] Pending approval (approved_by_mission_secretary):', pendingRequests.length);
      if (pendingRequests.length > 0) {
        console.log('[Finance Dashboard] ✅ Pending requests found:', pendingRequests.map(r => ({ id: r.id, title: r.title, status: r.status })));
      } else {
        console.log('[Finance Dashboard] ⚠️ No pending requests found. All request statuses:', [...new Set((requestsRes.data || []).map(r => r.status))]);
      }

      // Finance Officer sees reports approved by Mission Secretary
      const pendingReportsForFinance = (reportsRes.data || []).filter(r => r.status === 'approved_by_pastor');

      setRequests(allRequests);
      setFinanceReports(reportsRes.data || []);
      setPayrollRuns(payrollRes.data || []);

      // Finance Officer sees requests approved by Mission Secretary (pending Finance approval)
      const pending = allRequests.filter(r => r.status === 'approved_by_mission_secretary').length;
      const approved = allRequests.filter(r => 
        r.status === 'approved_by_finance' || r.status === 'approved_by_vice_president' || r.status === 'approved'
      ).length;
      const rejected = allRequests.filter(r => r.status === 'rejected_by_finance').length;
      const totalCollections = collectionsRes.data?.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) || 0;

      setStats({
        pending,
        approved,
        rejected,
        totalCollections,
        totalRequests: allRequests.length,
        pendingReports: pendingReportsForFinance.length,
        staffCount: (staffRes.data || []).length,
        payrollPending: (payrollRes.data || []).filter(r => r.status === 'submitted').length,
        payrollApproved: (payrollRes.data || []).filter(r => r.status === 'approved').length
      });
    } catch (error) {
      console.error('[Finance Dashboard] ❌ Error fetching data:', error);
      console.error('[Finance Dashboard] Error details:', error.response?.data || error.message);
      // Set empty arrays on error to prevent crashes
      setRequests([]);
      setFinanceReports([]);
      setStats({
        pending: 0,
        approved: 0,
        rejected: 0,
        totalCollections: 0,
        totalRequests: 0,
        pendingReports: 0,
        staffCount: 0,
        payrollPending: 0,
        payrollApproved: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    try {
      await axios.post(`/api/requests/${requestId}/approve-finance`, {
        action: 'approve',
        comments: comments
      });
      setShowModal(false);
      setComments('');
      fetchData();
    } catch (error) {
      console.error('Error approving request:', error);
      alert(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleReject = async (requestId) => {
    try {
      await axios.post(`/api/requests/${requestId}/approve-finance`, {
        action: 'reject',
        comments: comments
      });
      setShowModal(false);
      setComments('');
      fetchData();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert(error.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleReportApprove = async () => {
    if (!selectedReport) return;
    try {
      await axios.post(`/api/finance-reports/${selectedReport.id}/approve-finance`, { action: 'approve', comments: comments });
      setShowReportModal(false);
      setSelectedReport(null);
      setComments('');
      fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to approve report');
    }
  };

  const handleReportReject = async () => {
    if (!selectedReport) return;
    try {
      await axios.post(`/api/finance-reports/${selectedReport.id}/approve-finance`, { action: 'reject', comments: comments });
      setShowReportModal(false);
      setSelectedReport(null);
      setComments('');
      fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to reject report');
    }
  };

  const openModal = (request, actionType) => {
    setSelectedRequest(request);
    setAction(actionType);
    setComments('');
    setShowModal(true);
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'approved_by_mission_secretary': { class: 'badge-pending', text: 'Pending Finance Review' },
      'approved_by_finance': { class: 'badge-approved', text: 'Approved (Finance)' },
      'rejected_by_finance': { class: 'badge-rejected', text: 'Rejected (Finance)' },
      'approved_by_vice_president': { class: 'badge-approved', text: 'Approved (VP)' },
      'rejected_by_vice_president': { class: 'badge-rejected', text: 'Rejected (VP)' },
      'approved': { class: 'badge-approved', text: 'Fully Approved' },
      'rejected': { class: 'badge-rejected', text: 'Rejected' }
    };
    const statusInfo = statusMap[status] || { class: 'badge-default', text: status };
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  if (loading) {
    return <div className="loading">Loading finance dashboard...</div>;
  }

  return (
    <div className="finance-dashboard">
      <div className="dashboard-header">
        <h1>Finance Officer Dashboard</h1>
        <p>Financial request management and collections overview</p>
        <p>
          <a href="/finance/ledger">Open Finance Ledger →</a>
        </p>
      </div>

      {ledgerSummary && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📈</div>
            <div className="stat-content">
              <h3>Ledger Income</h3>
              <p className="stat-number">{Number(ledgerSummary.income).toFixed(2)}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📉</div>
            <div className="stat-content">
              <h3>Ledger Expenses</h3>
              <p className="stat-number">{Number(ledgerSummary.expenses).toFixed(2)}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⚖️</div>
            <div className="stat-content">
              <h3>Net Position</h3>
              <p className="stat-number">{Number(ledgerSummary.net).toFixed(2)}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <h3>Pending Ledger</h3>
              <p className="stat-number">{ledgerSummary.pendingCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Total Collections</h3>
            <p className="stat-value">{formatCurrency(stats.totalCollections)}</p>
          </div>
        </div>
        <div className="stat-card pending">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <h3>Pending Requests</h3>
            <p className="stat-value">{stats.pending}</p>
          </div>
        </div>
        <div className="stat-card approved">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Approved</h3>
            <p className="stat-value">{stats.approved}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Total Requests</h3>
            <p className="stat-value">{stats.totalRequests}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👔</div>
          <div className="stat-content">
            <h3>Staff</h3>
            <p className="stat-value">{stats.staffCount}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💵</div>
          <div className="stat-content">
            <h3>Payroll</h3>
            <p className="stat-value">{stats.payrollPending} pending / {stats.payrollApproved} approved</p>
          </div>
        </div>
      </div>

      {/* Finance Reports Section */}
      {financeReports.length > 0 && (
        <div className="reports-section">
          <h2>Finance Reports ({stats.pendingReports} Pending Your Approval)</h2>
          <div className="reports-list">
            {financeReports.map(report => (
              <div key={report.id} className="report-card">
                <div className="report-header">
                  <h3>{report.title}</h3>
                  {getStatusBadge(report.status)}
                </div>
                <p className="report-type">Type: {report.report_type}</p>
                <p className="report-period">
                  Period: {new Date(report.period_start).toLocaleDateString()} - {new Date(report.period_end).toLocaleDateString()}
                </p>
                <p className="report-submitter">
                  Submitted by: {report.sub_user_name || report.submitted_by_name}
                </p>
                {report.status === 'approved_by_pastor' && (
                  <div className="report-actions">
                    <button 
                      className="btn-approve"
                      onClick={() => {
                        setSelectedReport(report);
                        setAction('approve');
                        setComments('');
                        setShowReportModal(true);
                      }}
                    >
                      Approve Report
                    </button>
                    <button 
                      className="btn-reject"
                      onClick={() => {
                        setSelectedReport(report);
                        setAction('reject');
                        setComments('');
                        setShowReportModal(true);
                      }}
                    >
                      Reject Report
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requests Section */}
      <div className="requests-section">
        <h2>Requests Pending Approval</h2>
        <p className="section-description">
          Review and approve requests that have been approved by Mission Secretary
        </p>
        {stats.pending > 0 && (
          <div className="pending-badge" style={{ 
            background: '#ff9800', 
            color: 'white', 
            padding: '10px 15px', 
            borderRadius: '5px', 
            marginBottom: '20px',
            fontWeight: 'bold'
          }}>
            🔔 {stats.pending} Request{stats.pending > 1 ? 's' : ''} Pending Your Approval
          </div>
        )}
        <div className="requests-list">
          {loading ? (
            <div className="no-requests">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="no-requests">
              <p>No requests found.</p>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                Check the browser console (F12) for debugging information.
              </p>
            </div>
          ) : requests.filter(r => r.status === 'approved_by_mission_secretary').length === 0 ? (
            <div className="no-requests">
              <p>✅ No requests pending approval. All requests have been processed.</p>
              {requests.length > 0 && (
                <div style={{ marginTop: '15px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                    <strong>Total requests in system:</strong> {requests.length}
                  </p>
                  <p style={{ fontSize: '12px', color: '#666' }}>
                    <strong>Request statuses:</strong> {[...new Set(requests.map(r => r.status))].join(', ') || 'None'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            requests.filter(request => request.status === 'approved_by_mission_secretary').map(request => (
              <div key={request.id} className={`request-card ${request.request_type === 'financial' ? 'financial' : ''}`}>
                <div className="request-header">
                  <div>
                    <h3>{request.title}</h3>
                    <p className="request-meta">
                      From: <strong>{request.requested_by_name}</strong> | 
                      Type: <strong>{request.request_type}</strong> | 
                      Priority: <strong>{request.priority}</strong>
                    </p>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
                
                <div className="request-body">
                  <p className="request-description">{request.description}</p>
                  {request.amount && (
                    <div className="amount-highlight">
                      <strong>Amount Requested: {formatCurrency(request.amount, request.currency)}</strong>
                    </div>
                  )}
                  {request.department_name && (
                    <p className="request-department">
                      Department: <strong>{request.department_name}</strong>
                    </p>
                  )}
                  <p className="request-date">
                    Submitted: {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>

                {request.approvals && request.approvals.length > 0 && (
                  <div className="approval-history">
                    <h4>Approval History:</h4>
                    {request.approvals.map((approval, idx) => (
                      <div key={idx} className="approval-item">
                        <span className={`approval-action ${approval.action}`}>
                          {approval.action === 'approve' ? '✅' : '❌'} {approval.approval_level.replace('_', ' ')}
                        </span>
                        <span className="approval-by">by {approval.approved_by_name}</span>
                        <span className="approval-date">
                          {new Date(approval.created_at).toLocaleString()}
                        </span>
                        {approval.comments && (
                          <p className="approval-comments">{approval.comments}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Workflow Timeline */}
                <div className="workflow-timeline" style={{ 
                  marginTop: '15px', 
                  padding: '10px', 
                  background: '#f5f5f5', 
                  borderRadius: '5px',
                  fontSize: '14px'
                }}>
                  <p style={{ margin: '5px 0', fontWeight: 'bold' }}>Approval Workflow:</p>
                  <p style={{ margin: '5px 0' }}>
                    ✅ Approved by Mission Secretary → ⏳ <strong>Pending Your Approval</strong> → ⏸️ Pending Vice President
                  </p>
                </div>

                {request.status === 'approved_by_mission_secretary' && (
                  <div className="request-actions" style={{ marginTop: '15px' }}>
                    <button 
                      className="btn-approve"
                      onClick={() => openModal(request, 'approve')}
                    >
                      Approve & Forward to VP
                    </button>
                    <button 
                      className="btn-reject"
                      onClick={() => openModal(request, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {(user?.primaryRole?.role_code === 'PRESIDENT' || user?.primaryRole?.role_code === 'MISSION_SECRETARY') && payrollRuns.filter(r => r.status === 'submitted').length > 0 && (
        <div className="reports-section" style={{ marginTop: '24px' }}>
          <h2>Pending Your Approval (Payroll)</h2>
          <p className="section-description">Review and approve payroll runs submitted by Finance.</p>
          <div className="reports-list">
            {payrollRuns.filter(r => r.status === 'submitted').map(run => (
              <div key={run.id} className="report-card">
                <div className="report-header">
                  <h3>{run.title}</h3>
                  <span className="status-badge badge-pending">Pending Approval</span>
                </div>
                <p>Period: {new Date(run.period_start).toLocaleDateString()} - {new Date(run.period_end).toLocaleDateString()}</p>
                <p><strong>Total: {formatCurrency(run.total_amount, run.currency)}</strong></p>
                <p>Submitted by: {run.submitted_by_name}</p>
                <div className="report-actions" style={{ marginTop: '10px' }}>
                  <button className="btn-approve" onClick={async () => { try { await axios.post(`/api/payroll/${run.id}/review`, { action: 'approve' }); fetchData(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } }}>Approve</button>
                  <button className="btn-reject" onClick={async () => { const reason = window.prompt('Rejection reason (optional):'); try { await axios.post(`/api/payroll/${run.id}/review`, { action: 'reject', rejection_reason: reason }); fetchData(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showModal && selectedRequest && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{action === 'approve' ? 'Approve' : 'Reject'} Financial Request</h2>
            <p><strong>{selectedRequest.title}</strong></p>
            {selectedRequest.amount && (
              <p className="modal-amount">
                Amount: <strong>{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</strong>
              </p>
            )}
            <div className="form-group">
              <label>Comments (Optional)</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add comments..."
                rows="4"
              />
            </div>
            <div className="modal-actions">
              <button
                className={action === 'approve' ? 'btn-approve' : 'btn-reject'}
                onClick={() => {
                  if (action === 'approve') {
                    handleApprove(selectedRequest.id);
                  } else {
                    handleReject(selectedRequest.id);
                  }
                }}
              >
                {action === 'approve' ? 'Approve & Forward to VP' : 'Reject'} Request
              </button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && selectedReport && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{action === 'approve' ? 'Approve' : 'Reject'} Finance Report</h2>
            <p><strong>{selectedReport.title}</strong></p>
            <p>Period: {new Date(selectedReport.period_start).toLocaleDateString()} - {new Date(selectedReport.period_end).toLocaleDateString()}</p>
            <div className="form-group">
              <label>Comments (Optional)</label>
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add comments..." rows="4" />
            </div>
            <div className="modal-actions">
              <button className={action === 'approve' ? 'btn-approve' : 'btn-reject'} onClick={action === 'approve' ? handleReportApprove : handleReportReject}>
                {action === 'approve' ? 'Approve' : 'Reject'} Report
              </button>
              <button className="btn-cancel" onClick={() => setShowReportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceDashboard;

