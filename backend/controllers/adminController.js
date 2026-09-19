const bcrypt = require('bcryptjs');
const db = require('../db');

/**
 * GET /api/admin/hospitals
 * Retrieves all registered hospitals with coordinator count and resource counts.
 */
async function getAllHospitals(req, res, next) {
  try {
    const hospitals = await db.query(
      `SELECT h.*, 
              COUNT(DISTINCT u.user_id) AS coordinator_count,
              COUNT(DISTINCT r.resource_id) AS resource_count
       FROM hospitals h
       LEFT JOIN users u ON h.hospital_id = u.hospital_id AND u.role = 'COORDINATOR'
       LEFT JOIN resources r ON h.hospital_id = r.hospital_id
       GROUP BY h.hospital_id
       ORDER BY h.hospital_id ASC`
    );

    return res.status(200).json({
      success: true,
      message: 'Admin: Hospitals retrieved successfully.',
      data: hospitals
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/hospitals
 * Registers a new hospital and automatically initializes standard resource slots.
 */
async function createHospital(req, res, next) {
  try {
    const { hospital_id, name, address, area, city = 'Mangalore', contact, latitude, longitude, status = 'NORMAL' } = req.body;

    const existing = await db.query('SELECT hospital_id FROM hospitals WHERE hospital_id = ?', [hospital_id]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Hospital with ID "${hospital_id}" already exists.`,
        error: {}
      });
    }

    await db.withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO hospitals (hospital_id, name, address, area, city, contact, latitude, longitude, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [hospital_id, name, address, area, city, contact, latitude, longitude, status]
      );

      // Initialize default resource slots
      const defaultResources = [
        { type: 'General beds', total: 100, available: 50, occupied: 50, reserved: 0 },
        { type: 'ICU beds', total: 15, available: 5, occupied: 10, reserved: 0 },
        { type: 'Emergency beds', total: 20, available: 8, occupied: 12, reserved: 0 },
        { type: 'Isolation beds', total: 10, available: 4, occupied: 6, reserved: 0 },
        { type: 'Ventilators', total: 10, available: 3, occupied: 7, reserved: 0 }
      ];

      for (const r of defaultResources) {
        const util = ((r.occupied + r.reserved) / r.total) * 100;
        await conn.query(
          `INSERT INTO resources (hospital_id, resource_type, total, available, occupied, reserved, utilization_percentage, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'NORMAL')`,
          [hospital_id, r.type, r.total, r.available, r.occupied, r.reserved, util]
        );
      }

      // Initialize default 8 blood groups
      const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      for (const bg of bloodGroups) {
        await conn.query(
          `INSERT INTO blood_inventory (hospital_id, blood_group, available_units, reserved_units, minimum_threshold)
           VALUES (?, ?, 15, 0, 10)`,
          [hospital_id, bg]
        );
      }
    });

    return res.status(201).json({
      success: true,
      message: `Hospital ${hospital_id} (${name}) created successfully.`,
      data: {
        hospital_id,
        name,
        address,
        area,
        city,
        contact,
        latitude,
        longitude,
        status
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/hospitals/:id
 * Updates hospital configuration.
 */
async function updateHospital(req, res, next) {
  try {
    const hospitalId = req.params.id;
    const { name, address, area, city, contact, latitude, longitude, status } = req.body;

    const rows = await db.query('SELECT * FROM hospitals WHERE hospital_id = ?', [hospitalId]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Hospital #${hospitalId} not found.`,
        error: {}
      });
    }

    const current = rows[0];
    await db.query(
      `UPDATE hospitals 
       SET name = COALESCE(?, name),
           address = COALESCE(?, address),
           area = COALESCE(?, area),
           city = COALESCE(?, city),
           contact = COALESCE(?, contact),
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           status = COALESCE(?, status),
           updated_at = NOW()
       WHERE hospital_id = ?`,
      [name, address, area, city, contact, latitude, longitude, status, hospitalId]
    );

    return res.status(200).json({
      success: true,
      message: `Hospital #${hospitalId} updated successfully.`,
      data: { hospital_id: hospitalId }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/coordinators
 * Creates a new coordinator user account linked to a specific hospital.
 */
async function createCoordinator(req, res, next) {
  try {
    const { email, password, full_name, hospital_id, phone } = req.body;

    // Check if email already registered
    const existing = await db.query('SELECT user_id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `User with email "${email}" already exists.`,
        error: {}
      });
    }

    // Verify hospital exists
    const hospRows = await db.query('SELECT name FROM hospitals WHERE hospital_id = ?', [hospital_id]);
    if (hospRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Hospital #${hospital_id} does not exist.`,
        error: {}
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, hospital_id, phone)
       VALUES (?, ?, ?, 'COORDINATOR', ?, ?)`,
      [email.trim().toLowerCase(), passwordHash, full_name, hospital_id, phone || null]
    );

    return res.status(201).json({
      success: true,
      message: `Coordinator account created for ${hospital_id}.`,
      data: {
        user_id: result.insertId,
        email: email.trim().toLowerCase(),
        full_name,
        role: 'COORDINATOR',
        hospital_id,
        hospital_name: hospRows[0].name,
        phone
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/coordinators/:id
 * Updates an existing coordinator account.
 */
async function updateCoordinator(req, res, next) {
  try {
    const userId = parseInt(req.params.id, 10);
    const { full_name, hospital_id, phone, password } = req.body;

    const userRows = await db.query('SELECT * FROM users WHERE user_id = ? AND role = "COORDINATOR"', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Coordinator #${userId} not found.`,
        error: {}
      });
    }

    let passwordHash = undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    await db.query(
      `UPDATE users 
       SET full_name = COALESCE(?, full_name),
           hospital_id = COALESCE(?, hospital_id),
           phone = COALESCE(?, phone),
           password_hash = COALESCE(?, password_hash),
           updated_at = NOW()
       WHERE user_id = ?`,
      [full_name, hospital_id, phone, passwordHash, userId]
    );

    return res.status(200).json({
      success: true,
      message: `Coordinator #${userId} updated successfully.`,
      data: { user_id: userId }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllHospitals,
  createHospital,
  updateHospital,
  createCoordinator,
  updateCoordinator
};
