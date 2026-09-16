import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const BudgetDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    axios
      .get(`/api/budgets/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || 'Not found'));
  };

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="error-message">{error}</div>;
  if (!data) return <div>Loading…</div>;

  const { budget, lines, variance } = data;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>{budget.name}</h1>
          <p className="members-sub">
            FY {budget.fiscal_year} · {budget.period_start} → {budget.period_end} ·{' '}
            <span className={`member-status status-${budget.status}`}>{budget.status}</span>
          </p>
        </div>
        <Link to="/budgets" className="btn btn-secondary">
          Back
        </Link>
      </div>

      <div className="card member-form-grid">
        <p><strong>Budgeted income:</strong> {Number(budget.total_income || 0).toFixed(2)}</p>
        <p><strong>Budgeted expense:</strong> {Number(budget.total_expense || 0).toFixed(2)}</p>
      </div>

      <div className="card members-table-wrap">
        <h2>Lines</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.line_type}</td>
                <td>{l.category_name || l.label || '—'}</td>
                <td>{Number(l.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {variance && (
        <div className="card members-table-wrap">
          <h2>Budget vs Actual</h2>
          <div className="member-form-grid" style={{ marginBottom: 12 }}>
            <p>
              <strong>Income variance:</strong> {Number(variance.totals.incomeVariance).toFixed(2)}
            </p>
            <p>
              <strong>Expense variance (favorable +):</strong>{' '}
              {Number(variance.totals.expenseVariance).toFixed(2)}
            </p>
            <p>
              <strong>Net budgeted:</strong> {Number(variance.totals.netBudgeted).toFixed(2)}
            </p>
            <p>
              <strong>Net actual:</strong> {Number(variance.totals.netActual).toFixed(2)}
            </p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Budgeted</th>
                <th>Actual</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {variance.lines.map((r) => (
                <tr key={r.lineId}>
                  <td>{r.categoryName}</td>
                  <td>{r.lineType}</td>
                  <td>{r.budgeted.toFixed(2)}</td>
                  <td>{r.actual.toFixed(2)}</td>
                  <td>{r.variance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BudgetDetail;
