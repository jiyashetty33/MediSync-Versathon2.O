const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { authenticate, optionalAuthenticate } = require('../middleware/authMiddleware');
const { requireRoles } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validateMiddleware');

// Public/Safe or Role-specific resource overview
router.get('/', optionalAuthenticate, resourceController.getResources);

// Coordinator/Admin cross-hospital network view
router.get('/network', authenticate, requireRoles('ADMIN', 'COORDINATOR'), resourceController.getNetworkResources);

// Resource audit history
router.get('/history', authenticate, requireRoles('ADMIN', 'COORDINATOR'), resourceController.getResourceHistory);

// Specific resource by ID
router.get('/:id', optionalAuthenticate, resourceController.getResourceById);

// Update resource (Coordinator locked to own hospital, Admin network-wide)
router.put(
  '/:id',
  authenticate,
  requireRoles('ADMIN', 'COORDINATOR'),
  [
    param('id').isInt({ min: 1 }).withMessage('Valid resource ID is required.'),
    body('total').optional().isInt({ min: 0 }).withMessage('Total must be non-negative integer.'),
    body('available').optional().isInt({ min: 0 }).withMessage('Available must be non-negative integer.'),
    body('occupied').optional().isInt({ min: 0 }).withMessage('Occupied must be non-negative integer.'),
    body('reserved').optional().isInt({ min: 0 }).withMessage('Reserved must be non-negative integer.'),
    validate
  ],
  resourceController.updateResource
);

module.exports = router;
