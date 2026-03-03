import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './SecretaryDashboard.css';

const SecretaryDashboard = () => {
  const { user } = useAuth();
  const [pendingItems, setPendingItems] = useState([]);
  const [stats, setStats] = useState({
    membersAdded: 0,
    attendanceRecorded: 0,
    collectionsRecorded: 0,
    reportsSubmitted: 0
  });
  const [loading, setLoading] = useState(true);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch pending approvals for this sub-user
      const approvalsRes = await axios.get('/api/approvals/pending');
      setPendingItems(approvalsRes.data.filter(a => a.submitted_by === user.id));

      // Fetch stats (members, attendance, collections submitted by this user)
      const [membersRes, attendanceRes, collectionsRes, reportsRes] = await Promise.all([
        axios.get('/api/members').catch(() => ({ data: [] })),
        axios.get('/api/attendance/view').catch(() => ({ data: [] })),
        axios.get('/api/collections/history').catch(() => ({ data: [] })),
        axios.get('/api/finance-reports').catch(() => ({ data: [] }))
      ]);

      setStats({
        membersAdded: membersRes.data.length,
        attendanceRecorded: attendanceRes.data.length,
        collectionsRecorded: collectionsRes.data.length,
        reportsSubmitted: reportsRes.data.filter(r => r.submitted_by === user.id).length
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission) => {
    return user?.permissions?.includes(permission) || false;
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="secretary-dashboard">
      <div className="dashboard-header">
        <h1>Secretary Dashboard</h1>
        <p>Welcome, {user?.firstname || user?.branchname || 'Secretary'}</p>
        <p className="user-position">Position: {user?.position || 'Secretary'}</p>
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Members Added</h3>
            <p className="stat-value">{stats.membersAdded}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <h3>Attendance Recorded</h3>
            <p className="stat-value">{stats.attendanceRecorded}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Collections Recorded</h3>
            <p className="stat-value">{stats.collectionsRecorded}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Reports Submitted</h3>
            <p className="stat-value">{stats.reportsSubmitted}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        {hasPermission('add_members') && (
          <Link to="/members" className="action-btn">
            ➕ Add Member
          </Link>
        )}
        {hasPermission('record_attendance') && (
          <Link to="/attendance" className="action-btn">
            ✓ Record Attendance
          </Link>
        )}
        {hasPermission('record_collections') && (
          <Link to="/collections" className="action-btn">
            💰 Record Collections
          </Link>
        )}
        {hasPermission('submit_financial_reports') && (
          <button className="action-btn" onClick={() => setShowReportForm(true)}>
            📊 Submit Finance Report
          </button>
        )}
      </div>

      {/* Pending Approvals */}
      <div className="pending-section">
        <h2>Pending Approvals</h2>
        <p className="section-description">
          Items you've submitted are waiting for Resident Pastor approval
        </p>
        <div className="pending-list">
          {pendingItems.length === 0 ? (
            <div className="no-pending">No pending items</div>
          ) : (
            pendingItems.map(item => (
              <div key={item.id} className="pending-item">
                <div className="pending-header">
                  <h3>{item.approval_type.charAt(0).toUpperCase() + item.approval_type.slice(1)} Submission</h3>
                  <span className="status-badge badge-pending">Pending</span>
                </div>
                <p className="pending-date">
                  Submitted: {new Date(item.created_at).toLocaleString()}
                </p>
                {item.details && (
                  <div className="pending-details">
                    {item.approval_type === 'member' && (
                      <p><strong>Member:</strong> {item.details.firstname} {item.details.lastname}</p>
                    )}
                    {item.approval_type === 'attendance' && (
                      <p><strong>Date:</strong> {new Date(item.details.attendance_date).toLocaleDateString()}</p>
                    )}
                    {item.approval_type === 'collection' && (
                      <p><strong>Date:</strong> {new Date(item.details.date).toLocaleDateString()}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Finance Report Modal */}
      {showReportForm && (
        <FinanceReportModal
          onClose={() => setShowReportForm(false)}
          onSuccess={() => {
            setShowReportForm(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

// Finance Report Modal Component
const FinanceReportModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    report_type: 'financial',
    title: '',
    period_start: '',
    period_end: '',
    content: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/finance-reports', {
        ...formData,
        content: JSON.stringify({
          summary: formData.content,
          submitted_by: `${user.firstname} ${user.lastname}`,
          submitted_at: new Date().toISOString()
        })
      });
      alert('Finance report submitted successfully. Waiting for approval.');
      onSuccess();
    } catch (error) {
      console.error('Error submitting report:', error);
      alert(error.response?.data?.error || 'Failed to submit report');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Submit Finance Report</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Report Type *</label>
            <select
              value={formData.report_type}
              onChange={(e) => setFormData({ ...formData, report_type: e.target.value })}
              required
            >
              <option value="financial">Financial Report</option>
              <option value="attendance">Attendance Report</option>
              <option value="membership">Membership Report</option>
              <option value="general">General Report</option>
            </select>
          </div>

          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Period Start *</label>
            <input
              type="date"
              value={formData.period_start}
              onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Period End *</label>
            <input
              type="date"
              value={formData.period_end}
              onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Report Content *</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows="8"
              required
              placeholder="Enter report details, summary, financial data, etc."
            />
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-submit">Submit Report</button>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SecretaryDashboard;

