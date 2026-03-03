import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('membership');
  const [members, setMembers] = useState([]);
  const [collections, setCollections] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, [activeTab]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      if (activeTab === 'membership') {
        const response = await axios.get('/api/reports/membership');
        setMembers(response.data);
      } else if (activeTab === 'collections') {
        const response = await axios.get('/api/reports/collections');
        setCollections(response.data);
      } else if (activeTab === 'attendance') {
        const response = await axios.get('/api/reports/attendance');
        setAttendances(response.data);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          className={`btn ${activeTab === 'membership' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('membership')}
        >
          Membership
        </button>
        <button
          className={`btn ${activeTab === 'collections' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          Collections
        </button>
        <button
          className={`btn ${activeTab === 'attendance' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          Attendance
        </button>
      </div>

      {activeTab === 'membership' && (
        <div className="card">
          <h2>Membership Report</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Position</th>
                <th>Member Since</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id}>
                  <td>{member.firstname} {member.lastname}</td>
                  <td>{member.email}</td>
                  <td>{member.phone || '-'}</td>
                  <td>{member.position}</td>
                  <td>{member.member_since ? new Date(member.member_since).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'collections' && (
        <div className="card">
          <h2>Collections Report</h2>
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
      )}

      {activeTab === 'attendance' && (
        <div className="card">
          <h2>Attendance Report</h2>
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
      )}
    </div>
  );
};

export default Reports;

