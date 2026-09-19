const express = require('express');
const { param } = require('express-validator');
const router = express.Router();
const notifController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

router.use(authenticate);

// GET /api/notifications
router.get('/', notifController.getNotifications);

// PUT /api/notifications/:id/read
router.put(
  '/:id/read',
  [param('id').isInt({ min: 1 }).withMessage('Valid notification ID required.'), validate],
  notifController.markAsRead
);

module.exports = router;
