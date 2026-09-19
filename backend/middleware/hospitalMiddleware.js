const db = require('../db');

/**
 * Enforces hospital-level scoping for coordinators.
 * - ADMIN: Unrestricted access across the network. If hospital_id is specified in query/param, req.hospitalId is set to that.
 * - COORDINATOR: Strictly locked to req.user.hospital_id. Any attempt to pass a different hospital_id via params, query, or body is rejected with 403.
 * - PATIENT: Read-only access to public safe information; write operations to hospital resources are forbidden.
 */
function enforceHospitalScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Authentication required.',
      error: {}
    });
  }

  // Admin has global network access
  if (req.user.role === 'ADMIN') {
    req.targetHospitalId = req.params.hospitalId || req.query.hospital_id || req.body.hospital_id || null;
    return next();
  }

  // Coordinators must belong to a specific hospital
  if (req.user.role === 'COORDINATOR') {
    if (!req.user.hospital_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Coordinator is not assigned to any hospital.',
        error: {}
      });
    }

    const requestedHospitalId = req.params.hospitalId || req.query.hospital_id || req.body.hospital_id;

    // Check for tampering attempt
    if (requestedHospitalId && requestedHospitalId !== req.user.hospital_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Access denied. You are only authorized to manage resources for your assigned hospital.',
        error: {
          assignedHospital: req.user.hospital_id,
          attemptedHospital: requestedHospitalId
        }
      });
    }

    // Server-side authoritative assignment
    req.targetHospitalId = req.user.hospital_id;
    if (req.body && typeof req.body === 'object') {
      req.body.hospital_id = req.user.hospital_id;
    }

    return next();
  }

  // Patients cannot access coordinator-level hospital resource modification
  return res.status(403).json({
    success: false,
    message: 'Forbidden: Patients cannot access or modify internal hospital resources.',
    error: {}
  });
}

/**
 * Validates that a resource_id belongs to the coordinator's hospital.
 * @param {number|string} resourceId 
 * @param {string} hospitalId 
 * @returns {Promise<boolean>}
 */
async function verifyResourceHospital(resourceId, hospitalId) {
  const rows = await db.query(
    'SELECT hospital_id FROM resources WHERE resource_id = ?',
    [resourceId]
  );
  if (!rows || rows.length === 0) return false;
  return rows[0].hospital_id === hospitalId;
}

module.exports = {
  enforceHospitalScope,
  verifyResourceHospital
};
