const db = require('../db');
const alertService = require('../services/alertService');
const { calculateDistance } = require('../services/distanceService');

/**
 * GET /api/patient/nearby-hospitals
 * Computes Haversine distance from given lat/lng and returns public-safe hospital availability.
 */
async function getNearbyHospitals(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius || '50'); // default 50 km

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude (lat) and longitude (lng) query parameters are required.',
        error: {}
      });
    }

    const hospitals = await db.query(
      `SELECT hospital_id, name, address, area, city, contact, latitude, longitude, status 
       FROM hospitals 
       ORDER BY name ASC`
    );

    // Fetch public resource availability summary for all hospitals
    const resourceSummaries = await db.query(
      `SELECT hospital_id, resource_type, available, status 
       FROM resources`
    );

    const resourceMap = {};
    for (const r of resourceSummaries) {
      if (!resourceMap[r.hospital_id]) resourceMap[r.hospital_id] = [];
      resourceMap[r.hospital_id].push({
        resource_type: r.resource_type,
        available: r.available,
        status: r.status
      });
    }

    // Compute distance and filter/sort
    const nearby = hospitals
      .map(h => {
        const distanceKm = calculateDistance(lat, lng, parseFloat(h.latitude), parseFloat(h.longitude));
        return {
          hospital_id: h.hospital_id,
          name: h.name,
          address: h.address,
          area: h.area,
          city: h.city,
          contact: h.contact,
          latitude: parseFloat(h.latitude),
          longitude: parseFloat(h.longitude),
          status: h.status,
          distance_km: distanceKm,
          available_resources: resourceMap[h.hospital_id] || []
        };
      })
      .filter(h => h.distance_km <= radius)
      .sort((a, b) => a.distance_km - b.distance_km);

    return res.status(200).json({
      success: true,
      message: `Found ${nearby.length} hospitals within ${radius} km.`,
      data: nearby
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/patient/hospitals/:id
 * Public hospital profile
 */
async function getHospitalPublicDetails(req, res, next) {
  try {
    const hospitalId = req.params.id;
    const rows = await db.query(
      `SELECT hospital_id, name, address, area, city, contact, latitude, longitude, status 
       FROM hospitals WHERE hospital_id = ?`,
      [hospitalId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Hospital #${hospitalId} not found.`,
        error: {}
      });
    }

    const hospital = rows[0];

    const resources = await db.query(
      `SELECT resource_type, available, status 
       FROM resources WHERE hospital_id = ?`,
      [hospitalId]
    );

    return res.status(200).json({
      success: true,
      message: 'Public hospital profile retrieved.',
      data: {
        ...hospital,
        resources
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/patient-requests
 * Submits a patient resource request
 */
async function submitPatientRequest(req, res, next) {
  try {
    const { hospital_id, resource_type, reason, priority = 'MEDIUM', patient_name, patient_phone } = req.body;

    const patientUserId = req.user ? req.user.user_id : null;
    const name = patient_name || (req.user ? req.user.full_name : 'Anonymous Patient');
    const phone = patient_phone || (req.user ? req.user.phone : 'Not provided');

    // Verify hospital exists
    const hospRows = await db.query('SELECT name FROM hospitals WHERE hospital_id = ?', [hospital_id]);
    if (hospRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Hospital #${hospital_id} not found.`,
        error: {}
      });
    }

    const insertResult = await db.query(
      `INSERT INTO patient_requests 
       (patient_user_id, patient_name, patient_phone, hospital_id, resource_type, reason, priority, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
      [patientUserId, name, phone, hospital_id, resource_type, reason, priority]
    );

    const requestId = insertResult.insertId;

    // Dispatch notification to hospital coordinators and network admins
    await alertService.createNotification(db, {
      hospitalId: hospital_id,
      role: 'COORDINATOR',
      title: `New Patient Request #${requestId}`,
      message: `Patient ${name} submitted a request for ${resource_type} (Priority: ${priority}).`,
      type: 'PATIENT_REQUEST',
      severity: priority === 'CRITICAL' ? 'CRITICAL' : 'INFO',
      relatedEntityType: 'PATIENT_REQUEST',
      relatedEntityId: String(requestId)
    });

    await alertService.createNotification(db, {
      hospitalId: null,
      role: 'ADMIN',
      title: `Patient Request #${requestId} at ${hospital_id}`,
      message: `Patient request submitted for ${resource_type} at ${hospRows[0].name}.`,
      type: 'PATIENT_REQUEST',
      severity: 'INFO',
      relatedEntityType: 'PATIENT_REQUEST',
      relatedEntityId: String(requestId)
    });

    return res.status(201).json({
      success: true,
      message: 'Patient resource request submitted successfully.',
      data: {
        request_id: requestId,
        patient_user_id: patientUserId,
        patient_name: name,
        patient_phone: phone,
        hospital_id,
        hospital_name: hospRows[0].name,
        resource_type,
        reason,
        priority,
        status: 'SUBMITTED'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/patient-requests/:id
 * Tracks status of a patient request
 */
async function getPatientRequestById(req, res, next) {
  try {
    const requestId = parseInt(req.params.id, 10);
    const rows = await db.query(
      `SELECT pr.*, h.name AS hospital_name 
       FROM patient_requests pr
       JOIN hospitals h ON pr.hospital_id = h.hospital_id
       WHERE pr.request_id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Patient request #${requestId} not found.`,
        error: {}
      });
    }

    const item = rows[0];

    // If authenticated user is a patient, verify they own this request
    if (req.user && req.user.role === 'PATIENT' && item.patient_user_id) {
      if (item.patient_user_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot access another patient\'s request.',
          error: {}
        });
      }
    }

    // If coordinator, verify hospital matches
    if (req.user && req.user.role === 'COORDINATOR') {
      if (item.hospital_id !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot access patient requests for another hospital.',
          error: {}
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Patient request retrieved successfully.',
      data: item
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNearbyHospitals,
  getHospitalPublicDetails,
  submitPatientRequest,
  getPatientRequestById
};
