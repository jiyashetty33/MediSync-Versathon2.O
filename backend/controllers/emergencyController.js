const db = require('../db');
const emergencyService = require('../services/emergencyService');

/**
 * GET /api/emergency-requests
 * Coordinators see requests where their hospital is either requester or responder.
 * Admins see all requests.
 */
async function getEmergencyRequests(req, res, next) {
  try {
    const role = req.user.role;
    let sql = `SELECT er.*, 
                      h_req.name AS requesting_hospital_name,
                      h_resp.name AS requested_hospital_name
               FROM emergency_requests er
               JOIN hospitals h_req ON er.requesting_hospital_id = h_req.hospital_id
               JOIN hospitals h_resp ON er.requested_hospital_id = h_resp.hospital_id`;
    const params = [];

    if (role === 'COORDINATOR') {
      sql += ' WHERE er.requesting_hospital_id = ? OR er.requested_hospital_id = ?';
      params.push(req.user.hospital_id, req.user.hospital_id);
    } else if (role === 'ADMIN' && req.query.hospital_id) {
      sql += ' WHERE er.requesting_hospital_id = ? OR er.requested_hospital_id = ?';
      params.push(req.query.hospital_id, req.query.hospital_id);
    }

    if (req.query.status) {
      sql += (params.length > 0 ? ' AND' : ' WHERE') + ' er.status = ?';
      params.push(req.query.status);
    }

    sql += ' ORDER BY er.created_at DESC';

    const rows = await db.query(sql, params);
    return res.status(200).json({
      success: true,
      message: 'Emergency requests retrieved successfully.',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/emergency-requests/:id
 */
async function getEmergencyRequestById(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);
    const rows = await db.query(
      `SELECT er.*, 
              h_req.name AS requesting_hospital_name,
              h_resp.name AS requested_hospital_name
       FROM emergency_requests er
       JOIN hospitals h_req ON er.requesting_hospital_id = h_req.hospital_id
       JOIN hospitals h_resp ON er.requested_hospital_id = h_resp.hospital_id
       WHERE er.request_id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Emergency request #${requestId} not found.`,
        error: {}
      });
    }

    const item = rows[0];

    // Coordinator can only view if involved in request
    if (req.user.role === 'COORDINATOR') {
      if (item.requesting_hospital_id !== req.user.hospital_id && item.requested_hospital_id !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You can only view emergency requests involving your assigned hospital.',
          error: {}
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Emergency request retrieved successfully.',
      data: item
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests
 * Initiates an emergency resource transfer request
 */
async function createEmergencyRequest(req, res, next) {
  try {
    const { requested_hospital_id, resource_type, quantity, priority, reason, notes, required_by } = req.body;

    // Server-side authoritative requesting_hospital_id enforcement
    const requestingHospitalId = req.user.role === 'ADMIN'
      ? (req.body.requesting_hospital_id || req.user.hospital_id)
      : req.user.hospital_id;

    if (!requestingHospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Requesting hospital ID is required.',
        error: {}
      });
    }

    const created = await db.withTransaction(async (conn) => {
      return await emergencyService.createRequest(conn, {
        requestingHospitalId,
        requestedHospitalId: requested_hospital_id,
        resourceType: resource_type,
        quantity: quantity || 1,
        priority: priority || 'HIGH',
        reason,
        notes,
        requiredBy: required_by,
        user: req.user
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Emergency resource request created successfully.',
      data: created
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests/:id/accept
 */
async function acceptEmergencyRequest(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { notes } = req.body;

    const result = await db.withTransaction(async (conn) => {
      // Authorization check: Only requested hospital coordinator or Admin can accept
      const item = await emergencyService.lockAndFetchRequest(conn, requestId);
      if (req.user.role === 'COORDINATOR' && item.requested_hospital_id !== req.user.hospital_id) {
        const err = new Error('Forbidden: Only the requested hospital coordinator can accept this request.');
        err.statusCode = 403;
        throw err;
      }
      return await emergencyService.acceptRequest(conn, requestId, req.user, notes);
    });

    return res.status(200).json({
      success: true,
      message: 'Emergency request accepted.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests/:id/reject
 */
async function rejectEmergencyRequest(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    const result = await db.withTransaction(async (conn) => {
      const item = await emergencyService.lockAndFetchRequest(conn, requestId);
      if (req.user.role === 'COORDINATOR' && item.requested_hospital_id !== req.user.hospital_id) {
        const err = new Error('Forbidden: Only the requested hospital coordinator can reject this request.');
        err.statusCode = 403;
        throw err;
      }
      return await emergencyService.rejectRequest(conn, requestId, req.user, reason);
    });

    return res.status(200).json({
      success: true,
      message: 'Emergency request rejected.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests/:id/reserve
 */
async function reserveEmergencyRequest(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);

    const result = await db.withTransaction(async (conn) => {
      const item = await emergencyService.lockAndFetchRequest(conn, requestId);
      if (req.user.role === 'COORDINATOR' && item.requested_hospital_id !== req.user.hospital_id) {
        const err = new Error('Forbidden: Only the requested hospital coordinator can reserve this resource.');
        err.statusCode = 403;
        throw err;
      }
      return await emergencyService.reserveRequest(conn, requestId, req.user);
    });

    return res.status(200).json({
      success: true,
      message: 'Resource reserved for emergency request.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests/:id/allocate
 */
async function allocateEmergencyRequest(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);

    const result = await db.withTransaction(async (conn) => {
      const item = await emergencyService.lockAndFetchRequest(conn, requestId);
      if (req.user.role === 'COORDINATOR' && item.requested_hospital_id !== req.user.hospital_id) {
        const err = new Error('Forbidden: Only the requested hospital coordinator can allocate this resource.');
        err.statusCode = 403;
        throw err;
      }
      return await emergencyService.allocateRequest(conn, requestId, req.user);
    });

    return res.status(200).json({
      success: true,
      message: 'Resource allocated and dispatched.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests/:id/complete
 */
async function completeEmergencyRequest(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);

    const result = await db.withTransaction(async (conn) => {
      const item = await emergencyService.lockAndFetchRequest(conn, requestId);
      if (req.user.role === 'COORDINATOR' && item.requesting_hospital_id !== req.user.hospital_id) {
        const err = new Error('Forbidden: Only the requesting hospital coordinator can mark this transfer complete.');
        err.statusCode = 403;
        throw err;
      }
      return await emergencyService.completeRequest(conn, requestId, req.user);
    });

    return res.status(200).json({
      success: true,
      message: 'Emergency request marked as complete.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/emergency-requests/:id/cancel
 */
async function cancelEmergencyRequest(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    const result = await db.withTransaction(async (conn) => {
      const item = await emergencyService.lockAndFetchRequest(conn, requestId);
      if (req.user.role === 'COORDINATOR' && item.requesting_hospital_id !== req.user.hospital_id && item.requested_hospital_id !== req.user.hospital_id) {
        const err = new Error('Forbidden: You are not authorized to cancel this request.');
        err.statusCode = 403;
        throw err;
      }
      return await emergencyService.cancelRequest(conn, requestId, req.user, reason);
    });

    return res.status(200).json({
      success: true,
      message: 'Emergency request cancelled.',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getEmergencyRequests,
  getEmergencyRequestById,
  createEmergencyRequest,
  acceptEmergencyRequest,
  rejectEmergencyRequest,
  reserveEmergencyRequest,
  allocateEmergencyRequest,
  completeEmergencyRequest,
  cancelEmergencyRequest
};
