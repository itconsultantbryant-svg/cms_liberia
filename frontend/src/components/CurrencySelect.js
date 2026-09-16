import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Load church-enabled currencies (always includes USD + LRD).
 */
export function useChurchCurrencies() {
  const [currencies, setCurrencies] = useState([
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' }
  ]);
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/church/currencies');
      const list = data.currencies || [];
      setCurrencies(
        list.length
          ? list
          : [
              { code: 'USD', name: 'US Dollar', symbol: '$' },
              { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$' }
            ]
      );
      setDefaultCurrency(data.defaultCurrency || 'USD');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { currencies, defaultCurrency, loading, error, reload };
}

/**
 * Shared select for money fields. Uses church-enabled currencies.
 */
export default function CurrencySelect({
  value,
  onChange,
  name = 'currency',
  id,
  disabled = false,
  required = false,
  className,
  currencies: currenciesProp,
  defaultCurrency
}) {
  const hook = useChurchCurrencies();
  const currencies = currenciesProp || hook.currencies;
  const effectiveDefault = defaultCurrency || hook.defaultCurrency || 'USD';
  const current = value || effectiveDefault;

  useEffect(() => {
    if (!value && onChange && effectiveDefault) {
      onChange({ target: { name, value: effectiveDefault } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDefault]);

  return (
    <select
      id={id}
      name={name}
      className={className}
      value={current}
      disabled={disabled}
      required={required}
      onChange={onChange}
    >
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
          {c.name ? ` — ${c.name}` : ''}
          {c.symbol ? ` (${c.symbol})` : ''}
        </option>
      ))}
    </select>
  );
}
