import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import CurrencySelect from '../components/CurrencySelect';
import './Members.css';

const PledgesDonations = () => {
  const [tab, setTab] = useState('pledges');
  const [pledges, setPledges] = useState([]);
  const [outstanding, setOutstanding] = useState({ total: 0, count: 0 });
  const [donations, setDonations] = useState([]);
  const [donors, setDonors] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pledgeForm, setPledgeForm] = useState({
    donorName: '',
    title: 'Building pledge',
    amount: '',
    currency: 'USD',
    frequency: 'monthly',
    startDate: new Date().toISOString().slice(0, 10)
  });
  const [donationForm, setDonationForm] = useState({
    donorName: '',
    amount: '',
    currency: 'USD',
    isAnonymous: false,
    paymentMethod: 'cash',
    donationDate: new Date().toISOString().slice(0, 10),
    purpose: ''
  });
  const [payForm, setPayForm] = useState({ pledgeId: '', amount: '', currency: 'USD', paymentMethod: 'cash' });
  const [donorForm, setDonorForm] = useState({ name: '', donorType: 'individual', email: '', organizationName: '' });

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, d, don, r] = await Promise.all([
        axios.get('/api/pledges/pledges'),
        axios.get('/api/pledges/donations'),
        axios.get('/api/pledges/donors'),
        axios.get('/api/pledges/receipts')
      ]);
      setPledges(p.data.pledges || []);
      setOutstanding(p.data.outstanding || { total: 0, count: 0 });
      setDonations(d.data.donations || []);
      setDonors(don.data.donors || []);
      setReceipts(r.data.receipts || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createPledge = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/pledges/pledges', {
        ...pledgeForm,
        amount: Number(pledgeForm.amount)
      });
      setMessage('Pledge created');
      setPledgeForm({ ...pledgeForm, amount: '', donorName: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`/api/pledges/pledges/${payForm.pledgeId}/payments`, {
        amount: Number(payForm.amount),
        currency: payForm.currency,
        paymentMethod: payForm.paymentMethod
      });
      setMessage(`Payment recorded — receipt ${res.data.receipt?.receipt_number}`);
      setPayForm({ pledgeId: '', amount: '', currency: payForm.currency || 'USD', paymentMethod: 'cash' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed');
    }
  };

  const createDonation = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/pledges/donations', {
        ...donationForm,
        amount: Number(donationForm.amount)
      });
      setMessage(`Donation recorded — receipt ${res.data.receipt?.receipt_number}`);
      setDonationForm({ ...donationForm, amount: '', donorName: '', purpose: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Donation failed');
    }
  };

  const createDonor = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/pledges/donors', donorForm);
      setMessage('Donor saved');
      setDonorForm({ name: '', donorType: 'individual', email: '', organizationName: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Donor failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Pledges &amp; Donations</h1>
          <p className="members-sub">
            Outstanding pledges: {Number(outstanding.total || 0).toFixed(2)} ({outstanding.count || 0} active)
          </p>
        </div>
      </div>

      <div className="members-bulk">
        {['pledges', 'donations', 'donors', 'receipts'].map((t) => (
          <button
            key={t}
            type="button"
            className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {tab === 'pledges' && (
        <>
          <form className="card" onSubmit={createPledge}>
            <h2>Create pledge</h2>
            <div className="member-form-grid">
              <div className="form-group">
                <label>Donor name</label>
                <input required value={pledgeForm.donorName} onChange={(e) => setPledgeForm({ ...pledgeForm, donorName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Title</label>
                <input value={pledgeForm.title} onChange={(e) => setPledgeForm({ ...pledgeForm, title: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" required value={pledgeForm.amount} onChange={(e) => setPledgeForm({ ...pledgeForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <CurrencySelect
                  value={pledgeForm.currency}
                  onChange={(e) => setPledgeForm({ ...pledgeForm, currency: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Frequency</label>
                <select value={pledgeForm.frequency} onChange={(e) => setPledgeForm({ ...pledgeForm, frequency: e.target.value })}>
                  <option value="one_time">One time</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
              Create
            </button>
          </form>

          <form className="card" onSubmit={recordPayment}>
            <h2>Record pledge payment</h2>
            <div className="member-form-grid">
              <div className="form-group">
                <label>Pledge</label>
                <select required value={payForm.pledgeId} onChange={(e) => setPayForm({ ...payForm, pledgeId: e.target.value })}>
                  <option value="">Select…</option>
                  {pledges
                    .filter((p) => p.status === 'active')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id} {p.donor_name || p.donor_record_name} — bal {Number(p.balance).toFixed(2)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <CurrencySelect
                  value={payForm.currency}
                  onChange={(e) => setPayForm({ ...payForm, currency: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Method</label>
                <select value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="check">Check</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
              Record payment
            </button>
          </form>

          <div className="card members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Title</th>
                  <th>Pledged</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pledges.map((p) => (
                  <tr key={p.id}>
                    <td>{p.donor_name || p.donor_record_name || '—'}</td>
                    <td>{p.title}</td>
                    <td>{Number(p.amount).toFixed(2)}</td>
                    <td>{Number(p.amount_paid || 0).toFixed(2)}</td>
                    <td>{Number(p.balance || 0).toFixed(2)}</td>
                    <td>
                      <span className={`member-status status-${p.status}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'donations' && (
        <>
          <form className="card" onSubmit={createDonation}>
            <h2>Record donation</h2>
            <div className="member-form-grid">
              <div className="form-group">
                <label>Donor name</label>
                <input
                  disabled={donationForm.isAnonymous}
                  value={donationForm.donorName}
                  onChange={(e) => setDonationForm({ ...donationForm, donorName: e.target.value })}
                  required={!donationForm.isAnonymous}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={donationForm.isAnonymous}
                    onChange={(e) =>
                      setDonationForm({ ...donationForm, isAnonymous: e.target.checked, donorName: e.target.checked ? '' : donationForm.donorName })
                    }
                  />{' '}
                  Anonymous
                </label>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" required value={donationForm.amount} onChange={(e) => setDonationForm({ ...donationForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <CurrencySelect
                  value={donationForm.currency}
                  onChange={(e) => setDonationForm({ ...donationForm, currency: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Purpose</label>
                <input value={donationForm.purpose} onChange={(e) => setDonationForm({ ...donationForm, purpose: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
              Save donation
            </button>
          </form>
          <div className="card members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d.id}>
                    <td>{d.donation_date}</td>
                    <td>{d.is_anonymous ? 'Anonymous' : d.donor_name || '—'}</td>
                    <td>
                      {d.currency} {Number(d.amount).toFixed(2)}
                    </td>
                    <td>{d.purpose || d.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'donors' && (
        <>
          <form className="card" onSubmit={createDonor}>
            <h2>Add donor</h2>
            <div className="member-form-grid">
              <div className="form-group">
                <label>Type</label>
                <select value={donorForm.donorType} onChange={(e) => setDonorForm({ ...donorForm, donorType: e.target.value })}>
                  <option value="individual">Individual</option>
                  <option value="organization">Organization</option>
                </select>
              </div>
              <div className="form-group">
                <label>Name</label>
                <input required value={donorForm.name} onChange={(e) => setDonorForm({ ...donorForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={donorForm.email} onChange={(e) => setDonorForm({ ...donorForm, email: e.target.value })} />
              </div>
              {donorForm.donorType === 'organization' && (
                <div className="form-group">
                  <label>Organization</label>
                  <input value={donorForm.organizationName} onChange={(e) => setDonorForm({ ...donorForm, organizationName: e.target.value })} />
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>
              Save donor
            </button>
          </form>
          <div className="card members-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.donor_type}</td>
                    <td>{d.email || '—'}</td>
                    <td>
                      <Link to={`/pledges/donors/${d.id}`}>Statement</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'receipts' && (
        <div className="card members-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Type</th>
                <th>Donor</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.receipt_number}</code>
                  </td>
                  <td>{r.receipt_date}</td>
                  <td>{r.receipt_type}</td>
                  <td>{r.is_anonymous ? 'Anonymous' : r.donor_name || '—'}</td>
                  <td>
                    {r.currency} {Number(r.amount).toFixed(2)}
                  </td>
                  <td>
                    <Link to={`/pledges/receipts/${r.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PledgesDonations;
