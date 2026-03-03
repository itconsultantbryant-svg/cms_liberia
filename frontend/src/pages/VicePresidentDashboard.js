import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './VicePresidentDashboard.css';

const VicePresidentDashboard = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [action, setAction] = useState('approve');
  const [comments, setComments] = useState('');

  useEffect(() => {
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    fetchData();
    // Real-time updates every 5 seconds for immediate notifications
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [requestsRes, notificationsRes] = await Promise.all([
        axios.get('/api/requests'),
        axios.get('/api/notifications')
      ]);
      
      const allRequests = requestsRes.data || [];
      
      console.log('[VP Dashboard] Total requests received:', allRequests.length);
      console.log('[VP Dashboard] Request statuses:', allRequests.map(r => ({ id: r.id, title: r.title, status: r.status, approvals: r.approvals?.length || 0 })));
      
      // Filter requests approved by Finance Officer (pending VP approval)
      // VP is the THIRD approver - show requests with status 'approved_by_finance'
      const pendingRequests = allRequests.filter(r => {
        const hasFinanceApproval = r.approvals?.some(a => 
          a.approval_level === 'finance_officer' && a.action === 'approve'
        );
        
        // Primary check: status must be 'approved_by_finance'
        // Secondary check: if status is wrong but has finance approval, include it
        const isPendingForVP = r.status === 'approved_by_finance' || 
               (hasFinanceApproval && r.status !== 'approved' && r.status !== 'approved_by_vice_president' && r.status !== 'rejected_by_vice_president' && r.status !== 'rejected');
        
        // Log all requests for debugging
        if (r.status === 'approved_by_finance' || hasFinanceApproval) {
          console.log(`[VP Dashboard] Request ${r.id} (${r.title}): status=${r.status}, hasFinanceApproval=${hasFinanceApproval}, isPendingForVP=${isPendingForVP}`);
        }
        
        return isPendingForVP;
      });
      
      console.log('[VP Dashboard] Filtered pending requests:', pendingRequests.length);
      if (pendingRequests.length === 0) {
        console.warn('[VP Dashboard] ⚠️ No pending requests found!');
        console.log('[VP Dashboard] All request statuses:', allRequests.map(r => ({ id: r.id, title: r.title, status: r.status })));
      } else {
        pendingRequests.forEach(r => {
          console.log(`  ✅ Request ID: ${r.id}, Title: ${r.title}, Status: ${r.status}`);
        });
      }
      const approvedRequests = allRequests.filter(r => r.status === 'approved' || r.status === 'approved_by_vice_president');
      const rejectedRequests = allRequests.filter(r => r.status === 'rejected_by_vice_president');

      setRequests(allRequests);
      setStats({
        pending: pendingRequests.length,
        approved: approvedRequests.length,
        rejected: rejectedRequests.length,
        total: allRequests.length
      });

      // Check for new notifications from Finance Officer
      const financeNotifications = notificationsRes.data?.notifications?.filter(n => 
        n.notification_type === 'request' && 
        !n.is_read &&
        (n.message?.includes('Finance Officer') || n.title?.includes('Final Approval'))
      ) || [];

      // Show browser notification if there are new requests
      if (pendingRequests.length > 0 && financeNotifications.length > 0 && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('New Request Pending Approval Request', {
            body: `${pendingRequests.length} new request(s) from Finance Officer awaiting your approval`,
            icon: '/favicon.ico'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async () => {
    try {
      await axios.post(`/api/requests/${selectedRequest.id}/approve-vice-president`, {
        action: action,
        comments: comments
      });
      setShowModal(false);
      setComments('');
      setSelectedRequest(null);
      fetchData();
      alert(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
    } catch (error) {
      console.error('Error processing approval:', error);
      alert(error.response?.data?.error || 'Failed to process approval');
    }
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
      'pending': { class: 'badge-pending', text: 'Pending' },
      'approved_by_mission_secretary': { class: 'badge-approved', text: 'Approved (MS)' },
      'approved_by_finance': { class: 'badge-pending', text: 'Pending VP Approval' },
      'approved_by_vice_president': { class: 'badge-approved', text: 'Approved (VP)' },
      'approved': { class: 'badge-approved', text: 'Fully Approved' },
      'rejected': { class: 'badge-rejected', text: 'Rejected' },
      'rejected_by_vice_president': { class: 'badge-rejected', text: 'Rejected (VP)' }
    };
    const statusInfo = statusMap[status] || { class: 'badge-default', text: status };
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  // Filter requests - show ALL requests with status 'approved_by_finance' OR with finance approval records
  const pendingRequests = requests.filter(r => {
    const hasFinanceApproval = r.approvals?.some(a => 
      a.approval_level === 'finance_officer' && a.action === 'approve'
    );
    // Primary: status must be approved_by_finance
    // Secondary: has finance approval record (catches edge cases)
    return r.status === 'approved_by_finance' || 
           (hasFinanceApproval && r.status !== 'approved' && r.status !== 'approved_by_vice_president' && r.status !== 'rejected_by_vice_president' && r.status !== 'rejected');
  });
  
  // Debug logging
  if (pendingRequests.length === 0 && requests.length > 0) {
    console.warn('[VP Dashboard] ⚠️ No pending requests found! All request statuses:', requests.map(r => ({ id: r.id, title: r.title, status: r.status })));
  }

  return (
    <div className="vice-president-dashboard">
      <div className="dashboard-header">
        <h1>Vice President Dashboard</h1>
        <p>Welcome, {user?.branchname || user?.email}</p>
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card pending">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <h3>Pending Approvals</h3>
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
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Total Requests</h3>
            <p className="stat-value">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* Pending Requests for Approval */}
      <div className="requests-section">
        <div className="section-header">
          <div>
            <h2>Pending Requests for Final Approval ({pendingRequests.length})</h2>
            <p className="section-description">
              These requests have been approved by Mission Secretary and Finance Officer. Review and provide final approval.
            </p>
          </div>
          {pendingRequests.length > 0 && (
            <div className="new-requests-badge">
              🔔 {pendingRequests.length} New Request{pendingRequests.length > 1 ? 's' : ''} from Finance Officer
            </div>
          )}
        </div>
        <div className="requests-list">
          {pendingRequests.length === 0 ? (
            <div className="no-requests">No pending requests for approval</div>
          ) : (
            pendingRequests.map(request => (
              <div key={request.id} className="request-card pending-approval-card">
                <div className="request-header">
                  <div>
                    <div className="request-title-row">
                      <h3>{request.title}</h3>
                      <span className="urgent-badge">⚠️ Requires Immediate Attention</span>
                    </div>
                    <p className="request-meta">
                      From: <strong>{request.requested_by_name}</strong> | 
                      Type: <strong>{request.request_type}</strong> | 
                      Priority: <strong className={`priority-${request.priority}`}>{request.priority.toUpperCase()}</strong>
                    </p>
                    <p className="request-timeline">
                      ✅ Approved by Mission Secretary → ✅ Approved by Finance Officer → ⏳ <strong>Pending Your Final Approval</strong>
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
                    <p className="request-department">Department: {request.department_name}</p>
                  )}
                  
                  {/* Approval History */}
                  {request.approvals && request.approvals.length > 0 && (
                    <div className="approval-history">
                      <h4>Approval History:</h4>
                      {request.approvals.map((approval, idx) => (
                        <div key={idx} className="approval-item">
                          <strong>{approval.approval_level.replace('_', ' ').toUpperCase()}:</strong> 
                          <span className={approval.action === 'approve' ? 'approved' : 'rejected'}>
                            {approval.action === 'approve' ? '✅ Approved' : '❌ Rejected'}
                          </span>
                          {' by '}
                          <strong>{approval.approved_by_name}</strong>
                          {approval.comments && (
                            <p className="approval-comments">Comments: {approval.comments}</p>
                          )}
                          <p className="approval-date">
                            {new Date(approval.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <p className="request-date">
                    Submitted: {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="request-actions">
                  <button 
                    className="btn-approve"
                    onClick={() => {
                      setSelectedRequest(request);
                      setAction('approve');
                      setComments('');
                      setShowModal(true);
                    }}
                  >
                    ✅ Final Approve
                  </button>
                  <button 
                    className="btn-reject"
                    onClick={() => {
                      setSelectedRequest(request);
                      setAction('reject');
                      setComments('');
                      setShowModal(true);
                    }}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* All Requests */}
      <div className="requests-section">
        <h2>All Requests</h2>
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
                      Type: <strong>{request.request_type}</strong>
                    </p>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
                <p className="request-description">{request.description}</p>
                {request.amount && (
                  <p className="request-amount">
                    Amount: <strong>{formatCurrency(request.amount, request.currency)}</strong>
                  </p>
                )}
                {request.approvals && request.approvals.length > 0 && (
                  <div className="approval-history">
                    <h4>Approval History:</h4>
                    {request.approvals.map((approval, idx) => (
                      <div key={idx} className="approval-item">
                        <strong>{approval.approval_level.replace('_', ' ').toUpperCase()}:</strong> 
                        <span className={approval.action === 'approve' ? 'approved' : 'rejected'}>
                          {approval.action === 'approve' ? '✅ Approved' : '❌ Rejected'}
                        </span>
                        {' by '}
                        <strong>{approval.approved_by_name}</strong>
                        {approval.comments && (
                          <p className="approval-comments">Comments: {approval.comments}</p>
                        )}
                      </div>
                    ))}
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
            <h2>{action === 'approve' ? 'Final Approve' : 'Reject'} Request</h2>
            <p><strong>{selectedRequest.title}</strong></p>
            {selectedRequest.amount && (
              <p className="modal-amount">
                Amount: <strong>{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</strong>
              </p>
            )}
            <p className="modal-description">{selectedRequest.description}</p>
            
            {/* Show approval history */}
            {selectedRequest.approvals && selectedRequest.approvals.length > 0 && (
              <div className="approval-history-modal">
                <h4>Previous Approvals:</h4>
                {selectedRequest.approvals.map((approval, idx) => (
                  <div key={idx} className="approval-item">
                    <strong>{approval.approval_level.replace('_', ' ').toUpperCase()}:</strong> 
                    <span className={approval.action === 'approve' ? 'approved' : 'rejected'}>
                      {approval.action === 'approve' ? '✅ Approved' : '❌ Rejected'}
                    </span>
                    {' by '}
                    <strong>{approval.approved_by_name}</strong>
                    {approval.comments && (
                      <p className="approval-comments">Comments: {approval.comments}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="form-group">
              <label>Comments (Optional)</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows="4"
                placeholder="Add comments..."
              />
            </div>
            <div className="modal-actions">
              <button
                className={action === 'approve' ? 'btn-approve' : 'btn-reject'}
                onClick={handleApproval}
              >
                {action === 'approve' ? 'Final Approve' : 'Reject'} Request
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

export default VicePresidentDashboard;

