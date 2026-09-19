const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRoles } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validateMiddleware');

// All emergency workflow endpoints require authentication & Coordinator/Admin roles
router.use(authenticate);
router.use(requireRoles('ADMIN', 'COORDINATOR'));

// GET /api/emergency-requests
router.get('/', emergencyController.getEmergencyRequests);

// GET /api/emergency-requests/:id
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.getEmergencyRequestById
);

// POST /api/emergency-requests
router.post(
  '/',
  [
    body('requested_hospital_id').notEmpty().withMessage('Target requested hospital ID is required.'),
    body('resource_type').notEmpty().withMessage('Resource type is required.'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1.'),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority.'),
    body('reason').notEmpty().withMessage('Reason is required for emergency request.'),
    validate
  ],
  emergencyController.createEmergencyRequest
);

// POST /api/emergency-requests/:id/accept
router.post(
  '/:id/accept',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.acceptEmergencyRequest
);

// POST /api/emergency-requests/:id/reject
router.post(
  '/:id/reject',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.rejectEmergencyRequest
);

// POST /api/emergency-requests/:id/reserve
router.post(
  '/:id/reserve',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.reserveEmergencyRequest
);

// POST /api/emergency-requests/:id/allocate
router.post(
  '/:id/allocate',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.allocateEmergencyRequest
);

// POST /api/emergency-requests/:id/complete
router.post(
  '/:id/complete',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.completeEmergencyRequest
);

// POST /api/emergency-requests/:id/cancel
router.post(
  '/:id/cancel',
  [param('id').isInt({ min: 1 }).withMessage('Valid request ID is required.'), validate],
  emergencyController.cancelEmergencyRequest
);

module.exports = router;
