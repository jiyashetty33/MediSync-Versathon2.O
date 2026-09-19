const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRoles } = require('../middleware/roleMiddleware');

router.use(authenticate);

// GET /api/analytics/coordinator - Scoped strictly to caller's own hospital
router.get(
  '/coordinator',
  requireRoles('COORDINATOR', 'ADMIN'),
  analyticsController.getCoordinatorAnalytics
);

// GET /api/analytics/admin - Network-wide aggregates
router.get(
  '/admin',
  requireRoles('ADMIN'),
  analyticsController.getAdminAnalytics
);

module.exports = router;
