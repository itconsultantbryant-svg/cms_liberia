import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Members.css';

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [versions, setVersions] = useState([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    title: '',
    category: 'church',
    description: '',
    visibility: 'church'
  });
  const [file, setFile] = useState(null);
  const [versionFile, setVersionFile] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (q) params.set('q', q);
      const [list, meta] = await Promise.all([
        axios.get(`/api/documents?${params.toString()}`),
        axios.get('/api/documents/meta')
      ]);
      setDocuments(list.data.documents || []);
      setCategories(meta.data.categories || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [filterCategory, q]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', form.title || file.name);
    fd.append('category', form.category);
    fd.append('description', form.description);
    fd.append('visibility', form.visibility);
    try {
      await axios.post('/api/documents', fd);
      setMessage('Document uploaded');
      setFile(null);
      setForm({ title: '', category: 'church', description: '', visibility: 'church' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    }
  };

  const openDoc = async (id) => {
    try {
      const res = await axios.get(`/api/documents/${id}`);
      setSelected(res.data.document);
      setVersions(res.data.versions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Open failed');
    }
  };

  const uploadVersion = async (e) => {
    e.preventDefault();
    if (!selected || !versionFile) return;
    const fd = new FormData();
    fd.append('file', versionFile);
    fd.append('notes', 'Updated version');
    try {
      await axios.post(`/api/documents/${selected.id}/versions`, fd);
      setMessage('New version uploaded');
      setVersionFile(null);
      openDoc(selected.id);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Version upload failed');
    }
  };

  const archive = async (id) => {
    if (!window.confirm('Archive this document?')) return;
    try {
      await axios.delete(`/api/documents/${id}`);
      setMessage('Archived');
      setSelected(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Archive failed');
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Documents</h1>
          <p className="members-sub">Secure church document library with categories &amp; versions</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <form className="card" onSubmit={upload}>
        <h2>Upload document</h2>
        <div className="member-form-grid">
          <div className="form-group">
            <label>Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Optional (defaults to filename)"
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.code || c} value={c.code || c}>
                  {c.name || c}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="church">Entire church</option>
              <option value="branch">This branch</option>
              <option value="restricted">Restricted (uploader)</option>
            </select>
          </div>
          <div className="form-group">
            <label>File</label>
            <input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!file}>
          Upload
        </button>
      </form>

      <div className="members-filters">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.code || c} value={c.code || c}>
              {c.name || c}
            </option>
          ))}
        </select>
        <input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card members-table-wrap">
        <h2>Library</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Visibility</th>
              <th>Version</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!documents.length && (
              <tr>
                <td colSpan={5}>
                  No documents yet. Upload a file above to get started.
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{d.category}</td>
                <td>{d.visibility}</td>
                <td>v{d.current_version}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 13 }}
                    onClick={() => openDoc(d.id)}
                  >
                    Open
                  </button>{' '}
                  <a
                    className="btn btn-primary"
                    style={{ padding: '4px 8px', fontSize: 13 }}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>{' '}
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '4px 8px', fontSize: 13 }}
                    onClick={() => archive(d.id)}
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card">
          <div className="members-header">
            <h2 style={{ margin: 0 }}>{selected.title}</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p>{selected.description || 'No description'}</p>
          <p>
            Category: {selected.category} · Visibility: {selected.visibility} · Current v
            {selected.current_version}
          </p>
          <p>
            <a href={selected.url} target="_blank" rel="noreferrer">
              Download current file
            </a>
          </p>

          <h3>Versions</h3>
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                v{v.version} —{' '}
                <a href={v.url} target="_blank" rel="noreferrer">
                  {v.original_name || v.filename}
                </a>
                {v.notes ? ` (${v.notes})` : ''}
              </li>
            ))}
          </ul>

          <form onSubmit={uploadVersion} className="members-bulk">
            <input type="file" onChange={(e) => setVersionFile(e.target.files?.[0] || null)} />
            <button type="submit" className="btn btn-primary" disabled={!versionFile}>
              Upload new version
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Documents;
