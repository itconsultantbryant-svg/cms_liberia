import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './Dashboards.css';
import './Dashboard.css';

// Admin Requests View Component - Shows only fully approved requests (viewing only)
const AdminRequestsView = ({ requests }) => {
  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'approved': { class: 'badge-approved', text: '✅ Fully Approved' }
    };
    const statusInfo = statusMap[status] || { class: 'badge-default', text: status };
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  return (
    <div className="admin-requests-section">
      <h2>Fully Approved Requests (View Only)</h2>
      <p className="section-description" style={{ marginBottom: '20px', color: '#666' }}>
        These requests have been fully approved by all approvers (Resident Pastor → Mission Secretary → Finance Officer → Vice President)
      </p>
      <div className="requests-list">
        {requests.length === 0 ? (
          <div className="no-requests">
            <p>No fully approved requests found.</p>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              Only requests with status "approved" are shown here.
            </p>
          </div>
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
              {request.approvals && request.approvals.length > 0 && (
                <div className="approval-history">
                  <h4>Complete Approval History:</h4>
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
                Submitted: {new Date(request.created_at).toLocaleString()} | 
                Last Updated: {new Date(request.updated_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const [showRequests, setShowRequests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
    // Refresh every 30 seconds for realtime updates
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setError('');
      const [dashboardRes, requestsRes] = await Promise.all([
        axios.get('/api/dashboard'),
        axios.get('/api/requests').catch(err => {
          console.error('Error fetching requests:', err);
          return { data: [] };
        })
      ]);
      setDashboardData(dashboardRes.data);
      
      // Admin sees only fully approved requests (status = 'approved')
      if (dashboardRes.data?.isAdmin) {
        const approvedRequests = (requestsRes.data || []).filter(r => r.status === 'approved');
        setAllRequests(approvedRequests);
        console.log(`[Admin Dashboard] Found ${approvedRequests.length} fully approved requests`);
      } else {
        // Other users see all request history
        setAllRequests(requestsRes.data || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    // Ensure currency is USD or LRD only
    const validCurrency = (currency === 'USD' || currency === 'LRD') ? currency : 'USD';
    
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: validCurrency,
        minimumFractionDigits: 2
      }).format(amount || 0);
    } catch (error) {
      // Fallback formatting if currency is not supported
      const symbol = validCurrency === 'LRD' ? 'L$' : '$';
      return `${symbol}${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '20px', 
        margin: '20px',
        backgroundColor: '#fee', 
        color: '#c33', 
        borderRadius: '5px',
        border: '1px solid #fcc'
      }}>
        {error}
        <button onClick={fetchDashboardData} style={{ marginLeft: '10px', padding: '5px 10px' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!dashboardData) {
    return <div>No data available</div>;
  }

  const { stats, attendance, collections, events, announcements, adminStats, isAdmin, currency } = dashboardData;
  const userCurrency = currency || user?.currency || 'USD';

  return (
    <div className="dashboard-container">
      {/* Welcome Section */}
      <div className="dashboard-header">
        <h1>Welcome, {user?.branchname || user?.email || 'User'}</h1>
        {user?.primaryRole && (
          <p className="user-role">{user.primaryRole.role_name}</p>
        )}
      </div>

      {/* Admin Statistics Section */}
      {isAdmin && adminStats && (
        <div className="admin-stats-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>System Overview</h2>
            <div>
              <Link to="/departments" className="btn-manage-departments">
                🏢 Manage Departments
              </Link>
              <Link to="/requests" className="btn-manage-departments" style={{ marginLeft: '10px' }}>
                📋 View All Requests
              </Link>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card admin-card">
              <div className="stat-icon">🏢</div>
              <div className="stat-content">
                <h3>Total Branches</h3>
                <p className="stat-value">{adminStats.totalBranches}</p>
              </div>
            </div>
            <div className="stat-card admin-card">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <h3>System Users</h3>
                <p className="stat-value">{adminStats.totalUsers}</p>
              </div>
            </div>
            <div className="stat-card admin-card">
              <div className="stat-icon">🙏</div>
              <div className="stat-content">
                <h3>Total Members</h3>
                <p className="stat-value">{adminStats.systemMembers}</p>
              </div>
            </div>
            <div className="stat-card admin-card">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <h3>System Collections</h3>
                <p className="stat-value">{formatCurrency(adminStats.systemCollections, userCurrency)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch Statistics */}
      <div className="stats-section">
        <h2>Branch Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>Total Members</h3>
              <p className="stat-value">{stats.totalMembers}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👔</div>
            <div className="stat-content">
              <h3>Pastors</h3>
              <p className="stat-value">
                {stats.membersByPosition.find(m => m.position === 'pastor' || m.position === 'senior pastor')?.count || 0}
              </p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>Workers</h3>
              <p className="stat-value">
                {stats.membersByPosition.find(m => m.position === 'worker')?.count || 0}
              </p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✓</div>
            <div className="stat-content">
              <h3>Avg. Attendance</h3>
              <p className="stat-value">{attendance.average}</p>
              <p className="stat-label">Last 7 days</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>Total Collections</h3>
              <p className="stat-value">{formatCurrency(collections.total, userCurrency)}</p>
              <p className="stat-label">Last 30 days</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👤</div>
            <div className="stat-content">
              <h3>Groups</h3>
              <p className="stat-value">{stats.totalGroups}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Statistics */}
      <div className="details-section">
        <div className="details-grid">
          {/* Members by Position */}
          <div className="detail-card">
            <h3>Members by Position</h3>
            <div className="detail-list">
              {stats.membersByPosition.length > 0 ? (
                stats.membersByPosition.map((item, index) => (
                  <div key={index} className="detail-item">
                    <span className="detail-label">{item.position || 'Not specified'}</span>
                    <span className="detail-value">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="no-data">No position data available</p>
              )}
            </div>
          </div>

          {/* Members by Gender */}
          <div className="detail-card">
            <h3>Members by Gender</h3>
            <div className="detail-list">
              {stats.membersByGender.length > 0 ? (
                stats.membersByGender.map((item, index) => (
                  <div key={index} className="detail-item">
                    <span className="detail-label">{item.sex === 'male' ? '👨 Male' : '👩 Female'}</span>
                    <span className="detail-value">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="no-data">No gender data available</p>
              )}
            </div>
          </div>

          {/* Collections by Type */}
          <div className="detail-card">
            <h3>Collections by Type</h3>
            <div className="detail-list">
              {collections.byType && collections.byType.length > 0 ? (
                collections.byType.map((item, index) => (
                  <div key={index} className="detail-item">
                    <span className="detail-label">{item.type || 'Other'}</span>
                    <span className="detail-value">{formatCurrency(item.total_amount, userCurrency)}</span>
                    <span className="detail-count">({item.count} records)</span>
                  </div>
                ))
              ) : (
                <p className="no-data">No collection data available</p>
              )}
            </div>
          </div>

          {/* Groups */}
          <div className="detail-card">
            <h3>Groups</h3>
            <div className="detail-list">
              {stats.groups && stats.groups.length > 0 ? (
                stats.groups.map((group) => (
                  <div key={group.id} className="detail-item">
                    <span className="detail-label">{group.name}</span>
                    <span className="detail-value">{group.member_count} members</span>
                  </div>
                ))
              ) : (
                <p className="no-data">No groups available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Events & Announcements */}
      <div className="events-section">
        <div className="events-grid">
          <div className="event-card">
            <h3>Upcoming Events</h3>
            {events.upcoming && events.upcoming.length > 0 ? (
              <ul className="event-list">
                {events.upcoming.map(event => (
                  <li key={event.id} className="event-item">
                    <div className="event-date">{formatDate(event.date)}</div>
                    <div className="event-details">
                      <strong>{event.title}</strong>
                      {event.location && <span className="event-location">📍 {event.location}</span>}
                      {event.time && <span className="event-time">🕐 {event.time}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-data">No upcoming events</p>
            )}
          </div>

          <div className="event-card">
            <h3>Announcements</h3>
            {announcements && announcements.length > 0 ? (
              <ul className="announcement-list">
                {announcements.map(announcement => (
                  <li key={announcement.id} className="announcement-item">
                    <div className="announcement-header">
                      <strong>{announcement.by_who}</strong>
                      <span className="announcement-date">
                        {formatDate(announcement.start_date || announcement.created_at)}
                      </span>
                    </div>
                    <div className="announcement-text">{announcement.details}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-data">No announcements</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Attendance Chart */}
      {attendance.recent && attendance.recent.length > 0 && (
        <div className="attendance-section">
          <h3>Attendance Trend (Last 7 Days)</h3>
          <div className="attendance-chart">
            {attendance.recent.map((day, index) => {
              const maxAttendance = Math.max(...attendance.recent.map(d => d.present_count || 0));                                                                                            
              const percentage = maxAttendance > 0 ? (day.present_count / maxAttendance) * 100 : 0;                                                                                           
              return (
                <div key={index} className="attendance-bar">
                  <div className="bar-container">
                    <div 
                      className="bar-fill" 
                      style={{ height: `${percentage}%` }}
                      title={`${day.present_count} members`}
                    ></div>
                  </div>
                  <div className="bar-label">{formatDate(day.date)}</div>
                  <div className="bar-value">{day.present_count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: Fully Approved Requests Section */}
      {isAdmin && (
        <div style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>Fully Approved Requests</h2>
            <button 
              onClick={() => setShowRequests(!showRequests)}
              className="btn-manage-departments"
              style={{ padding: '10px 20px' }}
            >
              {showRequests ? 'Hide' : 'Show'} Approved Requests ({allRequests.length})
            </button>
          </div>
          {showRequests && <AdminRequestsView requests={allRequests} />}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
