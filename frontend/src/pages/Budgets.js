import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import CurrencySelect from '../components/CurrencySelect';
import './Members.css';

const Budgets = () => {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: `${new Date().getFullYear()} Operating Budget`,
    fiscalYear: new Date().getFullYear(),
    periodStart: `${new Date().getFullYear()}-01-01`,
    periodEnd: `${new Date().getFullYear()}-12-31`,
    currency: 'USD',
    churchWide: true
  });
  const [expenseLines, setExpenseLines] = useState([{ categoryId: '', amount: '', label: '' }]);
  const [incomeLines, setIncomeLines] = useState([{ categoryId: '', amount: '', label: '' }]);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([
        axios.get('/api/budgets'),
        axios.get('/api/finance/categories')
      ]);
      setBudgets(b.data.budgets || []);
      setCategories(c.data.categories || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const lines = [
        ...incomeLines
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({
            lineType: 'income',
            categoryId: l.categoryId || undefined,
            amount: Number(l.amount),
            label: l.label
          })),
        ...expenseLines
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({
            lineType: 'expense',
            categoryId: l.categoryId || undefined,
            amount: Number(l.amount),
            label: l.label
          }))
      ];
      await axios.post('/api/budgets', { ...form, lines });
      setMessage('Budget created as draft');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Create failed');
    }
  };

  const act = async (id, action) => {
    try {
      await axios.post(`/api/budgets/${id}/${action}`);
      setMessage(`Budget ${action}d`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || `${action} failed`);
    }
  };

  const incomeCats = categories.filter((c) => c.type === 'income');
  const expenseCats = categories.filter((c) => c.type === 'expense');

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Budgets</h1>
          <p className="members-sub">Draft → Submitted → Approved → Active → Closed</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={create}>
        <h2>New budget</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Fiscal year</label>
            <input
              type="number"
              value={form.fiscalYear}
              onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Period start</label>
            <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Period end</label>
            <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <CurrencySelect
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
        </div>

        <h3>Income lines</h3>
        {incomeLines.map((line, idx) => (
          <div key={`in-${idx}`} className="member-form-grid" style={{ marginBottom: 8 }}>
            <select
              value={line.categoryId}
              onChange={(e) => {
                const next = [...incomeLines];
                next[idx] = { ...next[idx], categoryId: e.target.value };
                setIncomeLines(next);
              }}
            >
              <option value="">Category…</option>
              {incomeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={line.amount}
              onChange={(e) => {
                const next = [...incomeLines];
                next[idx] = { ...next[idx], amount: e.target.value };
                setIncomeLines(next);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIncomeLines([...incomeLines, { categoryId: '', amount: '', label: '' }])}
        >
          + Income line
        </button>

        <h3 style={{ marginTop: 16 }}>Expense lines</h3>
        {expenseLines.map((line, idx) => (
          <div key={`ex-${idx}`} className="member-form-grid" style={{ marginBottom: 8 }}>
            <select
              value={line.categoryId}
              onChange={(e) => {
                const next = [...expenseLines];
                next[idx] = { ...next[idx], categoryId: e.target.value };
                setExpenseLines(next);
              }}
            >
              <option value="">Category…</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={line.amount}
              onChange={(e) => {
                const next = [...expenseLines];
                next[idx] = { ...next[idx], amount: e.target.value };
                setExpenseLines(next);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setExpenseLines([...expenseLines, { categoryId: '', amount: '', label: '' }])}
        >
          + Expense line
        </button>

        <div style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary">
            Create draft
          </button>
        </div>
      </form>

      <div className="card members-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Year</th>
              <th>Income</th>
              <th>Expense</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link to={`/budgets/${b.id}`}>{b.name}</Link>
                </td>
                <td>{b.fiscal_year}</td>
                <td>{Number(b.total_income || 0).toFixed(2)}</td>
                <td>{Number(b.total_expense || 0).toFixed(2)}</td>
                <td>
                  <span className={`member-status status-${b.status}`}>{b.status}</span>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {b.status === 'draft' && (
                    <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => act(b.id, 'submit')}>
                      Submit
                    </button>
                  )}
                  {b.status === 'submitted' && (
                    <>
                      <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => act(b.id, 'approve')}>
                        Approve
                      </button>
                      <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => act(b.id, 'reopen-draft')}>
                        Back to draft
                      </button>
                    </>
                  )}
                  {b.status === 'approved' && (
                    <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => act(b.id, 'activate')}>
                      Activate
                    </button>
                  )}
                  {(b.status === 'active' || b.status === 'approved') && (
                    <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => act(b.id, 'close')}>
                      Close
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!budgets.length && (
              <tr>
                <td colSpan={6}>No budgets yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Budgets;
