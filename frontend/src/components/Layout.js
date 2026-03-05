import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { SIDEBAR_SECTIONS, canShowSidebarItem } from '../config/permissions';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notificationRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      // Real-time polling: every 5 seconds for immediate updates
      const interval = setInterval(fetchNotifications, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      // Only fetch if user is logged in
      if (!user) return;
      
      const response = await axios.get('/api/notifications');
      if (response.data && response.data.notifications) {
        setNotifications(response.data.notifications.slice(0, 10));
        setUnreadCount(response.data.unreadCount || 0);
      }
    } catch (error) {
      // Silently fail - notifications are not critical
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  // Don't render if user is not loaded yet
  if (!user) {
    return <div>Loading...</div>;
  }

  // Sub-users see limited navigation; branch users see items by permission/role; admin sees all
  const sidebarSections = SIDEBAR_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => canShowSidebarItem(item, user)),
  })).filter(section => section.items.length > 0);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/" className="sidebar-logo">
            <h2>CMS</h2>
          </Link>
        </div>
        <nav className="sidebar-nav">
          {sidebarSections.map(section => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                  title={item.description}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span className="sidebar-link-content">
                    <span className="sidebar-link-label">{item.label}</span>
                    {item.description && (
                      <span className="sidebar-link-desc">{item.description}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">
              {location.pathname === '/' && 'Dashboard'}
              {location.pathname.startsWith('/members') && 'Members'}
              {location.pathname === '/attendance' && 'Attendance'}
              {location.pathname === '/collections' && 'Collections'}
              {location.pathname === '/events' && 'Events'}
              {location.pathname === '/groups' && 'Groups'}
              {location.pathname === '/reports' && 'Reports'}
              {location.pathname === '/users' && 'User Management'}
              {location.pathname === '/roles' && 'Role Management'}
              {location.pathname === '/communications' && 'Communications'}
              {location.pathname === '/departments' && 'Department Management'}
              {location.pathname === '/mission-secretary' && 'Mission Secretary Dashboard'}
              {location.pathname === '/finance' && 'Finance Dashboard'}
              {location.pathname === '/resident-pastor' && 'Resident Pastor Dashboard'}
              {location.pathname === '/vice-president' && 'Vice President Dashboard'}
              {location.pathname === '/staff' && 'Staff Management'}
              {location.pathname === '/payroll' && 'Payroll Management'}
              {location.pathname === '/secretary' && 'Secretary Dashboard'}
            </h1>
          </div>
          <div className="topbar-right">
            <div className="notification-wrapper" ref={notificationRef}>
              <button 
                className="notification-btn"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <span className="notification-icon">🔔</span>
                {unreadCount > 0 && (
                  <span className="notification-badge">{unreadCount}</span>
                )}
              </button>
              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="notification-header">
                    <h3>Notifications {unreadCount > 0 && `(${unreadCount} unread)`}</h3>
                    <div>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="mark-all-read-btn">Mark all read</button>
                      )}
                      <button onClick={() => setShowNotifications(false)}>✕</button>
                    </div>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="notification-item">No new notifications</div>
                    ) : (
                      notifications.map(notification => (
                        <div 
                          key={notification.id} 
                          className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                          onClick={() => {
                            if (!notification.is_read) {
                              markNotificationAsRead(notification.id);
                            }
                          }}
                        >
                          <div className="notification-title">{notification.title}</div>
                          <div className="notification-text">{notification.message}</div>
                          <div className="notification-time">
                            {new Date(notification.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="profile-wrapper" ref={profileRef}>
              <button 
                className="profile-btn"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                <div className="profile-avatar">
                  {user ? ((user?.branchname || user?.email || 'U').charAt(0).toUpperCase()) : 'U'}
                </div>
                <span className="profile-name">{user ? (user?.branchname || user?.email || 'User') : 'User'}</span>
                <span className="profile-arrow">▼</span>
              </button>
              {showProfileMenu && (
                <div className="profile-dropdown">
                  <div className="profile-info">
                    <div className="profile-info-name">{user ? (user?.branchname || 'User') : 'User'}</div>
                    <div className="profile-info-email">{user?.email || 'No email'}</div>
                    {user?.primaryRole && (
                      <div className="profile-info-badge">{user.primaryRole.role_name}</div>
                    )}
                    {user?.isadmin && !user?.primaryRole && (
                      <div className="profile-info-badge">Admin</div>
                    )}
                  </div>
                  <div className="profile-divider"></div>
                  <button onClick={handleLogout} className="profile-logout">
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;

