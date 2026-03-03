import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Groups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await axios.get('/api/groups');
      setGroups(response.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      await axios.post('/api/groups/create', { name: groupName });
      setMessage('Group created successfully');
      setGroupName('');
      fetchGroups();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error creating group');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      try {
        await axios.delete(`/api/groups/${id}`);
        fetchGroups();
      } catch (error) {
        console.error('Error deleting group:', error);
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
          <h2>Create Group</h2>
          {message && <div className={message.includes('success') ? 'success-message' : 'error-message'}>{message}</div>}
          <form onSubmit={handleCreateGroup}>
            <div className="form-group">
              <label>Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Create Group</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>All Groups</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Members</th>
              {user?.isadmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <tr key={group.id}>
                <td>{group.name}</td>
                <td>{group.member_count || 0}</td>
                {user?.isadmin && (
                  <td>
                    <button onClick={() => handleDelete(group.id)} className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '14px' }}>
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

export default Groups;

