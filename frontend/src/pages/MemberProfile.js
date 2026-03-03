import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const MemberProfile = () => {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [attendance, setAttendance] = useState({ yes: 0, no: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMember();
  }, [id]);

  const fetchMember = async () => {
    try {
      const response = await axios.get(`/api/members/${id}`);
      setMember(response.data.member);
      setAttendance(response.data.attendance);
    } catch (error) {
      console.error('Error fetching member:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!member) {
    return <div>Member not found</div>;
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>{member.firstname} {member.lastname}</h2>
      <div className="card">
        <h2>Profile Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <p><strong>Email:</strong> {member.email}</p>
            <p><strong>Phone:</strong> {member.phone || '-'}</p>
            <p><strong>Position:</strong> {member.position}</p>
            <p><strong>Sex:</strong> {member.sex}</p>
          </div>
          <div>
            <p><strong>Address:</strong> {member.address || '-'}</p>
            <p><strong>City:</strong> {member.city || '-'}</p>
            <p><strong>State:</strong> {member.state || '-'}</p>
            <p><strong>Country:</strong> {member.country || '-'}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Attendance Statistics</h2>
        <p><strong>Present:</strong> {attendance.yes || 0}</p>
        <p><strong>Absent:</strong> {attendance.no || 0}</p>
      </div>
    </div>
  );
};

export default MemberProfile;

