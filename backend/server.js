const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { getJwtSecret } = require('./utils/authSecurity');
const { assertProductionSecrets } = require('./utils/securityHardening');
const { mountApi } = require('./routes');
const { apiLimiter, writeLimiter } = require('./middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { originCheck, rejectDangerousBody } = require('./middleware/security');
const { logger, requestLogMiddleware } = require('./utils/logger');
const { isProductionLike } = require('./config/environments');

// Vercel / serverless: derive public URL + CORS when operators only set JWT_SECRET
const onVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  if (onVercel) {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) {
    const origin = vercelHost.startsWith('http') ? vercelHost : `https://${vercelHost}`;
    if (!process.env.APP_URL) process.env.APP_URL = origin;
    if (!process.env.CORS_ORIGIN) process.env.CORS_ORIGIN = origin;
    if (!process.env.PLATFORM_DOMAIN) {
      try {
        process.env.PLATFORM_DOMAIN = new URL(origin).host;
      } catch (_) { /* */ }
    }
  }
  if (!process.env.SERVE_FRONTEND) process.env.SERVE_FRONTEND = '0';
  if (!process.env.TRUST_PROXY) process.env.TRUST_PROXY = '1';
  if (!process.env.UPLOADS_PATH) process.env.UPLOADS_PATH = path.join('/tmp', 'cms-uploads');
}

// Do not process.exit on serverless — that yields FUNCTION_INVOCATION_FAILED with no JSON body
let startupError = null;
try {
  getJwtSecret();
  assertProductionSecrets();
} catch (e) {
  startupError = e;
  console.error('[startup]', e.message);
  if (!onVercel && isProductionLike()) {
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const prodLike = isProductionLike();

if (startupError) {
  app.use((req, res, next) => {
    if (String(req.path || '').startsWith('/api/health')) {
      return res.status(503).json({
        success: false,
        status: 'misconfigured',
        error: startupError.message,
        hint: 'Set JWT_SECRET (32+ chars), CORS_ORIGIN, and DATABASE_URL on the backend service'
      });
    }
    return res.status(503).json({
      success: false,
      error: startupError.message,
      code: 'STARTUP_MISCONFIGURED'
    });
  });
}

// Behind Render / nginx / load balancers
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true' || prodLike) {
  app.set('trust proxy', 1);
}

// Ensure upload directories exist (optional UPLOADS_PATH override; /tmp on Vercel)
const uploadsDir = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, 'uploads');
const communicationsUploads = path.join(uploadsDir, 'communications');
const brandingUploads = path.join(uploadsDir, 'branding');
const documentsUploads = path.join(uploadsDir, 'documents');
try {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(communicationsUploads)) fs.mkdirSync(communicationsUploads, { recursive: true });
  if (!fs.existsSync(brandingUploads)) fs.mkdirSync(brandingUploads, { recursive: true });
  if (!fs.existsSync(documentsUploads)) fs.mkdirSync(documentsUploads, { recursive: true });
} catch (e) {
  console.warn('[uploads] could not create dirs:', e.message);
}

// Security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet({
  contentSecurityPolicy: prodLike
    ? {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      }
    : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' }
}));

// CORS
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const defaultDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3004',
  'http://127.0.0.1:3004',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];
const effectiveOrigins = corsOrigins.length
  ? corsOrigins
  : (prodLike ? [] : defaultDevOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (effectiveOrigins.includes(origin)) return callback(null, true);
    if (!prodLike && defaultDevOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));

// Phase 36 — gzip/brotli-capable response compression for JSON & static
app.use(compression({ threshold: 1024 }));

// Phase 39 — request logging + correlation id
app.use(requestLogMiddleware);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Phase 35 — Origin check on mutations + reject dangerous HTML in body fields
app.use('/api', originCheck(effectiveOrigins.length ? effectiveOrigins : defaultDevOrigins));
app.use('/api', rejectDangerousBody);
// Legacy public static for pre-Phase-33 paths only (branding thumbnails already uploaded).
// Private tenant files under uploads/churches/** must use /api/files (auth or signed URL).
app.use(
  '/uploads',
  (req, res, next) => {
    if (String(req.path || '').includes('/churches/')) {
      return res.status(403).json({
        success: false,
        error: 'Direct access to tenant storage is forbidden. Use /api/files.',
        code: 'FILE_DIRECT_FORBIDDEN'
      });
    }
    next();
  },
  express.static(uploadsDir)
);

// Phase 31 — global API rate limits (auth routes add stricter limiter)
app.use('/api', apiLimiter);
app.use('/api', writeLimiter);

// Modular API mounts
mountApi(app);

// Root endpoint (API info; in production / serves the React app)
if (!isProduction) {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Church Management System API',
      version: '1.1.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      catalog: '/api',
      health: '/api/health',
      architecture: '/api/meta/architecture'
    });
  });
}

// 404 for unknown API routes
app.use('/api', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Production/staging: optionally serve React build (monolith).
// Split deploy (Vercel frontend + Render API): set SERVE_FRONTEND=0
const serveFrontend =
  process.env.SERVE_FRONTEND === '1' ||
  process.env.SERVE_FRONTEND === 'true' ||
  ((isProduction || process.env.NODE_ENV === 'staging') &&
    process.env.SERVE_FRONTEND !== '0' &&
    process.env.SERVE_FRONTEND !== 'false');

if (serveFrontend) {
  const frontendBuild = path.join(__dirname, '..', 'frontend', 'build');
  if (fs.existsSync(frontendBuild)) {
    app.use(express.static(frontendBuild));
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendBuild, 'index.html'));
    });
  } else {
    console.warn('SERVE_FRONTEND enabled but frontend/build not found — API-only mode');
  }
} else if (isProduction || process.env.NODE_ENV === 'staging') {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Church Management System API',
      version: '1.1.0',
      status: 'running',
      frontend: 'hosted separately (e.g. Vercel)',
      health: '/api/health'
    });
  });
}

app.listen(PORT, () => {
  logger.info('server_start', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    trustProxy: app.get('trust proxy') || false
  });
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
