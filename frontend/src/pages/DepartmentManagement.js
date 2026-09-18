import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DepartmentManagement.css';

const DepartmentManagement = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [formData, setFormData] = useState({
    department_code: '',
    department_name: '',
    parent_department_id: '',
    office_type: 'local',
    location: '',
    description: ''
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await axios.get('/api/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
      alert('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await axios.put(`/api/departments/${editingDept.id}`, formData);
        alert('Department updated successfully');
      } else {
        await axios.post('/api/departments', formData);
        alert('Department created successfully');
      }
      setShowModal(false);
      setEditingDept(null);
      setFormData({
        department_code: '',
        department_name: '',
        parent_department_id: '',
        office_type: 'local',
        location: '',
        description: ''
      });
      fetchDepartments();
    } catch (error) {
      console.error('Error saving department:', error);
      alert(error.response?.data?.error || 'Failed to save department');
    }
  };

  const handleEdit = (dept) => {
    setEditingDept(dept);
    setFormData({
      department_code: dept.department_code,
      department_name: dept.department_name,
      parent_department_id: dept.parent_department_id || '',
      office_type: dept.office_type,
      location: dept.location || '',
      description: dept.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this department?')) {
      return;
    }

    try {
      await axios.delete(`/api/departments/${id}`);
      alert('Department deleted successfully');
      fetchDepartments();
    } catch (error) {
      console.error('Error deleting department:', error);
      alert(error.response?.data?.error || 'Failed to delete department');
    }
  };

  if (loading) {
    return <div className="loading">Loading departments...</div>;
  }

  return (
    <div className="department-management">
      <div className="page-header">
        <h1>Department Management</h1>
        <button className="btn-add" onClick={() => {
          setEditingDept(null);
          setFormData({
            department_code: '',
            department_name: '',
            parent_department_id: '',
            office_type: 'local',
            location: '',
            description: ''
          });
          setShowModal(true);
        }}>
          ➕ Add Department
        </button>
      </div>

      <div className="departments-grid">
        {departments.length === 0 ? (
          <div className="no-data">No departments found. Create your first department.</div>
        ) : (
          departments.map(dept => (
            <div key={dept.id} className="department-card">
              <div className="dept-header">
                <h3>{dept.department_name}</h3>
                <div className="dept-actions">
                  <button className="btn-edit" onClick={() => handleEdit(dept)}>✏️</button>
                  <button className="btn-delete" onClick={() => handleDelete(dept.id)}>🗑️</button>
                </div>
              </div>
              <p className="dept-code">Code: {dept.department_code}</p>
              <p className="dept-type">Type: {dept.office_type}</p>
              {dept.location && <p className="dept-location">Location: {dept.location}</p>}
              {dept.parent_department_name && (
                <p className="dept-parent">Parent: {dept.parent_department_name}</p>
              )}
              {dept.description && (
                <p className="dept-description">{dept.description}</p>
              )}
              {dept.assigned_users_count > 0 && (
                <p className="dept-users">{dept.assigned_users_count} user(s) assigned</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingDept ? 'Edit Department' : 'Add New Department'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Department Code *</label>
                <input
                  type="text"
                  value={formData.department_code}
                  onChange={(e) => setFormData({ ...formData, department_code: e.target.value })}
                  required
                  disabled={!!editingDept}
                />
              </div>

              <div className="form-group">
                <label>Department Name *</label>
                <input
                  type="text"
                  value={formData.department_name}
                  onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Office Type *</label>
                <select
                  value={formData.office_type}
                  onChange={(e) => setFormData({ ...formData, office_type: e.target.value })}
                  required
                >
                  <option value="national">National</option>
                  <option value="mission">Mission</option>
                  <option value="department">Department</option>
                  <option value="station">Station</option>
                  <option value="local">Local</option>
                </select>
              </div>

              <div className="form-group">
                <label>Parent Department</label>
                <select
                  value={formData.parent_department_id}
                  onChange={(e) => setFormData({ ...formData, parent_department_id: e.target.value })}
                >
                  <option value="">None (Top Level)</option>
                  {departments.filter(d => d.id !== editingDept?.id).map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Location</label>
                <select
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                >
                  <option value="">Select Location</option>
                  <option value="liberia">Liberia</option>
                  <option value="foreign">Foreign</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-submit">
                  {editingDept ? 'Update' : 'Create'} Department
                </button>
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentManagement;

