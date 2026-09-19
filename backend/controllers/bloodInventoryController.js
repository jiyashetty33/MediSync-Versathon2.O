const db = require('../db');
const alertService = require('../services/alertService');

/**
 * GET /api/blood-inventory
 */
async function getBloodInventory(req, res, next) {
  try {
    const role = req.user ? req.user.role : 'PATIENT';

    if (role === 'COORDINATOR') {
      const rows = await db.query(
        `SELECT b.*, h.name AS hospital_name 
         FROM blood_inventory b
         JOIN hospitals h ON b.hospital_id = h.hospital_id
         WHERE b.hospital_id = ?
         ORDER BY b.blood_group ASC`,
        [req.user.hospital_id]
      );
      return res.status(200).json({
        success: true,
        message: 'Blood inventory retrieved successfully.',
        data: rows
      });
    }

    if (role === 'ADMIN') {
      const filterHospital = req.query.hospital_id;
      let sql = `SELECT b.*, h.name AS hospital_name 
                 FROM blood_inventory b
                 JOIN hospitals h ON b.hospital_id = h.hospital_id`;
      const params = [];
      if (filterHospital) {
        sql += ' WHERE b.hospital_id = ?';
        params.push(filterHospital);
      }
      sql += ' ORDER BY b.hospital_id ASC, b.blood_group ASC';

      const rows = await db.query(sql, params);
      return res.status(200).json({
        success: true,
        message: 'Network blood inventory retrieved successfully.',
        data: rows
      });
    }

    // Patient / Public-safe view
    const rows = await db.query(
      `SELECT b.hospital_id, h.name AS hospital_name, b.blood_group, b.available_units 
       FROM blood_inventory b
       JOIN hospitals h ON b.hospital_id = h.hospital_id
       ORDER BY h.name ASC, b.blood_group ASC`
    );
    return res.status(200).json({
      success: true,
      message: 'Public blood availability retrieved.',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/blood-inventory/:id
 */
async function updateBloodInventory(req, res, next) {
  try {
    const inventoryId = parseInt(req.params.id, 10);
    const { available_units, reserved_units, minimum_threshold } = req.body;

    // Fetch current record
    const rows = await db.query(
      'SELECT * FROM blood_inventory WHERE inventory_id = ?',
      [inventoryId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Blood inventory item #${inventoryId} not found.`,
        error: {}
      });
    }

    const current = rows[0];

    // Check coordinator hospital ownership
    if (req.user.role === 'COORDINATOR' && current.hospital_id !== req.user.hospital_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot modify blood inventory for another hospital.',
        error: {
          assignedHospital: req.user.hospital_id,
          targetHospital: current.hospital_id
        }
      });
    }

    const available = available_units !== undefined ? Number(available_units) : current.available_units;
    const reserved = reserved_units !== undefined ? Number(reserved_units) : current.reserved_units;
    const minThreshold = minimum_threshold !== undefined ? Number(minimum_threshold) : current.minimum_threshold;

    if (available < 0 || reserved < 0 || minThreshold < 0) {
      return res.status(400).json({
        success: false,
        message: 'Blood inventory units and thresholds cannot be negative.',
        error: {}
      });
    }

    await db.query(
      `UPDATE blood_inventory 
       SET available_units = ?, reserved_units = ?, minimum_threshold = ?, updated_at = NOW() 
       WHERE inventory_id = ?`,
      [available, reserved, minThreshold, inventoryId]
    );

    // Evaluate low blood inventory alert
    await alertService.checkBloodAlerts(db, current.hospital_id, current.blood_group, available, minThreshold);

    return res.status(200).json({
      success: true,
      message: 'Blood inventory updated successfully.',
      data: {
        inventory_id: inventoryId,
        hospital_id: current.hospital_id,
        blood_group: current.blood_group,
        available_units: available,
        reserved_units: reserved,
        minimum_threshold: minThreshold
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBloodInventory,
  updateBloodInventory
};
