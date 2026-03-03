import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Events = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    time: '',
    by_who: '',
    details: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await axios.get('/api/events');
      setEvents(response.data);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      await axios.post('/api/events', formData);
      setMessage('Event created successfully');
      setFormData({
        title: '',
        location: '',
        time: '',
        by_who: '',
        details: '',
        date: new Date().toISOString().split('T')[0],
      });
      fetchEvents();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error creating event');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        await axios.delete(`/api/events/${id}`);
        fetchEvents();
      } catch (error) {
        console.error('Error deleting event:', error);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {user?.isadmin && (
        <div className="card">
          <h2>Create Event</h2>
          {message && <div className={message.includes('success') ? 'success-message' : 'error-message'}>{message}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
              />
            </div>
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
              <label>By Who</label>
              <input
                type="text"
                value={formData.by_who}
                onChange={(e) => setFormData({ ...formData, by_who: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Details</label>
              <textarea
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                rows="4"
              />
            </div>
            <button type="submit" className="btn btn-primary">Create Event</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Upcoming Events</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Location</th>
              <th>Date</th>
              <th>Time</th>
              <th>By Who</th>
              {user?.isadmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {events.map(event => (
              <tr key={event.id}>
                <td>{event.title}</td>
                <td>{event.location}</td>
                <td>{new Date(event.date).toLocaleDateString()}</td>
                <td>{event.time}</td>
                <td>{event.by_who}</td>
                {user?.isadmin && (
                  <td>
                    <button onClick={() => handleDelete(event.id)} className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '14px' }}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Events;

