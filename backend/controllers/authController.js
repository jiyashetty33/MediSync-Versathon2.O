const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * Handles user login for ADMIN, COORDINATOR, and PATIENT roles.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const users = await db.query(
      `SELECT u.user_id, u.email, u.password_hash, u.full_name, u.role, u.hospital_id, u.phone,
              h.name AS hospital_name
       FROM users u
       LEFT JOIN hospitals h ON u.hospital_id = h.hospital_id
       WHERE u.email = ?`,
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
        error: {}
      });
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
        error: {}
      });
    }

    // Role-specific validation: If coordinator, ensure valid hospital is attached
    if (user.role === 'COORDINATOR' && !user.hospital_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Coordinator account is not linked to any hospital.',
        error: {}
      });
    }

    const payload = {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospital_id
    };

    const secret = process.env.JWT_SECRET || 'medisync_jwt_secure_secret_key_mng_2026';
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = jwt.sign(payload, secret, { expiresIn });

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: {
        token,
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          hospital_id: user.hospital_id,
          hospital_name: user.hospital_name,
          phone: user.phone
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns current authenticated user profile
 */
async function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    message: 'User profile retrieved successfully.',
    data: {
      user: req.user
    }
  });
}

module.exports = {
  login,
  getCurrentUser
};
