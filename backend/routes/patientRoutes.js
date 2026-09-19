const express = require('express');
const { query, param } = require('express-validator');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { validate } = require('../middleware/validateMiddleware');

// GET /api/patient/nearby-hospitals?lat=...&lng=...&radius=...
router.get(
  '/nearby-hospitals',
  [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required (-90 to 90).'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required (-180 to 180).'),
    query('radius').optional().isFloat({ min: 1 }).withMessage('Radius must be a positive number in km.'),
    validate
  ],
  patientController.getNearbyHospitals
);

// GET /api/patient/hospitals/:id
router.get(
  '/hospitals/:id',
  [param('id').notEmpty().withMessage('Hospital ID is required.'), validate],
  patientController.getHospitalPublicDetails
);

module.exports = router;
