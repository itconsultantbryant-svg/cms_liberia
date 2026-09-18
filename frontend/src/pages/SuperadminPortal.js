import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import './Superadmin.css';

const STATUS_OPTIONS = ['active', 'suspended', 'archived'];
const SUB_STATUSES = ['trial', 'active', 'grace_period', 'past_due', 'suspended', 'cancelled'];

const SuperadminPortal = () => {
  const { user, enterSupportAccess } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('churches');
  const [supportReason, setSupportReason] = useState('');
  const [enteringSupport, setEnteringSupport] = useState(false);
  const [stats, setStats] = useState(null);
  const [churches, setChurches] = useState([]);
  const [plans, setPlans] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newChurch, setNewChurch] = useState({
    name: '',
    slug: '',
    email: '',
    adminEmail: '',
    adminPassword: '',
    adminName: ''
  });
  const [message, setMessage] = useState('');
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '' });
  const [subForm, setSubForm] = useState({ planId: '', status: 'active' });
  const [lockedFields, setLockedFields] = useState([]);
  const [backups, setBackups] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [catalogCurrencies, setCatalogCurrencies] = useState([]);
  const [currencyForm, setCurrencyForm] = useState({ code: '', name: '', symbol: '' });
  const [currencyBusy, setCurrencyBusy] = useState(false);

  const LOCKABLE = [
    { key: 'currency', label: 'Currency' },
    { key: 'timezone', label: 'Timezone' },
    { key: 'fiscal_year_start_month', label: 'Fiscal year start' },
    { key: 'membership_number_prefix', label: 'Membership prefix' },
    { key: 'receipt_number_prefix', label: 'Receipt prefix' },
    { key: 'name', label: 'Church name' }
  ];

  const loadCurrencies = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/superadmin/currencies');
      setCatalogCurrencies(data.currencies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load currencies');
    }
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (filter) params.q = filter;
      const [statsRes, listRes, plansRes] = await Promise.all([
        axios.get('/api/superadmin/stats'),
        axios.get('/api/superadmin/churches', { params }),
        axios.get('/api/superadmin/plans')
      ]);
      setStats(statsRes.data.stats);
      setChurches(listRes.data.churches || []);
      setPlans(plansRes.data.plans || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filter, statusFilter]);

  useEffect(() => {
    if (user?.isSuperadmin) {
      load();
    }
  }, [user, load]);

  if (!user?.isSuperadmin) {
    return <Navigate to="/" replace />;
  }

  const openDetail = async (id) => {
    setMessage('');
    try {
      const { data } = await axios.get(`/api/superadmin/churches/${id}`);
      setSelected(data);
      setSubForm({
        planId: data.subscription?.plan_id || data.church?.subscription_plan_id || '',
        status: data.subscription?.status || 'active'
      });
      try {
        const settingsRes = await axios.get(`/api/superadmin/churches/${id}/settings`);
        setLockedFields(settingsRes.data.settings?.lockedFields || []);
      } catch (_) {
        setLockedFields([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load church');
    }
  };

  const saveLockedFields = async () => {
    if (!selected?.church?.id) return;
    setMessage('');
    setError('');
    try {
      await axios.patch(`/api/superadmin/churches/${selected.church.id}/settings`, {
        lockedFields
      });
      setMessage('Locked fields updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save locked fields');
    }
  };

  const saveSubscription = async (e) => {
    e.preventDefault();
    if (!selected?.church?.id) return;
    setMessage('');
    setError('');
    try {
      await axios.put(`/api/superadmin/churches/${selected.church.id}/subscription`, {
        planId: Number(subForm.planId),
        status: subForm.status
      });
      setMessage('Subscription updated (church data preserved)');
      await openDetail(selected.church.id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Subscription update failed');
    }
  };

  const setSubStatus = async (status) => {
    if (!selected?.church?.id) return;
    setMessage('');
    try {
      await axios.patch(`/api/superadmin/churches/${selected.church.id}/subscription/status`, {
        status
      });
      setMessage(`Subscription → ${status}. Data was not deleted.`);
      await openDetail(selected.church.id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Status update failed');
    }
  };

  const startSupport = async (e) => {
    e.preventDefault();
    if (!selected?.church?.id) return;
    setError('');
    setMessage('');
    setEnteringSupport(true);
    try {
      await enterSupportAccess(selected.church.id, supportReason);
      setMessage('Support access started');
      navigate('/');
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to start support access');
    } finally {
      setEnteringSupport(false);
    }
  };

  const setStatus = async (id, status) => {
    setMessage('');
    try {
      await axios.patch(`/api/superadmin/churches/${id}/status`, { status });
      setMessage(`Church status updated to ${status}`);
      await load();
      if (selected?.church?.id === id) {
        await openDetail(id);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Status update failed');
    }
  };

  const createChurch = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!newChurch.adminEmail?.trim() || !newChurch.adminPassword) {
      setError('First admin email and password are required (this is the church login).');
      return;
    }
    if (newChurch.adminPassword.length < 8) {
      setError('Admin password must be at least 8 characters with upper, lower, and a digit.');
      return;
    }
    try {
      const payload = {
        ...newChurch,
        adminEmail: newChurch.adminEmail.trim().toLowerCase(),
        email: (newChurch.email || newChurch.adminEmail).trim().toLowerCase()
      };
      const { data } = await axios.post('/api/superadmin/churches', payload);
      const loginEmail = data.admin?.email || payload.adminEmail;
      setMessage(
        `${data.message || 'Church created'}. Church login: ${loginEmail} (password = the admin password you just set).`
      );
      setCreating(false);
      setNewChurch({
        name: '',
        slug: '',
        email: '',
        adminEmail: '',
        adminPassword: '',
        adminName: ''
      });
      await load();
      if (data.id) await openDetail(data.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  const loadBackups = async () => {
    try {
      const { data } = await axios.get('/api/superadmin/backups');
      setBackups(data.backups || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load backups');
    }
  };

  const runBackup = async (kind, churchId) => {
    setBackupBusy(true);
    setMessage('');
    setError('');
    try {
      const { data } = await axios.post('/api/superadmin/backups', {
        kind,
        ...(churchId ? { churchId } : {})
      });
      setMessage(data.message || 'Backup completed');
      await loadBackups();
    } catch (err) {
      setError(err.response?.data?.error || 'Backup failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const verifyBackup = async (id) => {
    setBackupBusy(true);
    setError('');
    try {
      const { data } = await axios.post(`/api/superadmin/backups/${id}/verify`);
      setMessage(data.message || 'Backup verified');
      await loadBackups();
    } catch (err) {
      setError(err.response?.data?.error || 'Verify failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const addAdmin = async (e) => {
    e.preventDefault();
    if (!selected?.church?.id) return;
    setMessage('');
    setError('');
    try {
      await axios.post(`/api/superadmin/churches/${selected.church.id}/admins`, adminForm);
      setMessage('Church Admin added');
      setAdminForm({ name: '', email: '', password: '' });
      await openDetail(selected.church.id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add admin');
    }
  };

  return (
    <Layout>
      <div className="superadmin-page">
        <div className="superadmin-header">
          <div>
            <h1>Superadmin Portal</h1>
            <p className="superadmin-sub">Tenants, subscription plans, and SaaS limits</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn ${tab === 'churches' ? 'btn-primary' : ''}`}
              onClick={() => setTab('churches')}
            >
              Churches
            </button>
            <button
              type="button"
              className={`btn ${tab === 'plans' ? 'btn-primary' : ''}`}
              onClick={() => setTab('plans')}
            >
              Plans
            </button>
            <button
              type="button"
              className={`btn ${tab === 'backups' ? 'btn-primary' : ''}`}
              onClick={() => {
                setTab('backups');
                loadBackups();
              }}
            >
              Backups
            </button>
            <button
              type="button"
              className={`btn ${tab === 'currencies' ? 'btn-primary' : ''}`}
              onClick={() => {
                setTab('currencies');
                loadCurrencies();
              }}
            >
              Currencies
            </button>
            {tab === 'churches' && (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(!creating)}>
                {creating ? 'Cancel' : 'New church'}
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {stats && (
          <div className="superadmin-stats">
            <div className="stat-tile"><span>Churches</span><strong>{stats.churches}</strong></div>
            <div className="stat-tile"><span>Active</span><strong>{stats.activeChurches}</strong></div>
            <div className="stat-tile"><span>Trial subs</span><strong>{stats.trialSubs ?? 0}</strong></div>
            <div className="stat-tile"><span>Active subs</span><strong>{stats.activeSubs ?? 0}</strong></div>
            <div className="stat-tile"><span>At risk</span><strong>{stats.atRiskSubs ?? 0}</strong></div>
            <div className="stat-tile"><span>Members</span><strong>{stats.members}</strong></div>
          </div>
        )}

        {tab === 'currencies' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Platform currencies</h3>
            <p className="muted">
              USD and LRD are system currencies and always available at every church. Add more codes for tenants to enable.
            </p>
            <table className="superadmin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Symbol</th>
                  <th>System</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {catalogCurrencies.map((c) => (
                  <tr key={c.code}>
                    <td>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.symbol || '—'}</td>
                    <td>{c.is_system ? 'Yes' : 'No'}</td>
                    <td>{c.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      {!c.is_system && c.is_active ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={currencyBusy}
                          onClick={async () => {
                            setCurrencyBusy(true);
                            try {
                              await axios.delete(`/api/superadmin/currencies/${c.code}`);
                              setMessage(`Deactivated ${c.code}`);
                              await loadCurrencies();
                            } catch (err) {
                              setError(err.response?.data?.error || 'Failed');
                            } finally {
                              setCurrencyBusy(false);
                            }
                          }}
                        >
                          Deactivate
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <input
                placeholder="Code (EUR)"
                value={currencyForm.code}
                onChange={(e) =>
                  setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })
                }
              />
              <input
                placeholder="Name"
                value={currencyForm.name}
                onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })}
              />
              <input
                placeholder="Symbol"
                value={currencyForm.symbol}
                onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={currencyBusy || !currencyForm.code}
                onClick={async () => {
                  setCurrencyBusy(true);
                  setError('');
                  try {
                    await axios.post('/api/superadmin/currencies', currencyForm);
                    setMessage(`Added ${currencyForm.code}`);
                    setCurrencyForm({ code: '', name: '', symbol: '' });
                    await loadCurrencies();
                  } catch (err) {
                    setError(err.response?.data?.error || 'Failed to add currency');
                  } finally {
                    setCurrencyBusy(false);
                  }
                }}
              >
                Add currency
              </button>
            </div>
          </div>
        )}

        {tab === 'backups' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3>Backup &amp; recovery</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Full platform snapshots and per-church exports. Verify is non-destructive.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={backupBusy}
                onClick={() => runBackup('full')}
              >
                {backupBusy ? 'Working…' : 'Run full backup'}
              </button>
            </div>
            <table className="superadmin-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Kind</th>
                  <th>Church</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.kind}</td>
                    <td>{b.church_id || '—'}</td>
                    <td>{b.status}</td>
                    <td>{b.size_bytes ? `${Math.round(b.size_bytes / 1024)} KB` : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={backupBusy || b.status === 'failed'}
                        onClick={() => verifyBackup(b.id)}
                      >
                        Verify
                      </button>
                    </td>
                  </tr>
                ))}
                {!backups.length && (
                  <tr>
                    <td colSpan={6} className="muted">No backups yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'plans' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Subscription plans</h3>
            <table className="superadmin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Price/mo</th>
                  <th>Members</th>
                  <th>Users</th>
                  <th>Branches</th>
                  <th>Features</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id}>
                    <td><code>{p.code}</code></td>
                    <td>{p.name}</td>
                    <td>{p.currency || 'USD'} {Number(p.price_monthly || 0).toFixed(2)}</td>
                    <td>{p.max_members == null ? '∞' : p.max_members}</td>
                    <td>{p.max_users == null ? '∞' : p.max_users}</td>
                    <td>{p.max_branches == null ? '∞' : p.max_branches}</td>
                    <td style={{ fontSize: 12 }}>
                      {[
                        p.feature_finance ? 'finance' : null,
                        p.feature_reporting ? 'reporting' : null,
                        p.feature_communications ? 'comms' : null,
                        p.feature_advanced ? 'advanced' : null
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'churches' && creating && (
          <form className="superadmin-create card" onSubmit={createChurch}>
            <h3>Create church tenant</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  value={newChurch.name}
                  onChange={(e) => setNewChurch({ ...newChurch, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Slug (optional)</label>
                <input
                  value={newChurch.slug}
                  onChange={(e) => setNewChurch({ ...newChurch, slug: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Email (optional)</label>
                <input
                  type="email"
                  value={newChurch.email}
                  onChange={(e) => setNewChurch({ ...newChurch, email: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>First admin name</label>
                <input
                  value={newChurch.adminName || ''}
                  onChange={(e) => setNewChurch({ ...newChurch, adminName: e.target.value })}
                  placeholder="HQ Admin"
                />
              </div>
              <div className="form-group">
                <label>First admin email *</label>
                <input
                  type="email"
                  value={newChurch.adminEmail || ''}
                  onChange={(e) => setNewChurch({ ...newChurch, adminEmail: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>First admin password *</label>
                <input
                  type="password"
                  value={newChurch.adminPassword || ''}
                  onChange={(e) => setNewChurch({ ...newChurch, adminPassword: e.target.value })}
                  minLength={8}
                  required
                  placeholder="Min 8 chars, upper + lower + digit"
                />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Required: this creates the church login account. Use this admin email/password on the login page (not the optional church contact email).
            </p>
            <button type="submit" className="btn btn-primary">Create</button>
          </form>
        )}

        {tab === 'churches' && (
        <div className="superadmin-filters">
          <input
            placeholder="Search name, slug, email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={load}>Refresh</button>
        </div>
        )}

        {tab === 'churches' && (loading ? (
          <p>Loading…</p>
        ) : (
          <div className="superadmin-layout">
            <div className="superadmin-table-wrap card">
              <table className="superadmin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Plan</th>
                    <th>Sub</th>
                    <th>Branches</th>
                    <th>Members</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {churches.map((c) => (
                    <tr key={c.id} className={selected?.church?.id === c.id ? 'selected' : ''}>
                      <td>{c.name}</td>
                      <td><code>{c.slug}</code></td>
                      <td><span className={`status-pill status-${c.status}`}>{c.status}</span></td>
                      <td>{c.plan_code || '—'}</td>
                      <td>{c.sub_status || c.subscription_status || '—'}</td>
                      <td>{c.branchCount}</td>
                      <td>{c.memberCount}</td>
                      <td>
                        <button type="button" className="btn-link" onClick={() => openDetail(c.id)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!churches.length && (
                    <tr><td colSpan={8}>No churches found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selected && (
              <div className="superadmin-detail card">
                <h3>{selected.church.name}</h3>
                <p className="muted">slug: {selected.church.slug}</p>
                <p>Email: {selected.church.email || '—'}</p>
                <p>Location: {[selected.church.city, selected.church.country].filter(Boolean).join(', ') || '—'}</p>
                <p>
                  Status:{' '}
                  <span className={`status-pill status-${selected.church.status}`}>
                    {selected.church.status}
                  </span>
                </p>
                <p>
                  Stats: {selected.stats.branchCount} branches · {selected.stats.memberCount} members ·{' '}
                  {selected.stats.subUserCount} sub-users
                </p>

                <h4>Subscription</h4>
                {selected.subscription ? (
                  <p className="muted">
                    {selected.subscription.plan_name} ({selected.subscription.plan_code}) ·{' '}
                    <strong>{selected.subscription.status}</strong>
                    {selected.limits?.usage && (
                      <>
                        <br />
                        Usage: {selected.limits.usage.members}/{selected.limits.limits?.max_members ?? '∞'} members ·{' '}
                        {selected.limits.usage.users}/{selected.limits.limits?.max_users ?? '∞'} users ·{' '}
                        {selected.limits.usage.branches}/{selected.limits.limits?.max_branches ?? '∞'} branches
                      </>
                    )}
                  </p>
                ) : (
                  <p className="muted">No subscription assigned</p>
                )}
                <form onSubmit={saveSubscription} className="form-row" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  <select
                    value={subForm.planId}
                    onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}
                    required
                  >
                    <option value="">Select plan</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                  <select
                    value={subForm.status}
                    onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
                  >
                    {SUB_STATUSES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-primary">Save plan</button>
                </form>
                <div className="status-actions" style={{ marginBottom: 12 }}>
                  {['grace_period', 'past_due', 'suspended', 'cancelled', 'active'].map(s => (
                    <button
                      key={s}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setSubStatus(s)}
                    >
                      Sub: {s}
                    </button>
                  ))}
                </div>

                <h4>Support access</h4>
                <p className="muted" style={{ fontSize: 13 }}>
                  Enter this church as Superadmin. Actions stay attributed to you — never disguised as a church admin.
                </p>
                <form onSubmit={startSupport} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                  <textarea
                    rows={2}
                    placeholder="Reason for support access (required)"
                    value={supportReason}
                    onChange={(e) => setSupportReason(e.target.value)}
                    required
                    minLength={5}
                  />
                  <button type="submit" className="btn btn-primary" disabled={enteringSupport}>
                    {enteringSupport ? 'Entering…' : 'Enter church as Superadmin'}
                  </button>
                </form>

                <h4>Lock church settings</h4>
                <p className="muted" style={{ fontSize: 13 }}>
                  Locked fields cannot be changed by Church Admins.
                </p>
                <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                  {LOCKABLE.map((f) => (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={lockedFields.includes(f.key)}
                        onChange={(e) => {
                          setLockedFields((prev) =>
                            e.target.checked
                              ? [...prev, f.key]
                              : prev.filter((k) => k !== f.key)
                          );
                        }}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary" onClick={saveLockedFields} style={{ marginBottom: 16 }}>
                  Save locks
                </button>

                <h4>Tenant backup</h4>
                <p className="muted" style={{ fontSize: 13 }}>
                  Export only this church’s data and files (no other tenants).
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={backupBusy}
                  onClick={() => runBackup('church', selected.church.id)}
                  style={{ marginBottom: 16 }}
                >
                  {backupBusy ? 'Working…' : 'Backup this church'}
                </button>

                <div className="status-actions">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="btn btn-secondary"
                      disabled={selected.church.status === s}
                      onClick={() => setStatus(selected.church.id, s)}
                    >
                      Mark {s}
                    </button>
                  ))}
                </div>

                <h4>Branches</h4>
                <ul className="branch-list">
                  {(selected.branches || []).map((b) => (
                    <li key={b.id}>
                      {b.branchname} ({b.email || 'no email'})
                      {b.isadmin ? ' · church admin' : ''}
                      {b.is_platform_admin ? ' · platform admin' : ''}
                    </li>
                  ))}
                  {!selected.branches?.length && <li>No branches</li>}
                </ul>

                <h4>Add Church Admin</h4>
                <form onSubmit={addAdmin} className="form-row" style={{ display: 'grid', gap: 8 }}>
                  <input
                    placeholder="Name"
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password (min 8)"
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    required
                    minLength={8}
                  />
                  <button type="submit" className="btn btn-primary">Add admin</button>
                </form>

                <button type="button" className="btn-link" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        ))}

        <p className="superadmin-foot">
          <Link to="/">Back to church dashboard</Link>
        </p>
      </div>
    </Layout>
  );
};

export default SuperadminPortal;
