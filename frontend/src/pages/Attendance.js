import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Attendance = () => {
  const { user } = useAuth();
  const [attendances, setAttendances] = useState([]);
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    male: 0,
    female: 0,
    children: 0,
    type: '',
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [attendancesRes, membersRes, servicesRes] = await Promise.all([
        axios.get('/api/attendance/view'),
        axios.get('/api/members'),
        axios.get('/api/branches/tools/service-type'),
      ]);

      setAttendances(attendancesRes.data);
      setMembers(membersRes.data);
      setServices(servicesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      await axios.post('/api/attendance/submit', formData);
      setMessage('Attendance saved successfully');
      setFormData({
        date: new Date().toISOString().split('T')[0],
        male: 0,
        female: 0,
        children: 0,
        type: '',
      });
      fetchData();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error saving attendance');
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {user?.isadmin && (
        <div className="card">
          <h2>Mark Attendance</h2>
          {message && <div className={message.includes('success') ? 'success-message' : 'error-message'}>{message}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
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
            <div className="form-group">
              <label>Male</label>
              <input
                type="number"
                value={formData.male}
                onChange={(e) => setFormData({ ...formData, male: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Female</label>
              <input
                type="number"
                value={formData.female}
                onChange={(e) => setFormData({ ...formData, female: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Children</label>
              <input
                type="number"
                value={formData.children}
                onChange={(e) => setFormData({ ...formData, children: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <button type="submit" className="btn btn-primary">Save Attendance</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Attendance History</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Service Type</th>
              <th>Male</th>
              <th>Female</th>
              <th>Children</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {attendances.map(attendance => (
              <tr key={attendance.id}>
                <td>{new Date(attendance.attendance_date).toLocaleDateString()}</td>
                <td>{attendance.service_type_name || '-'}</td>
                <td>{attendance.male}</td>
                <td>{attendance.female}</td>
                <td>{attendance.children}</td>
                <td>{attendance.male + attendance.female + attendance.children}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;

