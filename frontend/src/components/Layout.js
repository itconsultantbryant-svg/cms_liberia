import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { SIDEBAR_SECTIONS, SIDEBAR_CONFIG, canShowSidebarItem } from '../config/permissions';
import './Layout.css';

const COLLAPSE_KEY = 'cms_sidebar_collapsed';

function titleForPath(pathname) {
  if (pathname === '/') return 'Dashboard';
  const exact = SIDEBAR_CONFIG.find((i) => i.path === pathname);
  if (exact) return exact.label;
  const partial = SIDEBAR_CONFIG
    .filter((i) => i.path !== '/' && pathname.startsWith(i.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (partial) return partial.label;
  const segment = pathname.split('/').filter(Boolean).pop() || 'Page';
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function breadcrumbsFor(pathname) {
  const crumbs = [{ path: '/', label: 'Home' }];
  if (pathname === '/') return crumbs;
  const parts = pathname.split('/').filter(Boolean);
  let acc = '';
  parts.forEach((part, idx) => {
    acc += `/${part}`;
    const match = SIDEBAR_CONFIG.find((i) => i.path === acc);
    const label =
      match?.label ||
      (idx === parts.length - 1
        ? titleForPath(pathname)
        : part.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    crumbs.push({ path: acc, label });
  });
  return crumbs;
}

const Layout = ({ children }) => {
  const { user, logout, selectBranch, endSupportAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [accessibleBranches, setAccessibleBranches] = useState([]);
  const [endingSupport, setEndingSupport] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch (_) {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const notificationRef = useRef(null);
  const profileRef = useRef(null);
  const searchRef = useRef(null);

  const handleEndSupport = async () => {
    setEndingSupport(true);
    try {
      await endSupportAccess();
      navigate('/superadmin');
      window.location.reload();
    } catch (err) {
      console.error('End support failed', err);
      alert(err.response?.data?.error || 'Failed to end support access');
    } finally {
      setEndingSupport(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    axios
      .get('/api/branches/accessible')
      .then((res) => setAccessibleBranches(res.data.branches || []))
      .catch(() => setAccessibleBranches(user.availableBranches || []));
  }, [user]);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? '1' : '0');
    } catch (_) { /* ignore */ }
  }, [sidebarCollapsed]);

  const handleBranchChange = async (e) => {
    const id = Number(e.target.value);
    if (!id || id === Number(user?.activeBranchId)) return;
    try {
      await selectBranch(id);
      window.location.reload();
    } catch (err) {
      console.error('Branch switch failed', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 5000);
      return () => clearInterval(interval);
    }
    // Intentionally re-run only when user identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.body.classList.add('cms-drawer-open');
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('cms-drawer-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const fetchNotifications = async () => {
    try {
      if (!user) return;
      const response = await axios.get('/api/notifications');
      if (response.data && response.data.notifications) {
        setNotifications(response.data.notifications.slice(0, 10));
        setUnreadCount(response.data.unreadCount || 0);
      }
    } catch (error) {
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const sidebarSections = useMemo(
    () =>
      SIDEBAR_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => canShowSidebarItem(item, user))
      })).filter((section) => section.items.length > 0),
    [user]
  );

  const searchableItems = useMemo(
    () => sidebarSections.flatMap((s) => s.items),
    [sidebarSections]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchableItems.slice(0, 8);
    return searchableItems
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [searchQuery, searchableItems]);

  const goSearch = (item) => {
    if (!item) return;
    setSearchQuery('');
    setSearchOpen(false);
    setMobileOpen(false);
    navigate(item.path);
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchResults[0]) {
      e.preventDefault();
      goSearch(searchResults[0]);
    }
  };

  const crumbs = breadcrumbsFor(location.pathname);
  const pageTitle = titleForPath(location.pathname);
  const churchWebsite = user?.church?.websiteUrl || user?.church?.website_url;

  if (!user) {
    return <div className="layout-loading">Loading…</div>;
  }

  const layoutClass = [
    'layout',
    sidebarCollapsed ? 'layout--collapsed' : '',
    mobileOpen ? 'layout--mobile-open' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClass}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-header">
          <Link to="/" className="sidebar-logo" onClick={() => setMobileOpen(false)}>
            {user?.church?.logoUrl ? (
              <img
                src={user.church.logoUrl}
                alt={user.church.shortName || user.church.name || 'Church'}
                className="sidebar-logo-img"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="sidebar-logo-fallback" aria-hidden>
                {(user?.church?.shortName || user?.church?.name || 'C').charAt(0)}
              </span>
            )}
            <h2 className="sidebar-brand-text">
              {user?.church?.shortName || user?.church?.name || 'CMS'}
            </h2>
          </Link>
          <button
            type="button"
            className="sidebar-collapse-btn desktop-only"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
          <button
            type="button"
            className="sidebar-close-mobile mobile-only"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="sidebar-nav">
          {sidebarSections.map((section) => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                  title={item.description || item.label}
                  onClick={() => setMobileOpen(false)}
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
        {user?.supportMode && (
          <div className="support-access-banner" role="status">
            <div className="support-access-banner-text">
              <strong>You are currently accessing this church as Superadmin.</strong>
              <span>
                {user.supportChurchName || user.church?.name || 'Tenant'}
                {user.supportReason ? ` · Reason: ${user.supportReason}` : ''}
                {` · Acting as ${user.email} (not a church administrator)`}
              </span>
            </div>
            <button
              type="button"
              className="btn support-exit-btn"
              onClick={handleEndSupport}
              disabled={endingSupport}
            >
              {endingSupport ? 'Ending…' : 'End support access'}
            </button>
          </div>
        )}

        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <button
              type="button"
              className="menu-toggle desktop-collapse-toggle"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              ☰
            </button>
            <div className="topbar-titles">
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={c.path} className="breadcrumb-item">
                    {i > 0 && <span className="breadcrumb-sep">/</span>}
                    {i === crumbs.length - 1 ? (
                      <span className="breadcrumb-current">{c.label}</span>
                    ) : (
                      <Link to={c.path}>{c.label}</Link>
                    )}
                  </span>
                ))}
              </nav>
              <h1 className="page-title">{pageTitle}</h1>
            </div>
          </div>

          <div className="topbar-right">
            <div className="global-search" ref={searchRef}>
              <input
                type="search"
                className="global-search-input"
                placeholder="Search modules…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKeyDown}
                aria-label="Search modules"
              />
              {searchOpen && searchResults.length > 0 && (
                <ul className="global-search-results" role="listbox">
                  {searchResults.map((item) => (
                    <li key={item.path}>
                      <button type="button" onClick={() => goSearch(item)}>
                        <span className="sidebar-icon">{item.icon}</span>
                        <span>
                          <strong>{item.label}</strong>
                          {item.description && <small>{item.description}</small>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {accessibleBranches.length > 1 && (
              <select
                className="branch-selector"
                value={user?.activeBranchId || user?.branchId || ''}
                onChange={handleBranchChange}
                title="Switch branch context"
                aria-label="Branch selector"
              >
                {accessibleBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branchname}
                    {b.is_headquarters ? ' (HQ)' : ''}
                  </option>
                ))}
              </select>
            )}

            {churchWebsite && (
              <a
                className="church-website-link"
                href={churchWebsite.startsWith('http') ? churchWebsite : `https://${churchWebsite}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Church website"
              >
                🌐
              </a>
            )}

            <div className="notification-wrapper" ref={notificationRef}>
              <button
                type="button"
                className="notification-btn"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
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
                        <button type="button" onClick={markAllAsRead} className="mark-all-read-btn">
                          Mark all read
                        </button>
                      )}
                      <button type="button" onClick={() => setShowNotifications(false)}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="notification-item">No new notifications</div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                          onClick={() => {
                            if (!notification.is_read) {
                              markNotificationAsRead(notification.id);
                            }
                          }}
                          onKeyDown={() => {}}
                          role="button"
                          tabIndex={0}
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
                  <div className="notification-header" style={{ borderTop: '1px solid #eee' }}>
                    <Link
                      to="/notifications"
                      onClick={() => setShowNotifications(false)}
                      style={{ fontSize: 13 }}
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="profile-wrapper" ref={profileRef}>
              <button
                type="button"
                className="profile-btn"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                aria-label="User profile menu"
              >
                <div className="profile-avatar">
                  {(user?.branchname || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="profile-name">{user?.branchname || user?.email || 'User'}</span>
                <span className="profile-arrow">▼</span>
              </button>
              {showProfileMenu && (
                <div className="profile-dropdown">
                  <div className="profile-info">
                    <div className="profile-info-name">{user?.branchname || 'User'}</div>
                    <div className="profile-info-email">{user?.email || 'No email'}</div>
                    {user?.primaryRole && (
                      <div className="profile-info-badge">{user.primaryRole.role_name}</div>
                    )}
                    {user?.church?.name && (
                      <div className="profile-info-email" style={{ marginTop: 6 }}>
                        Church: {user.church.name}
                      </div>
                    )}
                    {user?.isadmin && !user?.primaryRole && (
                      <div className="profile-info-badge">Admin</div>
                    )}
                  </div>
                  <div className="profile-divider" />
                  {churchWebsite && (
                    <a
                      className="profile-logout"
                      href={
                        churchWebsite.startsWith('http')
                          ? churchWebsite
                          : `https://${churchWebsite}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowProfileMenu(false)}
                      style={{ color: '#2c3e50', textDecoration: 'none', display: 'block' }}
                    >
                      Church website
                    </a>
                  )}
                  {user?.isSuperadmin && (
                    <button
                      type="button"
                      className="profile-logout"
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/superadmin');
                      }}
                    >
                      Superadmin portal
                    </button>
                  )}
                  <button
                    type="button"
                    className="profile-logout"
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/change-password');
                    }}
                  >
                    Change password
                  </button>
                  <button type="button" onClick={handleLogout} className="profile-logout">
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
