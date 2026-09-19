/**
 * Role authorization middleware.
 * Usage: requireRoles('ADMIN'), requireRoles('ADMIN', 'COORDINATOR')
 * @param  {...string} allowedRoles
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Authentication required.',
        error: {}
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`,
        error: { requiredRoles: allowedRoles, currentRole: req.user.role }
      });
    }

    next();
  };
}

module.exports = {
  requireRoles
};
