const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { optionalAuthenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

// POST /api/patient-requests
router.post(
  '/',
  optionalAuthenticate,
  [
    body('hospital_id').notEmpty().withMessage('Hospital ID is required.'),
    body('resource_type').notEmpty().withMessage('Resource type is required.'),
    body('reason').notEmpty().withMessage('Reason is required.'),
    body('patient_name').optional().isString().trim(),
    body('patient_phone').optional().isString().trim(),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority.'),
    validate
  ],
  patientController.submitPatientRequest
);

// GET /api/patient-requests/:id
router.get(
  '/:id',
  optionalAuthenticate,
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID required.'), validate],
  patientController.getPatientRequestById
);

module.exports = router;
