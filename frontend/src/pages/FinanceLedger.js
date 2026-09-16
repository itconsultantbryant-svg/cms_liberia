import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Members.css';

const FinanceLedger = () => {
  const [tab, setTab] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [funds, setFunds] = useState([]);
  const [meta, setMeta] = useState({ paymentMethods: [], statuses: [] });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState({ type: '', status: '' });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    txnType: 'income',
    categoryId: '',
    amount: '',
    currency: 'USD',
    paymentMethod: 'cash',
    referenceNumber: '',
    txnDate: new Date().toISOString().slice(0, 10),
    donorName: '',
    description: '',
    status: 'draft'
  });

  const loadMeta = useCallback(async () => {
    const [m, c, f] = await Promise.all([
      axios.get('/api/finance/meta'),
      axios.get('/api/finance/categories'),
      axios.get('/api/finance/funds')
    ]);
    setMeta(m.data);
    setCategories(c.data.categories || []);
    setFunds(f.data.funds || []);
    if (m.data?.defaultCurrency) {
      setForm((f) => ({ ...f, currency: f.currency || m.data.defaultCurrency }));
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    const res = await axios.get('/api/finance/dashboard');
    setSummary(res.data);
  }, []);

  const loadTxns = useCallback(async () => {
    const res = await axios.get('/api/finance/transactions', {
      params: {
        type: filter.type || undefined,
        status: filter.status || undefined,
        limit: 50
      }
    });
    setTransactions(res.data.transactions || []);
  }, [filter]);

  useEffect(() => {
    loadMeta().catch((e) => setError(e.response?.data?.error || e.message));
  }, [loadMeta]);

  useEffect(() => {
    setError('');
    if (tab === 'dashboard') {
      loadDashboard().catch((e) => setError(e.response?.data?.error || e.message));
    } else {
      loadTxns().catch((e) => setError(e.response?.data?.error || e.message));
    }
  }, [tab, loadDashboard, loadTxns]);

  const create = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      await axios.post('/api/finance/transactions', {
        ...form,
        categoryId: form.categoryId || undefined,
        amount: Number(form.amount)
      });
      setMessage('Transaction created');
      setForm({ ...form, amount: '', description: '', referenceNumber: '', donorName: '' });
      setTab('ledger');
      loadTxns();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const post = async (id) => {
    try {
      await axios.post(`/api/finance/transactions/${id}/post`);
      setMessage('Posted');
      loadTxns();
      loadDashboard();
    } catch (err) {
      setError(err.response?.data?.error || 'Post failed');
    }
  };

  const reverse = async (id) => {
    const reason = window.prompt('Reason for reversal?');
    if (!reason) return;
    try {
      await axios.post(`/api/finance/transactions/${id}/reverse`, { reason });
      setMessage('Reversed');
      loadTxns();
      loadDashboard();
    } catch (err) {
      setError(err.response?.data?.error || 'Reverse failed');
    }
  };

  const incomeCats = categories.filter((c) => c.type === 'income');
  const expenseCats = categories.filter((c) => c.type === 'expense');
  const catOptions = form.txnType === 'expense' ? expenseCats : incomeCats;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Finance Ledger</h1>
          <p className="members-sub">Income, expenses, posting &amp; reversals (no silent edits)</p>
        </div>
      </div>

      <div className="members-bulk">
        {['dashboard', 'ledger', 'new'].map((t) => (
          <button
            key={t}
            type="button"
            className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t === 'dashboard' ? 'Dashboard' : t === 'ledger' ? 'Transactions' : 'New entry'}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {tab === 'dashboard' && summary && (
        <div className="card">
          <h2>Year {summary.year}</h2>
          <div className="member-form-grid">
            <p><strong>Income:</strong> {Number(summary.income).toFixed(2)}</p>
            <p><strong>Expenses:</strong> {Number(summary.expenses).toFixed(2)}</p>
            <p><strong>Net position:</strong> {Number(summary.net).toFixed(2)}</p>
            <p><strong>Pending entries:</strong> {summary.pendingCount}</p>
            <p><strong>Outstanding pledges:</strong> {Number(summary.outstandingPledges?.total || 0).toFixed(2)} ({summary.outstandingPledges?.count || 0})</p>
            <p>
              <strong>Budget performance:</strong>{' '}
              {summary.budgetPerformance?.budgetName
                ? `${summary.budgetPerformance.budgetName} — budgeted ${Number(summary.budgetPerformance.budgeted).toFixed(2)}, actual ${Number(summary.budgetPerformance.actual).toFixed(2)}, variance ${Number(summary.budgetPerformance.variance).toFixed(2)}`
                : 'No active budget'}
            </p>
          </div>
          <h3>Monthly</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {(summary.byMonth || []).map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{Number(m.income).toFixed(2)}</td>
                  <td>{Number(m.expenses).toFixed(2)}</td>
                  <td>{(Number(m.income) - Number(m.expenses)).toFixed(2)}</td>
                </tr>
              ))}
              {!summary.byMonth?.length && (
                <tr>
                  <td colSpan={4}>No posted transactions yet</td>
                </tr>
              )}
            </tbody>
          </table>
          <h3>Donation trends</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(summary.donationTrends || []).map((d) => (
                <tr key={d.month}>
                  <td>{d.month}</td>
                  <td>{Number(d.total).toFixed(2)}</td>
                </tr>
              ))}
              {!summary.donationTrends?.length && (
                <tr>
                  <td colSpan={2}>No donation/tithe/offering posts yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="card members-table-wrap">
          <div className="members-filters">
            <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">All statuses</option>
              {(meta.statuses || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={loadTxns}>
              Apply
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.txn_date}</td>
                  <td>{t.txn_type}</td>
                  <td>{t.category_name || '—'}</td>
                  <td>
                    {t.currency} {Number(t.amount).toFixed(2)}
                  </td>
                  <td>{t.payment_method}</td>
                  <td>
                    <span className={`member-status status-${t.status}`}>{t.status}</span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {(t.status === 'draft' || t.status === 'pending') && (
                      <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => post(t.id)}>
                        Post
                      </button>
                    )}
                    {t.status === 'posted' && !t.reversal_of_id && (
                      <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => reverse(t.id)}>
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!transactions.length && (
                <tr>
                  <td colSpan={7}>No transactions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'new' && (
        <form className="card" onSubmit={create}>
          <h2>New transaction</h2>
          <div className="member-form-grid">
            <div className="form-group">
              <label>Type</label>
              <select value={form.txnType} onChange={(e) => setForm({ ...form, txnType: e.target.value, categoryId: '' })}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select…</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {(meta.currencies || [{ code: 'USD' }, { code: 'LRD' }]).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}{c.name ? ` — ${c.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Payment method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                {(meta.paymentMethods || []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" required value={form.txnDate} onChange={(e) => setForm({ ...form, txnDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Reference #</label>
              <input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Donor / payee</label>
              <input value={form.donorName} onChange={(e) => setForm({ ...form, donorName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Fund</label>
              <select
                value={form.fundId || ''}
                onChange={(e) => setForm({ ...form, fundId: e.target.value })}
              >
                <option value="">Default</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group full">
              <label>Description</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </form>
      )}
    </div>
  );
};

export default FinanceLedger;
