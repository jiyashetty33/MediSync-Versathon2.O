const db = require('../db');
const resourceService = require('../services/resourceService');
const { verifyResourceHospital } = require('../middleware/hospitalMiddleware');

/**
 * GET /api/resources
 * Fetches resources according to caller's role.
 * - Coordinators: get their hospital's detailed resources.
 * - Admins: get all hospital resources (or filtered by ?hospital_id=).
 * - Patients / Public: get public-safe availability numbers.
 */
async function getResources(req, res, next) {
  try {
    const role = req.user ? req.user.role : 'PATIENT';

    if (role === 'COORDINATOR') {
      const hospitalId = req.user.hospital_id;
      const rows = await db.query(
        `SELECT r.*, h.name AS hospital_name 
         FROM resources r 
         JOIN hospitals h ON r.hospital_id = h.hospital_id 
         WHERE r.hospital_id = ? 
         ORDER BY r.resource_type ASC`,
        [hospitalId]
      );
      return res.status(200).json({
        success: true,
        message: 'Hospital resources retrieved successfully.',
        data: rows
      });
    }

    if (role === 'ADMIN') {
      const filterHospital = req.query.hospital_id;
      let sql = `SELECT r.*, h.name AS hospital_name 
                 FROM resources r 
                 JOIN hospitals h ON r.hospital_id = h.hospital_id`;
      const params = [];

      if (filterHospital) {
        sql += ' WHERE r.hospital_id = ?';
        params.push(filterHospital);
      }
      sql += ' ORDER BY r.hospital_id ASC, r.resource_type ASC';

      const rows = await db.query(sql, params);
      return res.status(200).json({
        success: true,
        message: 'Network resources retrieved successfully.',
        data: rows
      });
    }

    // Patient / Public-safe read-only view
    const rows = await db.query(
      `SELECT r.hospital_id, h.name AS hospital_name, r.resource_type, r.available, r.status
       FROM resources r
       JOIN hospitals h ON r.hospital_id = h.hospital_id
       ORDER BY r.hospital_id ASC, r.resource_type ASC`
    );
    return res.status(200).json({
      success: true,
      message: 'Public resource availability retrieved successfully.',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/resources/network
 * Returns selected public-safe availability for all network hospitals.
 * Safe for coordinators to view availability of other hospitals.
 */
async function getNetworkResources(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT r.hospital_id, h.name AS hospital_name, h.area, h.city, h.contact,
              r.resource_type, r.available, r.status
       FROM resources r
       JOIN hospitals h ON r.hospital_id = h.hospital_id
       ORDER BY h.name ASC, r.resource_type ASC`
    );

    return res.status(200).json({
      success: true,
      message: 'Network-wide public-safe resource availability retrieved.',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/resources/:id
 */
async function getResourceById(req, res, next) {
  try {
    const resourceId = req.params.id;
    const role = req.user ? req.user.role : 'PATIENT';

    const rows = await db.query(
      `SELECT r.*, h.name AS hospital_name 
       FROM resources r 
       JOIN hospitals h ON r.hospital_id = h.hospital_id 
       WHERE r.resource_id = ?`,
      [resourceId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Resource #${resourceId} not found.`,
        error: {}
      });
    }

    const item = rows[0];

    // Check coordinator access
    if (role === 'COORDINATOR' && item.hospital_id !== req.user.hospital_id) {
      // Return public-safe fields only
      return res.status(200).json({
        success: true,
        message: 'External hospital resource (public view).',
        data: {
          resource_id: item.resource_id,
          hospital_id: item.hospital_id,
          hospital_name: item.hospital_name,
          resource_type: item.resource_type,
          available: item.available,
          status: item.status
        }
      });
    }

    if (role === 'PATIENT') {
      return res.status(200).json({
        success: true,
        message: 'Public resource view.',
        data: {
          resource_id: item.resource_id,
          hospital_id: item.hospital_id,
          hospital_name: item.hospital_name,
          resource_type: item.resource_type,
          available: item.available,
          status: item.status
        }
      });
    }

    // Full operational data for own coordinator or admin
    return res.status(200).json({
      success: true,
      message: 'Resource details retrieved.',
      data: item
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/resources/:id
 * Updates resource quantities while strictly enforcing hospital scoping and invariants.
 */
async function updateResource(req, res, next) {
  try {
    const resourceId = parseInt(req.params.id, 10);
    const { total, available, occupied, reserved, notes } = req.body;

    // Security check: Coordinator can only modify resources for their own hospital
    if (req.user.role === 'COORDINATOR') {
      const isOwner = await verifyResourceHospital(resourceId, req.user.hospital_id);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have permission to modify another hospital\'s resources.',
          error: {
            assignedHospital: req.user.hospital_id,
            targetResourceId: resourceId
          }
        });
      }
    }

    // Fetch target hospital ID for the resource
    const resRows = await db.query('SELECT hospital_id FROM resources WHERE resource_id = ?', [resourceId]);
    if (resRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Resource #${resourceId} not found.`,
        error: {}
      });
    }
    const targetHospitalId = resRows[0].hospital_id;

    // Execute update inside MySQL transaction
    const updatedResource = await db.withTransaction(async (conn) => {
      return await resourceService.updateResource(conn, {
        resourceId,
        hospitalId: targetHospitalId,
        newTotal: total,
        newAvailable: available,
        newOccupied: occupied,
        newReserved: reserved,
        user: req.user,
        action: 'MANUAL_COORDINATOR_UPDATE',
        notes: notes || 'Updated via resource management API'
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Resource updated successfully.',
      data: updatedResource
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/resources/history
 * Fetches resource audit history.
 * Scoped to own hospital for Coordinator; global for Admin.
 */
async function getResourceHistory(req, res, next) {
  try {
    const role = req.user.role;
    let sql = `SELECT h.*, r.resource_type, hosp.name AS hospital_name 
               FROM resource_history h
               LEFT JOIN resources r ON h.resource_id = r.resource_id
               LEFT JOIN hospitals hosp ON h.hospital_id = hosp.hospital_id`;
    const params = [];

    if (role === 'COORDINATOR') {
      sql += ' WHERE h.hospital_id = ?';
      params.push(req.user.hospital_id);
    } else if (role === 'ADMIN' && req.query.hospital_id) {
      sql += ' WHERE h.hospital_id = ?';
      params.push(req.query.hospital_id);
    }

    sql += ' ORDER BY h.timestamp DESC LIMIT 100';

    const rows = await db.query(sql, params);

    return res.status(200).json({
      success: true,
      message: 'Resource history retrieved successfully.',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getResources,
  getNetworkResources,
  getResourceById,
  updateResource,
  getResourceHistory
};
