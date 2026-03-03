const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Ensure upload directories exist (for member photos, communications attachments)
const uploadsDir = path.join(__dirname, 'uploads');
const communicationsUploads = path.join(uploadsDir, 'communications');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(communicationsUploads)) fs.mkdirSync(communicationsUploads, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/users', require('./routes/users'));
app.use('/api/members', require('./routes/members'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/events', require('./routes/events'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/messaging', require('./routes/messaging'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/sub-users', require('./routes/subUsers'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/finance-reports', require('./routes/financeReports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/communications', require('./routes/communications'));

// Root endpoint (API info; in production / serves the React app)
if (!isProduction) {
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Church Management System API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: '/api/auth',
        members: '/api/members',
        attendance: '/api/attendance',
        collections: '/api/collections',
        events: '/api/events',
        groups: '/api/groups',
        reports: '/api/reports',
        roles: '/api/roles',
        users: '/api/users'
      }
    });
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

// 404 handler for API routes (must be after all API routes)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Production: serve React build and SPA fallback
if (isProduction) {
  const frontendBuild = path.join(__dirname, '..', 'frontend', 'build');
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

