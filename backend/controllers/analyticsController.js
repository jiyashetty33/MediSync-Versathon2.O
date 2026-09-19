const db = require('../db');

/**
 * GET /api/analytics/coordinator
 * Returns detailed operational analytics strictly scoped to the coordinator's assigned hospital.
 */
async function getCoordinatorAnalytics(req, res, next) {
  try {
    const hospitalId = req.user.hospital_id;
    if (!hospitalId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: No assigned hospital for this coordinator.',
        error: {}
      });
    }

    // 1. Hospital Profile
    const [hospitalInfo] = await db.query(
      'SELECT hospital_id, name, area, city, contact, status FROM hospitals WHERE hospital_id = ?',
      [hospitalId]
    );

    // 2. Resource Utilization & Status
    const resources = await db.query(
      `SELECT resource_id, resource_type, total, available, occupied, reserved, utilization_percentage, status 
       FROM resources WHERE hospital_id = ? ORDER BY resource_type ASC`,
      [hospitalId]
    );

    const icuResource = resources.find(r => r.resource_type === 'ICU beds');
    const generalBeds = resources.find(r => r.resource_type === 'General beds');
    const emergencyBeds = resources.find(r => r.resource_type === 'Emergency beds');
    const ventilators = resources.find(r => r.resource_type === 'Ventilators');

    // 3. Emergency Request Trend & Breakdown
    const requestStatusBreakdown = await db.query(
      `SELECT status, COUNT(*) AS count 
       FROM emergency_requests 
       WHERE requesting_hospital_id = ? OR requested_hospital_id = ? 
       GROUP BY status`,
      [hospitalId, hospitalId]
    );

    const [inbound] = await db.query(
      'SELECT COUNT(*) as count FROM emergency_requests WHERE requested_hospital_id = ?',
      [hospitalId]
    );
    const [outbound] = await db.query(
      'SELECT COUNT(*) as count FROM emergency_requests WHERE requesting_hospital_id = ?',
      [hospitalId]
    );

    // 4. Request Response Time (Minutes between created_at and accepted / updated)
    const [responseTime] = await db.query(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, updated_at)) AS avg_response_minutes 
       FROM emergency_requests 
       WHERE requested_hospital_id = ? AND status IN ('ACCEPTED', 'RESERVED', 'ALLOCATED', 'COMPLETED')`,
      [hospitalId]
    );

    // 5. Blood Inventory Summary & Low Units
    const bloodInventory = await db.query(
      `SELECT blood_group, available_units, reserved_units, minimum_threshold,
              CASE WHEN available_units < minimum_threshold THEN 'CRITICAL_LOW' ELSE 'ADEQUATE' END AS status
       FROM blood_inventory WHERE hospital_id = ? ORDER BY blood_group ASC`,
      [hospitalId]
    );

    // 6. Resource Allocation & Handoff Stats
    const allocationStats = await db.query(
      `SELECT resource_type, COUNT(*) AS total_transfers, COALESCE(SUM(quantity), 0) AS total_units 
       FROM emergency_requests 
       WHERE requested_hospital_id = ? AND status IN ('ALLOCATED', 'COMPLETED')
       GROUP BY resource_type`,
      [hospitalId]
    );

    // 7. Active Alerts
    const activeAlerts = await db.query(
      `SELECT alert_id, alert_type, severity, resource, current_value, threshold, created_at 
       FROM critical_alerts 
       WHERE hospital_id = ? AND is_acknowledged = FALSE 
       ORDER BY created_at DESC LIMIT 10`,
      [hospitalId]
    );

    return res.status(200).json({
      success: true,
      message: `Analytics for hospital ${hospitalId} retrieved successfully.`,
      data: {
        hospital: hospitalInfo || { hospital_id: hospitalId },
        utilization: {
          overall_bed_utilization: generalBeds ? generalBeds.utilization_percentage : 0,
          icu_utilization: icuResource ? icuResource.utilization_percentage : 0,
          icu_available: icuResource ? icuResource.available : 0,
          icu_status: icuResource ? icuResource.status : 'UNKNOWN',
          emergency_bed_available: emergencyBeds ? emergencyBeds.available : 0,
          ventilators_available: ventilators ? ventilators.available : 0
        },
        resources,
        emergency_workflow: {
          inbound_requests_received: inbound.count,
          outbound_requests_sent: outbound.count,
          average_response_minutes: responseTime.avg_response_minutes ? Math.round(responseTime.avg_response_minutes * 10) / 10 : 0,
          status_breakdown: requestStatusBreakdown
        },
        blood_inventory: bloodInventory,
        resource_allocations: allocationStats,
        active_critical_alerts: activeAlerts
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/analytics/admin
 * Returns complete network-wide operational analytics across all hospitals in the region.
 */
async function getAdminAnalytics(req, res, next) {
  try {
    // 1. Overall Network Capacity Aggregates
    const [networkTotals] = await db.query(
      `SELECT 
         COALESCE(SUM(total), 0) AS total_capacity,
         COALESCE(SUM(available), 0) AS total_available,
         COALESCE(SUM(occupied), 0) AS total_occupied,
         COALESCE(SUM(reserved), 0) AS total_reserved
       FROM resources`
    );

    const overallUtilization = networkTotals.total_capacity > 0
      ? Math.round(((Number(networkTotals.total_occupied) + Number(networkTotals.total_reserved)) / Number(networkTotals.total_capacity)) * 10000) / 100
      : 0;

    // 2. ICU Network Totals
    const [icuTotals] = await db.query(
      `SELECT 
         COALESCE(SUM(total), 0) AS total_icu,
         COALESCE(SUM(available), 0) AS available_icu,
         COALESCE(SUM(occupied), 0) AS occupied_icu,
         COALESCE(SUM(reserved), 0) AS reserved_icu
       FROM resources WHERE resource_type = 'ICU beds'`
    );

    const icuUtilization = icuTotals.total_icu > 0
      ? Math.round(((Number(icuTotals.occupied_icu) + Number(icuTotals.reserved_icu)) / Number(icuTotals.total_icu)) * 10000) / 100
      : 0;

    // 3. Hospital Status Summary
    const hospitalStatusList = await db.query(
      `SELECT h.hospital_id, h.name, h.area, h.status,
              r_icu.available AS icu_available,
              r_icu.status AS icu_status,
              r_gen.available AS general_available,
              r_gen.utilization_percentage AS bed_utilization
       FROM hospitals h
       LEFT JOIN resources r_icu ON h.hospital_id = r_icu.hospital_id AND r_icu.resource_type = 'ICU beds'
       LEFT JOIN resources r_gen ON h.hospital_id = r_gen.hospital_id AND r_gen.resource_type = 'General beds'
       ORDER BY h.hospital_id ASC`
    );

    // 4. System-wide Emergency Requests Summary
    const [emergencySummary] = await db.query(
      `SELECT 
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status IN ('SENT', 'SEARCHING', 'PENDING') THEN 1 ELSE 0 END) AS pending_requests,
         SUM(CASE WHEN status IN ('ACCEPTED', 'RESERVED') THEN 1 ELSE 0 END) AS active_coordination,
         SUM(CASE WHEN status = 'ALLOCATED' THEN 1 ELSE 0 END) AS in_transit,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_transfers,
         SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_requests,
         AVG(TIMESTAMPDIFF(MINUTE, created_at, updated_at)) AS network_avg_response_minutes
       FROM emergency_requests`
    );

    // 5. Active Critical Alerts Count
    const [alertCounts] = await db.query(
      `SELECT 
         COUNT(*) AS total_alerts,
         SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
         SUM(CASE WHEN is_acknowledged = FALSE THEN 1 ELSE 0 END) AS unacknowledged_count
       FROM critical_alerts`
    );

    // 6. Blood Units Across Network
    const [bloodTotals] = await db.query(
      `SELECT 
         COALESCE(SUM(available_units), 0) AS total_available_blood_units,
         COALESCE(SUM(CASE WHEN available_units < minimum_threshold THEN 1 ELSE 0 END), 0) AS low_stock_groups_count
       FROM blood_inventory`
    );

    return res.status(200).json({
      success: true,
      message: 'Network-wide admin analytics retrieved successfully.',
      data: {
        network_capacity: {
          total_capacity: Number(networkTotals.total_capacity),
          total_available: Number(networkTotals.total_available),
          total_occupied: Number(networkTotals.total_occupied),
          total_reserved: Number(networkTotals.total_reserved),
          overall_utilization_pct: overallUtilization
        },
        icu_summary: {
          total_icu: Number(icuTotals.total_icu),
          available_icu: Number(icuTotals.available_icu),
          occupied_icu: Number(icuTotals.occupied_icu),
          reserved_icu: Number(icuTotals.reserved_icu),
          utilization_pct: icuUtilization
        },
        hospital_breakdown: hospitalStatusList,
        emergency_coordination: {
          total_requests: emergencySummary.total_requests || 0,
          pending_requests: Number(emergencySummary.pending_requests || 0),
          active_coordination: Number(emergencySummary.active_coordination || 0),
          in_transit: Number(emergencySummary.in_transit || 0),
          completed_transfers: Number(emergencySummary.completed_transfers || 0),
          rejected_requests: Number(emergencySummary.rejected_requests || 0),
          network_avg_response_minutes: emergencySummary.network_avg_response_minutes ? Math.round(emergencySummary.network_avg_response_minutes * 10) / 10 : 0
        },
        alerts: {
          total_alerts: alertCounts.total_alerts || 0,
          critical_count: Number(alertCounts.critical_count || 0),
          unacknowledged_count: Number(alertCounts.unacknowledged_count || 0)
        },
        blood_reserves: {
          total_available_units: Number(bloodTotals.total_available_blood_units),
          low_stock_groups_count: Number(bloodTotals.low_stock_groups_count)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCoordinatorAnalytics,
  getAdminAnalytics
};
