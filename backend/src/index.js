import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Load all app config from config.json — no dotenv
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

// Import routes
import authRoutes from './routes/auth.routes.js';
import recordsRoutes from './routes/records.routes.js';
import accessRequestsRoutes from './routes/access-requests.routes.js';
import doctorsRoutes from './routes/doctors.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import emergencyRoutes from './routes/emergency.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import settingsRoutes from './routes/settings.routes.js';

// Import middleware
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { expireStaleAccessRequests } from './services/doctor-stats.service.js';

const app = express();

// ─── Security & Performance Middleware ───────────────────────────────────────

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser tools (curl/postman) and same-origin requests.
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      // Development convenience: allow any localhost port.
      if (config.nodeEnv !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api', limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  max: config.authRateLimit.maxRequests,
  message: { error: 'Too many auth attempts. Please try again in 15 minutes.' },
});
app.use('/api/auth', authLimiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Medilocker API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/access-requests', accessRequestsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Expose patient-scoped record routes via /api/patients prefix too
app.use('/api/patients', recordsRoutes);
app.use('/api/patients', accessRequestsRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`\n🏥 Medilocker API running on port ${PORT}`);
  console.log(`📋 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API base:     http://localhost:${PORT}/api\n`);
});

// Local/dev safety net to expire stale access grants even when Cloud Functions
// are not deployed.
if (config.nodeEnv !== 'test') {
  setInterval(() => {
    expireStaleAccessRequests().catch((err) => {
      console.error('Failed to expire stale access requests:', err.message);
    });
  }, 60 * 60 * 1000);
}

export default app;
