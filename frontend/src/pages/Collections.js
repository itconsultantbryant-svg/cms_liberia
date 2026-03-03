import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Collections = () => {
  const { user } = useAuth();
  const [collections, setCollections] = useState([]);
  const [collectionTypes, setCollectionTypes] = useState([]);
  const [services, setServices] = useState([]);
  const [formData, setFormData] = useState({
    date_collected: new Date().toISOString().split('T')[0],
    type: '',
  });
  const [amounts, setAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [offeringRes, historyRes] = await Promise.all([
        axios.get('/api/collections/offering'),
        axios.get('/api/collections/history?branch=true'),
      ]);

      setCollectionTypes(offeringRes.data.collections);
      setServices(offeringRes.data.services);
      setCollections(historyRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (typeName, value) => {
    setAmounts({ ...amounts, [typeName]: parseFloat(value) || 0 });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      const data = {
        ...formData,
        ...amounts,
      };
      await axios.post('/api/collections/save', data);
      setMessage('Collection saved successfully');
      setFormData({
        date_collected: new Date().toISOString().split('T')[0],
        type: '',
      });
      setAmounts({});
      fetchData();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error saving collection');
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {user?.isadmin && (
        <div className="card">
          <h2>Record Collection</h2>
          {message && <div className={message.includes('success') ? 'success-message' : 'error-message'}>{message}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={formData.date_collected}
                onChange={(e) => setFormData({ ...formData, date_collected: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Service Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
              >
                <option value="">Select Service Type</option>
                {services.map(service => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            </div>
            {collectionTypes.map(type => (
              <div key={type.id} className="form-group">
                <label>{type.name}</label>
                <input
                  type="number"
                  value={amounts[type.name] || ''}
                  onChange={(e) => handleAmountChange(type.name, e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            ))}
            <button type="submit" className="btn btn-primary">Save Collection</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Collection History</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Collection Type</th>
              <th>Service Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {collections.map(collection => (
              <tr key={collection.id}>
                <td>{new Date(collection.date).toLocaleDateString()}</td>
                <td>{collection.collection_type_name || '-'}</td>
                <td>{collection.service_type_name || '-'}</td>
                <td>{collection.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Collections;

