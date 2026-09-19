const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * Middleware to authenticate requests using JWT tokens.
 * Verifies the token and loads the current authenticated user into req.user.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer token.',
        error: {}
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No token provided.',
        error: {}
      });
    }

    const secret = process.env.JWT_SECRET || 'medisync_jwt_secure_secret_key_mng_2026';
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Token is expired or invalid.',
        error: { name: err.name, message: err.message }
      });
    }

    // Fetch user from DB to verify user still exists and role/hospital are fresh
    const users = await db.query(
      'SELECT user_id, email, full_name, role, hospital_id, phone FROM users WHERE user_id = ?',
      [decoded.userId]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User account no longer exists.',
        error: {}
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication: If token is present, verifies it and attaches req.user;
 * if no token is present, continues without error (for endpoints supporting both public & authenticated users).
 */
async function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
}

module.exports = {
  authenticate,
  optionalAuthenticate
};
