import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './ChurchAdminOverview.css';

const ChurchAdminOverview = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: res } = await axios.get('/api/dashboard/admin-overview');
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currency = data?.church?.currency || user?.currency || 'USD';
  const money = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);

  if (loading) return <div className="cao-page"><p>Loading church overview…</p></div>;
  if (error) return <div className="cao-page"><div className="error-message">{error}</div></div>;
  if (!data) return null;

  const o = data.overview;
  const church = data.church || user?.church || {};
  const tiles = [
    { label: 'Members', value: o.members, to: data.links.members, icon: '👥' },
    { label: 'Visitors', value: o.visitors, to: '/visitors', icon: '🚶' },
    { label: 'Branches', value: o.branches, to: data.links.branches, icon: '🏛️' },
    { label: 'Attendance (30d)', value: o.attendanceLast30Days, to: data.links.attendance, icon: '✓' },
    { label: 'Donations (30d)', value: money(o.donationsLast30Days), to: data.links.donations, icon: '💰' },
    { label: 'Expenses (approved)', value: money(o.expensesApproved), to: data.links.finance, icon: '📉' },
    { label: 'Events upcoming', value: data.upcomingEvents.length, to: data.links.events, icon: '📅' },
    { label: 'Ministries', value: o.ministries, to: data.links.ministries, icon: '🙏' },
    { label: 'Staff', value: o.staff, to: data.links.staff, icon: '👔' },
    { label: 'Pending approvals', value: o.pendingApprovals, to: data.links.approvals, icon: '⏳' },
    { label: 'Admins', value: o.admins, to: data.links.admins, icon: '🛡️' },
    { label: 'Users / subadmins', value: o.subUsers || o.admins, to: '/users', icon: '👤' }
  ];

  return (
    <div className="cao-page">
      <header className="cao-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        {church.logoUrl || user?.church?.logoUrl ? (
          <img
            src={church.logoUrl || user.church.logoUrl}
            alt=""
            style={{ height: 48, width: 48, objectFit: 'contain', borderRadius: 8 }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              height: 48,
              width: 48,
              borderRadius: 8,
              background: church.primaryColor || user?.church?.primaryColor || '#2c3e50',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700
            }}
          >
            {(church.shortName || church.name || user?.church?.name || 'C').charAt(0)}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{church.name || user?.church?.name || 'Church'} Administration</h1>
          <p className="cao-sub" style={{ margin: '4px 0 0' }}>
            Manage members, staff, and subadmins · scoped to your church only
          </p>
        </div>
        <Link to="/settings/admins" className="btn btn-primary">Manage admins</Link>
      </header>

      <div className="cao-grid">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="cao-tile">
            <span className="cao-icon">{t.icon}</span>
            <span className="cao-label">{t.label}</span>
            <strong className="cao-value">{t.value}</strong>
          </Link>
        ))}
      </div>

      <div className="cao-panels">
        <section className="cao-panel card">
          <h3>Financial summary (30 days)</h3>
          <ul className="cao-list">
            <li>Collections: <strong>{money(data.financialSummary.collections30d)}</strong></li>
            <li>Member giving: <strong>{money(data.financialSummary.memberGiving30d)}</strong></li>
            <li>Approved request spend: <strong>{money(data.financialSummary.approvedRequestSpend)}</strong></li>
            <li>Net: <strong>{money(data.financialSummary.net30d)}</strong></li>
          </ul>
          <Link to="/finance">Open finance →</Link>
        </section>

        <section className="cao-panel card">
          <h3>Upcoming events</h3>
          {data.upcomingEvents.length === 0 ? (
            <p className="muted">No upcoming events</p>
          ) : (
            <ul className="cao-list">
              {data.upcomingEvents.map((e) => (
                <li key={e.id}>
                  <strong>{e.title}</strong> — {e.date}{e.time ? ` ${e.time}` : ''}
                </li>
              ))}
            </ul>
          )}
          <Link to="/events">All events →</Link>
        </section>

        <section className="cao-panel card">
          <h3>Membership statistics</h3>
          {data.membershipStatistics.length === 0 ? (
            <p className="muted">No members yet</p>
          ) : (
            <ul className="cao-list">
              {data.membershipStatistics.map((row) => (
                <li key={row.position}>
                  {row.position}: <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
          <Link to="/members">Members →</Link>
        </section>

        <section className="cao-panel card">
          <h3>Ministries / groups</h3>
          {data.ministries.length === 0 ? (
            <p className="muted">No ministries</p>
          ) : (
            <ul className="cao-list">
              {data.ministries.map((m) => (
                <li key={m.id}>
                  {m.name}: <strong>{m.member_count}</strong> members
                </li>
              ))}
            </ul>
          )}
          <Link to="/groups">Groups →</Link>
        </section>

        <section className="cao-panel card">
          <h3>Recent activities</h3>
          {data.recentActivities.length === 0 ? (
            <p className="muted">No recent activity</p>
          ) : (
            <ul className="cao-list">
              {data.recentActivities.map((a) => (
                <li key={`${a.type}-${a.id}`}>
                  New {a.type}: <strong>{a.title}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default ChurchAdminOverview;
