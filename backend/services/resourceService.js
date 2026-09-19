const db = require('../db');
const alertService = require('./alertService');

class ResourceService {
  /**
   * Validates the quantity invariant: total === available + occupied + reserved
   */
  validateQuantities(total, available, occupied, reserved) {
    const t = Number(total);
    const a = Number(available);
    const o = Number(occupied);
    const r = Number(reserved);

    if ([t, a, o, r].some(val => isNaN(val) || val < 0)) {
      return {
        valid: false,
        message: 'Resource quantities cannot be negative or non-numeric.'
      };
    }

    if (a + o + r !== t) {
      return {
        valid: false,
        message: `Quantity invariant violation: available (${a}) + occupied (${o}) + reserved (${r}) = ${a + o + r}, which does not match total (${t}).`
      };
    }

    return { valid: true };
  }

  /**
   * Calculates utilization percentage: ((occupied + reserved) / total) * 100
   */
  calculateUtilization(total, occupied, reserved) {
    const t = Number(total);
    if (t === 0) return 0.00;
    const inUse = Number(occupied) + Number(reserved);
    const pct = (inUse / t) * 100;
    return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
  }

  /**
   * Logs an entry to resource_history
   */
  async logHistory(client, {
    hospitalId,
    resourceId,
    resourceType,
    oldValue,
    newValue,
    action,
    user,
    relatedRequestId = null,
    notes = null
  }) {
    await client.query(
      `INSERT INTO resource_history 
       (hospital_id, resource_id, resource_type, old_value, new_value, action, user_id, user_email, related_request_id, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hospitalId,
        resourceId,
        resourceType,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        action,
        user ? user.user_id : null,
        user ? user.email : null,
        relatedRequestId,
        notes
      ]
    );
  }

  /**
   * Atomically updates a resource record while maintaining invariants, history logging, and threshold alerts.
   */
  async updateResource(client, {
    resourceId,
    hospitalId,
    newTotal,
    newAvailable,
    newOccupied,
    newReserved,
    user,
    action = 'MANUAL_UPDATE',
    relatedRequestId = null,
    notes = null
  }) {
    // 1. Fetch current resource row FOR UPDATE
    const currentRows = await client.query(
      'SELECT * FROM resources WHERE resource_id = ? AND hospital_id = ? FOR UPDATE',
      [resourceId, hospitalId]
    );

    if (currentRows.length === 0) {
      const err = new Error(`Resource #${resourceId} not found for hospital ${hospitalId}`);
      err.statusCode = 404;
      throw err;
    }

    const current = currentRows[0];
    const total = newTotal !== undefined ? Number(newTotal) : current.total;
    const available = newAvailable !== undefined ? Number(newAvailable) : current.available;
    const occupied = newOccupied !== undefined ? Number(newOccupied) : current.occupied;
    const reserved = newReserved !== undefined ? Number(newReserved) : current.reserved;

    // 2. Validate invariant
    const validation = this.validateQuantities(total, available, occupied, reserved);
    if (!validation.valid) {
      const err = new Error(validation.message);
      err.statusCode = 400;
      throw err;
    }

    // 3. Check thresholds & calculate status
    const status = await alertService.checkResourceAlerts(
      client,
      hospitalId,
      resourceId,
      current.resource_type,
      available
    );

    // 4. Calculate utilization
    const utilization = this.calculateUtilization(total, occupied, reserved);

    // 5. Update resource record
    await client.query(
      `UPDATE resources 
       SET total = ?, available = ?, occupied = ?, reserved = ?, utilization_percentage = ?, status = ?, updated_at = NOW() 
       WHERE resource_id = ?`,
      [total, available, occupied, reserved, utilization, status, resourceId]
    );

    // 6. Log history
    const oldValue = {
      total: current.total,
      available: current.available,
      occupied: current.occupied,
      reserved: current.reserved,
      status: current.status
    };

    const newValue = {
      total,
      available,
      occupied,
      reserved,
      status
    };

    await this.logHistory(client, {
      hospitalId,
      resourceId,
      resourceType: current.resource_type,
      oldValue,
      newValue,
      action,
      user,
      relatedRequestId,
      notes
    });

    return {
      resource_id: resourceId,
      hospital_id: hospitalId,
      resource_type: current.resource_type,
      total,
      available,
      occupied,
      reserved,
      utilization_percentage: utilization,
      status
    };
  }
}

module.exports = new ResourceService();
