const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const bloodController = require('../controllers/bloodInventoryController');
const { authenticate, optionalAuthenticate } = require('../middleware/authMiddleware');
const { requireRoles } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validateMiddleware');

// GET /api/blood-inventory
router.get('/', optionalAuthenticate, bloodController.getBloodInventory);

// PUT /api/blood-inventory/:id
router.put(
  '/:id',
  authenticate,
  requireRoles('ADMIN', 'COORDINATOR'),
  [
    param('id').isInt({ min: 1 }).withMessage('Valid inventory ID required.'),
    body('available_units').optional().isInt({ min: 0 }).withMessage('Available units must be non-negative integer.'),
    body('reserved_units').optional().isInt({ min: 0 }).withMessage('Reserved units must be non-negative integer.'),
    body('minimum_threshold').optional().isInt({ min: 0 }).withMessage('Minimum threshold must be non-negative integer.'),
    validate
  ],
  bloodController.updateBloodInventory
);

module.exports = router;
