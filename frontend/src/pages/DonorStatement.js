import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './Members.css';

const DonorStatement = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios
      .get(`/api/pledges/donors/${id}/statement`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || 'Not found'));
  }, [id]);

  if (error) return <div className="error-message">{error}</div>;
  if (!data) return <div>Loading…</div>;

  const { donor, summary, pledges, donations, payments, receipts } = data;

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>{donor.name}</h1>
          <p className="members-sub">
            {donor.donor_type}
            {donor.organization_name ? ` · ${donor.organization_name}` : ''}
          </p>
        </div>
        <div className="members-actions">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Print
          </button>
          <Link to="/pledges" className="btn btn-primary">
            Back
          </Link>
        </div>
      </div>

      <div className="card member-form-grid">
        <p><strong>Total donations:</strong> {Number(summary.totalDonations).toFixed(2)}</p>
        <p><strong>Pledge payments:</strong> {Number(summary.totalPledgePayments).toFixed(2)}</p>
        <p><strong>Outstanding pledges:</strong> {Number(summary.outstandingPledges).toFixed(2)}</p>
      </div>

      <div className="card">
        <h2>Pledges</h2>
        <ul>
          {pledges.map((p) => (
            <li key={p.id}>
              {p.title}: {Number(p.amount_paid).toFixed(2)} / {Number(p.amount).toFixed(2)} (bal{' '}
              {Number(p.balance).toFixed(2)}) — {p.status}
            </li>
          ))}
          {!pledges.length && <li>None</li>}
        </ul>
      </div>

      <div className="card">
        <h2>Donations</h2>
        <ul>
          {donations.map((d) => (
            <li key={d.id}>
              {d.donation_date}: {Number(d.amount).toFixed(2)} — {d.purpose || d.category}
            </li>
          ))}
          {!donations.length && <li>None</li>}
        </ul>
      </div>

      <div className="card">
        <h2>Payment history</h2>
        <ul>
          {payments.map((p) => (
            <li key={p.id}>
              {p.payment_date}: {Number(p.amount).toFixed(2)} toward {p.pledge_title}
            </li>
          ))}
          {!payments.length && <li>None</li>}
        </ul>
      </div>

      <div className="card">
        <h2>Receipts</h2>
        <ul>
          {receipts.map((r) => (
            <li key={r.id}>
              <Link to={`/pledges/receipts/${r.id}`}>{r.receipt_number}</Link> — {Number(r.amount).toFixed(2)}
            </li>
          ))}
          {!receipts.length && <li>None</li>}
        </ul>
      </div>
    </div>
  );
};

export default DonorStatement;
