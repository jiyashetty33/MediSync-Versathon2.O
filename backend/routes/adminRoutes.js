const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRoles } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validateMiddleware');

// All Admin routes require authentication and ADMIN role strictly
router.use(authenticate);
router.use(requireRoles('ADMIN'));

// GET /api/admin/hospitals
router.get('/hospitals', adminController.getAllHospitals);

// POST /api/admin/hospitals
router.post(
  '/hospitals',
  [
    body('hospital_id').notEmpty().withMessage('Hospital ID is required (e.g. MNG-H006).'),
    body('name').notEmpty().withMessage('Hospital name is required.'),
    body('address').notEmpty().withMessage('Hospital address is required.'),
    body('area').notEmpty().withMessage('Hospital area is required.'),
    body('contact').notEmpty().withMessage('Contact number is required.'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required.'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required.'),
    validate
  ],
  adminController.createHospital
);

// PUT /api/admin/hospitals/:id
router.put(
  '/hospitals/:id',
  [param('id').notEmpty().withMessage('Hospital ID is required.'), validate],
  adminController.updateHospital
);

// POST /api/admin/coordinators
router.post(
  '/coordinators',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('full_name').notEmpty().withMessage('Full name is required.'),
    body('hospital_id').notEmpty().withMessage('Assigned hospital ID is required.'),
    validate
  ],
  adminController.createCoordinator
);

// PUT /api/admin/coordinators/:id
router.put(
  '/coordinators/:id',
  [param('id').isInt({ min: 1 }).withMessage('Valid coordinator user ID is required.'), validate],
  adminController.updateCoordinator
);

module.exports = router;
