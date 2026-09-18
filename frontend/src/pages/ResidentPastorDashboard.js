import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './Dashboards.css';
import './ResidentPastorDashboard.css';

const ResidentPastorDashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    request_type: 'financial',
    title: '',
    description: '',
    amount: '',
    currency: user?.currency || 'USD',
    priority: 'normal',
    department_id: ''
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [dashboardRes, departmentsRes, requestsRes] = await Promise.all([
        axios.get('/api/dashboard'),
        axios.get('/api/departments'),
        axios.get('/api/requests')
      ]);

      setDashboardData(dashboardRes.data);
      setDepartments(departmentsRes.data);
      setRequests(requestsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/requests', requestForm);
      setShowRequestModal(false);
      setRequestForm({
        request_type: 'financial',
        title: '',
        description: '',
        amount: '',
        currency: user?.currency || 'USD',
        priority: 'normal',
        department_id: ''
      });
      fetchData();
      alert('Request submitted successfully');
    } catch (error) {
      console.error('Error submitting request:', error);
      alert(error.response?.data?.error || 'Failed to submit request');
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
      'rejected_by_mission_secretary': { class: 'badge-rejected', text: 'Rejected (MS)' },
      'approved_by_finance': { class: 'badge-approved', text: 'Approved (Finance)' },
      'rejected_by_finance': { class: 'badge-rejected', text: 'Rejected (Finance)' },
      'approved_by_vice_president': { class: 'badge-approved', text: 'Approved (VP)' },
      'approved': { class: 'badge-approved', text: 'Fully Approved' },
      'rejected': { class: 'badge-rejected', text: 'Rejected' }
    };
    const statusInfo = statusMap[status] || { class: 'badge-default', text: status };
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const { stats, attendance, collections } = dashboardData || {};

  return (
    <div className="resident-pastor-dashboard">
      <div className="dashboard-header">
        <h1>Resident Pastor Dashboard</h1>
        <p>Welcome, {user?.branchname || user?.email}</p>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Total Members</h3>
            <p className="stat-value">{stats?.totalMembers || 0}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <h3>Avg. Attendance</h3>
            <p className="stat-value">{attendance?.average || 0}</p>
            <p className="stat-label">Last 7 days</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Collections</h3>
            <p className="stat-value">{formatCurrency(collections?.total || 0, user?.currency || 'USD')}</p>
            <p className="stat-label">Last 30 days</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <h3>My Requests</h3>
            <p className="stat-value">{requests.length}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button className="action-btn" onClick={() => setShowRequestModal(true)}>
          ➕ Submit New Request
        </button>
        <Link to="/members" className="action-btn">
          👥 Manage Members
        </Link>
        <Link to="/attendance" className="action-btn">
          ✓ Record Attendance
        </Link>
        <Link to="/collections" className="action-btn">
          💰 Record Collections
        </Link>
        <Link to="/events" className="action-btn">
          📅 Manage Events
        </Link>
      </div>

      {/* Departments */}
      <div className="departments-section">
        <h2>Departments</h2>
        <div className="departments-grid">
          {departments.length === 0 ? (
            <div className="no-data">No departments available</div>
          ) : (
            departments.map(dept => (
              <div key={dept.id} className="department-card">
                <h3>{dept.department_name}</h3>
                <p className="dept-code">{dept.department_code}</p>
                {dept.description && <p className="dept-description">{dept.description}</p>}
                {dept.assigned_users_count > 0 && (
                  <p className="dept-users">{dept.assigned_users_count} assigned user(s)</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* My Requests */}
      <div className="requests-section">
        <h2>My Requests</h2>
        <div className="requests-list">
          {requests.length === 0 ? (
            <div className="no-requests">No requests submitted yet</div>
          ) : (
            requests.map(request => (
              <div key={request.id} className="request-card">
                <div className="request-header">
                  <h3>{request.title}</h3>
                  {getStatusBadge(request.status)}
                </div>
                <p className="request-type">Type: {request.request_type}</p>
                <p className="request-description">{request.description}</p>
                {request.amount && (
                  <p className="request-amount">
                    Amount: <strong>{formatCurrency(request.amount, request.currency)}</strong>
                  </p>
                )}
                <p className="request-date">
                  Submitted: {new Date(request.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Submit New Request</h2>
            <form onSubmit={handleSubmitRequest}>
              <div className="form-group">
                <label>Request Type *</label>
                <select
                  value={requestForm.request_type}
                  onChange={(e) => setRequestForm({ ...requestForm, request_type: e.target.value })}
                  required
                >
                  <option value="financial">Financial</option>
                  <option value="personnel">Personnel</option>
                  <option value="project">Project</option>
                  <option value="program">Program</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={requestForm.title}
                  onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={requestForm.description}
                  onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                  rows="4"
                  required
                />
              </div>

              {requestForm.request_type === 'financial' && (
                <>
                  <div className="form-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={requestForm.amount}
                      onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Currency</label>
                    <select
                      value={requestForm.currency}
                      onChange={(e) => setRequestForm({ ...requestForm, currency: e.target.value })}
                    >
                      <option value="USD">USD</option>
                      <option value="LRD">LRD</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Priority</label>
                <select
                  value={requestForm.priority}
                  onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="form-group">
                <label>Department (Optional)</label>
                <select
                  value={requestForm.department_id}
                  onChange={(e) => setRequestForm({ ...requestForm, department_id: e.target.value })}
                >
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-submit">Submit Request</button>
                <button type="button" className="btn-cancel" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidentPastorDashboard;

