const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const { initDatabase } = require('./database/db');

// Import route handlers
const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const path = require('path');
const fs = require('fs');

const app = express();

// Trust proxy for reverse proxy setups (Nginx, HTTPS, Cloudflare)
app.enable('trust proxy');

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'SolWash Laundry Backend API is healthy and operational!',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

// Static Frontend (Admin Portal Only - Web Preview is excluded)
const adminDir = path.resolve(__dirname, '../../admin');

if (fs.existsSync(adminDir)) {
  // Direct root access straight to Admin Panel
  app.get('/', (req, res) => res.redirect('/admin/'));
  app.use('/admin', express.static(adminDir));
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(adminDir, 'index.html'));
  });
}

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Route not found.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error occurred.',
    error: env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Server after Database initialization
const PORT = process.env.PORT || env.PORT || 5000;

const startServer = async () => {
  await initDatabase();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=============================================`);
    console.log(`🚀 SolWash Server running on port ${PORT}`);
    console.log(`🔗 Web Preview:  http://localhost:${PORT}/`);
    console.log(`🔗 Admin Portal: http://localhost:${PORT}/admin`);
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
    console.log(`=============================================`);
  });
  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
