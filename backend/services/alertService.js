const db = require('../db');

/**
 * Service to handle alert evaluation, alert persistence, and notification dispatch.
 */
class AlertService {
  /**
   * Evaluates resource availability against thresholds and triggers alerts/notifications if needed.
   * @param {object} client - db pool or active transaction connection
   * @param {string} hospitalId 
   * @param {number} resourceId 
   * @param {string} resourceType 
   * @param {number} availableValue 
   * @returns {Promise<string>} - Updated resource status ('CRITICAL' | 'LOW' | 'NORMAL')
   */
  async checkResourceAlerts(client, hospitalId, resourceId, resourceType, availableValue) {
    // 1. Fetch threshold configuration (hospital specific or global default)
    const thresholdRows = await client.query(
      `SELECT critical_threshold, low_threshold 
       FROM thresholds 
       WHERE (hospital_id = ? OR hospital_id IS NULL) AND resource_type = ? 
       ORDER BY hospital_id DESC LIMIT 1`,
      [hospitalId, resourceType]
    );

    const thresholds = thresholdRows[0] || { critical_threshold: 1, low_threshold: 2 };
    let status = 'NORMAL';
    let alertSeverity = null;
    let thresholdValue = null;

    if (availableValue <= thresholds.critical_threshold) {
      status = 'CRITICAL';
      alertSeverity = 'CRITICAL';
      thresholdValue = thresholds.critical_threshold;
    } else if (availableValue <= thresholds.low_threshold) {
      status = 'LOW';
      alertSeverity = 'WARNING';
      thresholdValue = thresholds.low_threshold;
    }

    // If threshold breached and alert is needed
    if (alertSeverity) {
      // Check if an unacknowledged alert already exists in the last 15 minutes to prevent alert fatigue
      const existingAlerts = await client.query(
        `SELECT alert_id FROM critical_alerts 
         WHERE hospital_id = ? AND resource = ? AND is_acknowledged = FALSE 
           AND created_at >= NOW() - INTERVAL 15 MINUTE`,
        [hospitalId, resourceType]
      );

      if (existingAlerts.length === 0) {
        await client.query(
          `INSERT INTO critical_alerts 
           (hospital_id, resource_id, alert_type, severity, resource, current_value, threshold, is_acknowledged) 
           VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
          [hospitalId, resourceId, `RESOURCE_${alertSeverity}`, alertSeverity, resourceType, availableValue, thresholdValue]
        );

        // Notify Hospital Coordinators
        await this.createNotification(client, {
          hospitalId,
          role: 'COORDINATOR',
          title: `${alertSeverity} ALERT: ${resourceType} at Hospital ${hospitalId}`,
          message: `${resourceType} available count is now ${availableValue} (Threshold: ${thresholdValue}). Immediate coordination advised.`,
          type: 'CRITICAL_ALERT',
          severity: alertSeverity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          relatedEntityType: 'RESOURCE',
          relatedEntityId: String(resourceId)
        });

        // Notify Admins
        await this.createNotification(client, {
          hospitalId: null, // Global
          role: 'ADMIN',
          title: `Network Alert: ${hospitalId} - ${resourceType}`,
          message: `Hospital ${hospitalId} reports ${resourceType} status as ${alertSeverity} (Available: ${availableValue}).`,
          type: 'CRITICAL_ALERT',
          severity: alertSeverity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          relatedEntityType: 'RESOURCE',
          relatedEntityId: String(resourceId)
        });
      }
    }

    return status;
  }

  /**
   * Evaluates blood inventory levels and creates alerts if below minimum.
   */
  async checkBloodAlerts(client, hospitalId, bloodGroup, availableUnits, minimumThreshold) {
    if (availableUnits < minimumThreshold) {
      const existing = await client.query(
        `SELECT alert_id FROM critical_alerts 
         WHERE hospital_id = ? AND resource = ? AND is_acknowledged = FALSE 
           AND created_at >= NOW() - INTERVAL 30 MINUTE`,
        [hospitalId, `Blood ${bloodGroup}`]
      );

      if (existing.length === 0) {
        await client.query(
          `INSERT INTO critical_alerts 
           (hospital_id, resource_id, alert_type, severity, resource, current_value, threshold, is_acknowledged) 
           VALUES (?, NULL, 'BLOOD_INVENTORY_LOW', 'WARNING', ?, ?, ?, FALSE)`,
          [hospitalId, `Blood ${bloodGroup}`, availableUnits, minimumThreshold]
        );

        await this.createNotification(client, {
          hospitalId,
          role: 'COORDINATOR',
          title: `Blood Inventory Low: ${bloodGroup}`,
          message: `Blood group ${bloodGroup} units have dropped to ${availableUnits} (Minimum: ${minimumThreshold}). Replenishment needed.`,
          type: 'BLOOD_ALERT',
          severity: 'WARNING',
          relatedEntityType: 'BLOOD_INVENTORY',
          relatedEntityId: bloodGroup
        });
      }
    }
  }

  /**
   * Inserts a notification record.
   */
  async createNotification(client, {
    hospitalId = null,
    userId = null,
    role = null,
    title,
    message,
    type,
    severity = 'INFO',
    relatedEntityType = null,
    relatedEntityId = null
  }) {
    await client.query(
      `INSERT INTO notifications 
       (hospital_id, user_id, role, title, message, type, severity, is_read, related_entity_type, related_entity_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
      [hospitalId, userId, role, title, message, type, severity, relatedEntityType, relatedEntityId]
    );
  }
}

module.exports = new AlertService();
