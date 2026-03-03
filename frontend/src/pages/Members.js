import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Members = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await axios.get('/api/members');
      setMembers(response.data);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter(member =>
    `${member.firstname} ${member.lastname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '20px' }}>
        {user?.isadmin && (
          <Link to="/members/new" className="btn btn-primary">Add Member</Link>
        )}
      </div>

      <div className="form-group">
        <input
          type="text"
          placeholder="Search members..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Position</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map(member => (
              <tr key={member.id}>
                <td>{member.firstname} {member.lastname}</td>
                <td>{member.email}</td>
                <td>{member.phone || '-'}</td>
                <td>{member.position}</td>
                <td>
                  <Link to={`/members/${member.id}`} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '14px' }}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Members;

