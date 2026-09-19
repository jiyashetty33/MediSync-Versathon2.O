const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Route handlers
const authRoutes = require('./routes/authRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const bloodInventoryRoutes = require('./routes/bloodInventoryRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const patientRoutes = require('./routes/patientRoutes');
const patientRequestRoutes = require('./routes/patientRequestRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Security & Parsing Middleware
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MediSync Smart Hospital Resource Coordination API is operational.',
    data: {
      status: 'UP',
      region: 'Mangalore (MNG)',
      timestamp: new Date().toISOString()
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/blood-inventory', bloodInventoryRoutes);
app.use('/api/emergency-requests', emergencyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/patient-requests', patientRequestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('================================================================');
    console.log(`MEDISYNC BACKEND SERVER STARTED SUCCESSFULLY`);
    console.log(`Port:           ${PORT}`);
    console.log(`Environment:    ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health Check:   http://localhost:${PORT}/api/health`);
    console.log(`API Base:       http://localhost:${PORT}/api`);
    console.log('================================================================');
  });
}

module.exports = app;
