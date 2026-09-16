import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Members.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'membership', label: 'Membership' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'finance', label: 'Finance' },
  { id: 'ministry', label: 'Ministry' }
];

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: 16, minWidth: 140, flex: '1 1 140px' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BreakdownTable({ title, rows, valueKey = 'count' }) {
  if (!rows?.length) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p className="members-sub">No data for this range.</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Label</th>
            <th style={{ textAlign: 'right' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <td>{r.label}</td>
              <td style={{ textAlign: 'right' }}>{r[valueKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Reports = () => {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const canExport =
    user?.isadmin ||
    perms.includes('reports.export') ||
    perms.includes('view_reports') ||
    perms.includes('reports.view');

  const [tab, setTab] = useState('overview');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios
      .get('/api/branches')
      .then(res => setBranches(res.data.branches || res.data || []))
      .catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { from, to };
      if (branchId) params.branchId = branchId;
      const res = await axios.get(`/api/analytics/${tab}`, { params });
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.error || err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    const type = tab === 'overview' ? 'membership' : tab;
    try {
      const params = new URLSearchParams({ from, to, format: 'csv' });
      if (branchId) params.set('branchId', branchId);
      const res = await axios.get(`/api/analytics/export/${type}?${params}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report-${from}-to-${to}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed');
    }
  };

  const printReport = () => window.print();

  return (
    <div className="members-page reports-page">
      <div className="members-header no-print">
        <div>
          <h1>Reports & Analytics</h1>
          <p className="members-sub">Membership, attendance, finance, and ministry dashboards</p>
        </div>
        <div className="members-actions">
          {canExport && (
            <button type="button" className="btn" onClick={exportCsv} disabled={tab === 'overview' ? false : !data}>
              Export Excel (CSV)
            </button>
          )}
          <button type="button" className="btn" onClick={printReport}>
            Print / PDF
          </button>
        </div>
      </div>

      <div className="members-filters no-print" style={{ marginBottom: 16 }}>
        <label>
          From{' '}
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label>
          To{' '}
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </label>
        <label>
          Branch{' '}
          <select value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.branchname || b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={load}>
          Apply
        </button>
      </div>

      <div className="members-actions no-print" style={{ marginBottom: 16, gap: 8 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`btn ${tab === t.id ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, color: '#a00' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="report-print-area">
          <p className="members-sub" style={{ marginBottom: 12 }}>
            {TABS.find(t => t.id === tab)?.label} · {from} → {to}
            {branchId ? ` · Branch #${branchId}` : ' · All branches'}
          </p>

          {tab === 'overview' && data && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Stat label="Members" value={data.membership?.total ?? 0} sub={`+${data.membership?.newMembers ?? 0} new (${data.membership?.growthPercent ?? 0}%)`} />
                <Stat label="Attendance headcount" value={data.attendance?.totalHeadcount ?? 0} sub={`${data.attendance?.sessions ?? 0} sessions`} />
                <Stat label="Income" value={money(data.finance?.income)} sub={`Net ${money(data.finance?.net)}`} />
                <Stat label="Ministries" value={data.ministry?.totalMinistries ?? 0} sub={`${data.ministry?.totalMembers ?? 0} members`} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Stat label="Tithes" value={money(data.finance?.tithes)} />
                <Stat label="Offerings" value={money(data.finance?.offerings)} />
                <Stat label="Expenses" value={money(data.finance?.expense)} />
              </div>
            </>
          )}

          {tab === 'membership' && data && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Stat label="Total members" value={data.total} />
                <Stat label="New in period" value={data.newMembers} sub={`Prev period ${data.previousPeriodNew}`} />
                <Stat label="Growth" value={`${data.growthPercent}%`} />
              </div>
              <BreakdownTable title="By status" rows={data.byStatus} />
              <BreakdownTable title="By gender" rows={data.byGender} />
              <BreakdownTable title="By age group" rows={data.byAgeGroup} />
              <BreakdownTable title="By branch" rows={data.byBranch} />
            </>
          )}

          {tab === 'attendance' && data && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Stat label="Total headcount" value={data.totalHeadcount} />
                <Stat label="Sessions" value={data.sessions} />
              </div>
              <BreakdownTable title="By branch" rows={data.byBranch} valueKey="total" />
              <BreakdownTable title="By service" rows={data.byService} valueKey="total" />
              <BreakdownTable title="Monthly totals" rows={data.monthly} valueKey="total" />
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Recent sessions</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Branch</th>
                      <th>Service</th>
                      <th>Male</th>
                      <th>Female</th>
                      <th>Children</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recent || []).map((r, i) => (
                      <tr key={i}>
                        <td>{String(r.date).slice(0, 10)}</td>
                        <td>{r.branchname || '-'}</td>
                        <td>{r.service_name || '-'}</td>
                        <td>{r.male}</td>
                        <td>{r.female}</td>
                        <td>{r.children}</td>
                        <td>{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'finance' && data && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Stat label="Income" value={money(data.income)} />
                <Stat label="Expense" value={money(data.expense)} />
                <Stat label="Net" value={money(data.net)} />
                <Stat label="Tithes" value={money(data.tithes)} />
                <Stat label="Offerings" value={money(data.offerings)} />
                <Stat label="Donations" value={money(data.donations)} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Stat label="Pledged" value={money(data.pledges?.pledged)} />
                <Stat label="Pledge received" value={money(data.pledges?.received)} />
                <Stat label="Outstanding" value={money(data.pledges?.outstanding)} />
                {data.budget && (
                  <Stat
                    label="Active budget"
                    value={data.budget.name}
                    sub={`FY ${data.budget.fiscal_year}`}
                  />
                )}
              </div>
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>By category</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Code</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.byCategory || []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.type}</td>
                        <td>{r.code}</td>
                        <td>{r.label}</td>
                        <td style={{ textAlign: 'right' }}>{money(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Cash flow</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th style={{ textAlign: 'right' }}>Income</th>
                      <th style={{ textAlign: 'right' }}>Expense</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.cashFlow || []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.month}</td>
                        <td style={{ textAlign: 'right' }}>{money(r.income)}</td>
                        <td style={{ textAlign: 'right' }}>{money(r.expense)}</td>
                        <td style={{ textAlign: 'right' }}>{money(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'ministry' && data && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Stat label="Ministries" value={data.totalMinistries} />
                <Stat label="Members enrolled" value={data.totalMembers} />
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Ministry performance</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Branch</th>
                      <th>Members</th>
                      <th>Meetings</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.ministries || []).map(m => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.category || '-'}</td>
                        <td>{m.branchname || '-'}</td>
                        <td>{m.member_count}</td>
                        <td>{m.meeting_count}</td>
                        <td>{m.attendance_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sidebar, nav, .layout-sidebar, header { display: none !important; }
          .reports-page { max-width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default Reports;
