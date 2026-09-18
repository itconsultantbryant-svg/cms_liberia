import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboards.css';
import './MissionSecretaryDashboard.css';

const MissionSecretaryDashboard = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [action, setAction] = useState('approve'); // 'approve' or 'reject'
  const [comments, setComments] = useState('');
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
    pendingReports: 0
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [requestsRes, reportsRes] = await Promise.all([
        axios.get('/api/requests'),
        axios.get('/api/finance-reports')
      ]);
      
      const requestsData = requestsRes.data || [];
      const reportsData = reportsRes.data || [];
      
      setRequests(requestsData);
      
      // Calculate stats - Mission Secretary sees PENDING requests (first approver)
      const pending = requestsData.filter(r => r.status === 'pending').length;
      const approved = requestsData.filter(r => 
        r.status === 'approved_by_mission_secretary' || r.status === 'approved_by_finance' || r.status === 'approved_by_vice_president' || r.status === 'approved'
      ).length;
      const rejected = requestsData.filter(r => r.status === 'rejected_by_mission_secretary').length;
      
      // Reports approved by Resident Pastor pending Mission Secretary review
      const pendingReports = reportsData.filter(r => r.status === 'approved_by_pastor').length;
      
      setStats({
        pending,
        approved,
        rejected,
        total: requestsData.length,
        pendingReports
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    try {
      await axios.post(`/api/requests/${requestId}/approve-mission-secretary`, {
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
      await axios.post(`/api/requests/${requestId}/approve-mission-secretary`, {
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

  const openModal = (request, actionType) => {
    setSelectedRequest(request);
    setAction(actionType);
    setComments('');
    setShowModal(true);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { class: 'badge-pending', text: 'Pending Review' },
      'approved_by_mission_secretary': { class: 'badge-approved', text: 'Approved (MS)' },
      'rejected_by_mission_secretary': { class: 'badge-rejected', text: 'Rejected (MS)' },
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

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  if (loading) {
    return <div className="loading">Loading requests...</div>;
  }

  return (
    <div className="mission-secretary-dashboard">
      <div className="dashboard-header">
        <h1>Mission Secretary Dashboard</h1>
        <p>Review and approve requests from Resident Pastors</p>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <h3>Total Requests</h3>
            <p className="stat-value">{stats.total}</p>
          </div>
        </div>
        <div className="stat-card pending">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>Pending Review</h3>
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
        <div className="stat-card rejected">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <h3>Rejected</h3>
            <p className="stat-value">{stats.rejected}</p>
          </div>
        </div>
        <div className="stat-card pending">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Pending Reports</h3>
            <p className="stat-value">{stats.pendingReports}</p>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="requests-section">
        <h2>Requests</h2>
        <div className="requests-list">
          {requests.length === 0 ? (
            <div className="no-requests">No requests found</div>
          ) : (
            requests.map(request => (
              <div key={request.id} className="request-card">
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
                    <p className="request-amount">
                      Amount: <strong>{formatCurrency(request.amount, request.currency)}</strong>
                    </p>
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

                {/* Approval History */}
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

                {/* Action Buttons */}
                {request.status === 'pending' && (
                  <div className="request-actions">
                    <button 
                      className="btn-approve"
                      onClick={() => openModal(request, 'approve')}
                    >
                      Approve
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

      {/* Approval Modal */}
      {showModal && selectedRequest && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{action === 'approve' ? 'Approve' : 'Reject'} Request</h2>
            <p><strong>{selectedRequest.title}</strong></p>
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
                {action === 'approve' ? 'Approve' : 'Reject'} Request
              </button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionSecretaryDashboard;

