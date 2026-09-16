import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import CurrencySelect, { useChurchCurrencies } from '../components/CurrencySelect';
import './ChurchBranding.css';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const emptyForm = {
  name: '',
  shortName: '',
  email: '',
  phone: '',
  country: '',
  city: '',
  address: '',
  websiteUrl: '',
  currency: 'USD',
  timezone: 'Africa/Monrovia',
  fiscalYearStartMonth: 1,
  dateFormat: 'YYYY-MM-DD',
  membershipNumberPrefix: 'M',
  membershipNumberPadding: 5,
  membershipNumberNext: 1,
  receiptNumberPrefix: 'RCP',
  receiptNumberIncludeYear: true,
  receiptNumberPadding: 5,
  receiptNumberNext: 1,
  notifyBirthdays: true,
  notifyEvents: true,
  notifyApprovals: true,
  notifyMembership: true
};

const ChurchSettings = () => {
  const [form, setForm] = useState(emptyForm);
  const [locked, setLocked] = useState([]);
  const [dateFormats, setDateFormats] = useState(['YYYY-MM-DD']);
  const [links, setLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { currencies, reload: reloadCurrencies } = useChurchCurrencies();
  const [newCurrency, setNewCurrency] = useState({ code: '', name: '', symbol: '' });
  const [currencyMsg, setCurrencyMsg] = useState('');
  const [currencyErr, setCurrencyErr] = useState('');
  const [currencyBusy, setCurrencyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get('/api/church/settings');
        if (cancelled) return;
        const c = data.church || {};
        const s = data.settings || {};
        setForm({
          name: c.name || '',
          shortName: c.shortName || '',
          email: c.email || '',
          phone: c.phone || '',
          country: c.country || '',
          city: c.city || '',
          address: c.address || '',
          websiteUrl: c.websiteUrl || '',
          currency: c.currency || 'USD',
          timezone: c.timezone || 'Africa/Monrovia',
          fiscalYearStartMonth: s.fiscalYearStartMonth || 1,
          dateFormat: s.dateFormat || 'YYYY-MM-DD',
          membershipNumberPrefix: s.membershipNumberPrefix || 'M',
          membershipNumberPadding: s.membershipNumberPadding || 5,
          membershipNumberNext: s.membershipNumberNext || 1,
          receiptNumberPrefix: s.receiptNumberPrefix || 'RCP',
          receiptNumberIncludeYear: s.receiptNumberIncludeYear !== false,
          receiptNumberPadding: s.receiptNumberPadding || 5,
          receiptNumberNext: s.receiptNumberNext || 1,
          notifyBirthdays: s.notifyBirthdays !== false,
          notifyEvents: s.notifyEvents !== false,
          notifyApprovals: s.notifyApprovals !== false,
          notifyMembership: s.notifyMembership !== false
        });
        setLocked(s.lockedFields || []);
        setDateFormats(data.meta?.dateFormats || ['YYYY-MM-DD']);
        setLinks(data.meta?.links || {});
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLocked = (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    return list.some((k) => locked.includes(k));
  };

  const onChange = (key) => (e) => {
    const target = e.target;
    const value =
      target.type === 'checkbox'
        ? target.checked
        : target.type === 'number'
          ? Number(target.value)
          : target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await axios.patch('/api/church/settings', form);
      setMessage(data.message || 'Settings saved');
      if (data.settings?.lockedFields) setLocked(data.settings.lockedFields);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="branding-page"><p>Loading settings…</p></div>;

  return (
    <div className="branding-page">
      <h1>Church Settings</h1>
      <p className="branding-sub">
        Profile, fiscal year, numbering, locale, and notification preferences for this church.
      </p>

      {locked.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          Some fields are locked by the platform Superadmin and cannot be changed.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="branding-uploads" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Related</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Link className="btn btn-secondary" to={links.branding || '/settings/branding'}>Branding</Link>
          <Link className="btn btn-secondary" to={links.branches || '/branches'}>Branches</Link>
          <Link className="btn btn-secondary" to={links.workflows || '/workflows'}>Approval workflows</Link>
          <Link className="btn btn-secondary" to={links.admins || '/settings/admins'}>Church admins</Link>
        </div>
      </div>

      <form className="branding-form" onSubmit={save}>
        <h3>Church profile</h3>
        <div className="form-row">
          <label>
            Name
            <input value={form.name} onChange={onChange('name')} disabled={isLocked('name')} required />
          </label>
          <label>
            Short name
            <input value={form.shortName} onChange={onChange('shortName')} disabled={isLocked('short_name')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Email
            <input type="email" value={form.email} onChange={onChange('email')} disabled={isLocked('email')} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={onChange('phone')} disabled={isLocked('phone')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Country
            <input value={form.country} onChange={onChange('country')} disabled={isLocked('country')} />
          </label>
          <label>
            City
            <input value={form.city} onChange={onChange('city')} disabled={isLocked('city')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Address
            <input value={form.address} onChange={onChange('address')} disabled={isLocked('address')} />
          </label>
          <label>
            Website
            <input value={form.websiteUrl} onChange={onChange('websiteUrl')} disabled={isLocked('website_url')} />
          </label>
        </div>

        <h3>Locale &amp; fiscal year</h3>
        <div className="form-row">
          <label>
            Default currency
            <CurrencySelect
              value={form.currency}
              onChange={onChange('currency')}
              disabled={isLocked('currency')}
              currencies={currencies}
            />
          </label>
          <label>
            Timezone
            <input value={form.timezone} onChange={onChange('timezone')} disabled={isLocked('timezone')} />
          </label>
        </div>

        <h3>Enabled currencies</h3>
        <p className="muted">USD and LRD are always available. Add more currencies for finance, pledges, budgets, and payroll.</p>
        {currencyErr && <div className="error-message">{currencyErr}</div>}
        {currencyMsg && <div className="success-message">{currencyMsg}</div>}
        <ul style={{ marginBottom: 12 }}>
          {currencies.map((c) => (
            <li key={c.code}>
              <strong>{c.code}</strong>
              {c.name ? ` — ${c.name}` : ''}
              {c.is_default || c.is_default === 1 ? ' (default)' : ''}
              {c.is_system || c.code === 'USD' || c.code === 'LRD'
                ? null
                : (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginLeft: 8 }}
                    disabled={currencyBusy}
                    onClick={async () => {
                      setCurrencyBusy(true);
                      setCurrencyErr('');
                      try {
                        await axios.delete(`/api/church/currencies/${c.code}`);
                        setCurrencyMsg(`Disabled ${c.code}`);
                        await reloadCurrencies();
                      } catch (e) {
                        setCurrencyErr(e.response?.data?.error || e.message);
                      } finally {
                        setCurrencyBusy(false);
                      }
                    }}
                  >
                    Disable
                  </button>
                )}
            </li>
          ))}
        </ul>
        <div className="form-row">
          <label>
            Code
            <input
              value={newCurrency.code}
              placeholder="EUR"
              maxLength={8}
              onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
            />
          </label>
          <label>
            Name
            <input
              value={newCurrency.name}
              placeholder="Euro"
              onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
            />
          </label>
          <label>
            Symbol
            <input
              value={newCurrency.symbol}
              placeholder="€"
              onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn"
          disabled={currencyBusy || !newCurrency.code}
          onClick={async () => {
            setCurrencyBusy(true);
            setCurrencyErr('');
            setCurrencyMsg('');
            try {
              await axios.post('/api/church/currencies', newCurrency);
              setCurrencyMsg(`Added ${newCurrency.code}`);
              setNewCurrency({ code: '', name: '', symbol: '' });
              await reloadCurrencies();
            } catch (e) {
              setCurrencyErr(e.response?.data?.error || e.message);
            } finally {
              setCurrencyBusy(false);
            }
          }}
        >
          Add currency
        </button>

        <div className="form-row" style={{ marginTop: 16 }}>
          <label>
            Fiscal year starts
            <select
              value={form.fiscalYearStartMonth}
              onChange={onChange('fiscalYearStartMonth')}
              disabled={isLocked('fiscal_year_start_month')}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label>
            Date format
            <select
              value={form.dateFormat}
              onChange={onChange('dateFormat')}
              disabled={isLocked('date_format')}
            >
              {dateFormats.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>

        <h3>Membership numbering</h3>
        <div className="form-row">
          <label>
            Prefix
            <input
              value={form.membershipNumberPrefix}
              onChange={onChange('membershipNumberPrefix')}
              disabled={isLocked('membership_number_prefix')}
            />
          </label>
          <label>
            Padding
            <input
              type="number"
              min={1}
              max={12}
              value={form.membershipNumberPadding}
              onChange={onChange('membershipNumberPadding')}
              disabled={isLocked('membership_number_padding')}
            />
          </label>
          <label>
            Next number
            <input
              type="number"
              min={1}
              value={form.membershipNumberNext}
              onChange={onChange('membershipNumberNext')}
              disabled={isLocked('membership_number_next')}
            />
          </label>
        </div>
        <p className="branding-sub" style={{ marginTop: -8 }}>
          Preview: {form.membershipNumberPrefix}
          {String(form.membershipNumberNext).padStart(Number(form.membershipNumberPadding) || 5, '0')}
        </p>

        <h3>Receipt numbering</h3>
        <div className="form-row">
          <label>
            Prefix
            <input
              value={form.receiptNumberPrefix}
              onChange={onChange('receiptNumberPrefix')}
              disabled={isLocked('receipt_number_prefix')}
            />
          </label>
          <label>
            Padding
            <input
              type="number"
              min={1}
              max={12}
              value={form.receiptNumberPadding}
              onChange={onChange('receiptNumberPadding')}
              disabled={isLocked('receipt_number_padding')}
            />
          </label>
          <label>
            Next number
            <input
              type="number"
              min={1}
              value={form.receiptNumberNext}
              onChange={onChange('receiptNumberNext')}
              disabled={isLocked('receipt_number_next')}
            />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={form.receiptNumberIncludeYear}
            onChange={onChange('receiptNumberIncludeYear')}
            disabled={isLocked('receipt_number_include_year')}
          />
          Include year in receipt numbers
        </label>

        <h3>Notification preferences</h3>
        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {[
            ['notifyBirthdays', 'notify_birthdays', 'Birthday reminders'],
            ['notifyEvents', 'notify_events', 'Event reminders'],
            ['notifyApprovals', 'notify_approvals', 'Approval requests'],
            ['notifyMembership', 'notify_membership', 'Membership changes']
          ].map(([key, lockKey, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form[key]}
                onChange={onChange(key)}
                disabled={isLocked(lockKey)}
              />
              {label}
            </label>
          ))}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  );
};

export default ChurchSettings;
