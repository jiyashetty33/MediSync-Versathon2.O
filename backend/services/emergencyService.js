const db = require('../db');
const alertService = require('./alertService');
const resourceService = require('./resourceService');

// Valid state machine transitions
const ALLOWED_TRANSITIONS = {
  PENDING: ['SEARCHING', 'SENT', 'CANCELLED'],
  SEARCHING: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['RESERVED', 'CANCELLED'],
  RESERVED: ['ALLOCATED', 'CANCELLED'],
  ALLOCATED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: []
};

class EmergencyService {
  /**
   * Validates if a transition is legal in the state machine
   */
  isValidTransition(currentStatus, nextStatus) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(nextStatus);
  }

  /**
   * Creates a new emergency resource request inside a transaction
   */
  async createRequest(client, {
    requestingHospitalId,
    requestedHospitalId,
    resourceType,
    quantity = 1,
    priority = 'HIGH',
    reason,
    notes = null,
    requiredBy = null,
    user
  }) {
    if (requestingHospitalId === requestedHospitalId) {
      const err = new Error('Requesting hospital and requested hospital cannot be the same.');
      err.statusCode = 400;
      throw err;
    }

    // Find resource row for target hospital if exists
    const resRows = await client.query(
      'SELECT resource_id, available FROM resources WHERE hospital_id = ? AND resource_type = ?',
      [requestedHospitalId, resourceType]
    );

    const resourceId = resRows.length > 0 ? resRows[0].resource_id : null;

    // Direct creation moves to 'SENT' so target hospital can act immediately
    const initialStatus = 'SENT';

    const insertResult = await client.query(
      `INSERT INTO emergency_requests 
       (requesting_hospital_id, requested_hospital_id, resource_type, resource_id, quantity, priority, reason, notes, required_by, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestingHospitalId,
        requestedHospitalId,
        resourceType,
        resourceId,
        quantity,
        priority,
        reason,
        notes,
        requiredBy,
        initialStatus
      ]
    );

    const requestId = insertResult.insertId;

    // Create notifications for requested hospital coordinator and network admins
    await alertService.createNotification(client, {
      hospitalId: requestedHospitalId,
      role: 'COORDINATOR',
      title: `Emergency Resource Request #${requestId}`,
      message: `Hospital ${requestingHospitalId} has requested ${quantity} x ${resourceType} with priority ${priority}.`,
      type: 'EMERGENCY_REQUEST',
      severity: priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    await alertService.createNotification(client, {
      hospitalId: null, // Admin global
      role: 'ADMIN',
      title: `New Emergency Request: ${requestingHospitalId} -> ${requestedHospitalId}`,
      message: `Emergency coordination started: ${quantity} x ${resourceType} (${priority} priority).`,
      type: 'EMERGENCY_REQUEST',
      severity: 'INFO',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    return {
      request_id: requestId,
      requesting_hospital_id: requestingHospitalId,
      requested_hospital_id: requestedHospitalId,
      resource_type: resourceType,
      resource_id: resourceId,
      quantity,
      priority,
      reason,
      notes,
      required_by: requiredBy,
      status: initialStatus
    };
  }

  /**
   * Accepts an emergency request (requested hospital coordinator or admin)
   */
  async acceptRequest(client, requestId, user, notes = null) {
    const request = await this.lockAndFetchRequest(client, requestId);

    if (!this.isValidTransition(request.status, 'ACCEPTED')) {
      const err = new Error(`Invalid state transition: Cannot transition from ${request.status} to ACCEPTED.`);
      err.statusCode = 409;
      throw err;
    }

    await client.query(
      'UPDATE emergency_requests SET status = "ACCEPTED", notes = COALESCE(?, notes), updated_at = NOW() WHERE request_id = ?',
      [notes, requestId]
    );

    // Notify requesting hospital
    await alertService.createNotification(client, {
      hospitalId: request.requesting_hospital_id,
      role: 'COORDINATOR',
      title: `Emergency Request #${requestId} ACCEPTED`,
      message: `Hospital ${request.requested_hospital_id} has accepted your request for ${request.quantity} x ${request.resource_type}. Next step: Resource Reservation.`,
      type: 'EMERGENCY_ACCEPTED',
      severity: 'INFO',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    return { ...request, status: 'ACCEPTED' };
  }

  /**
   * Rejects an emergency request
   */
  async rejectRequest(client, requestId, user, reason = 'Resource unavailable') {
    const request = await this.lockAndFetchRequest(client, requestId);

    if (!this.isValidTransition(request.status, 'REJECTED')) {
      const err = new Error(`Invalid state transition: Cannot transition from ${request.status} to REJECTED.`);
      err.statusCode = 409;
      throw err;
    }

    await client.query(
      'UPDATE emergency_requests SET status = "REJECTED", notes = CONCAT(COALESCE(notes, ""), " [Rejection Reason: ", ?, "]"), updated_at = NOW() WHERE request_id = ?',
      [reason, requestId]
    );

    // Notify requesting hospital
    await alertService.createNotification(client, {
      hospitalId: request.requesting_hospital_id,
      role: 'COORDINATOR',
      title: `Emergency Request #${requestId} REJECTED`,
      message: `Hospital ${request.requested_hospital_id} was unable to fulfill your request for ${request.quantity} x ${request.resource_type}. Reason: ${reason}.`,
      type: 'EMERGENCY_REJECTED',
      severity: 'WARNING',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    return { ...request, status: 'REJECTED' };
  }

  /**
   * Reserves the resource at the requested hospital
   */
  async reserveRequest(client, requestId, user) {
    const request = await this.lockAndFetchRequest(client, requestId);

    if (!this.isValidTransition(request.status, 'RESERVED')) {
      const err = new Error(`Invalid state transition: Cannot transition from ${request.status} to RESERVED.`);
      err.statusCode = 409;
      throw err;
    }

    // Lock resource row of requested hospital
    const resRows = await client.query(
      'SELECT * FROM resources WHERE hospital_id = ? AND resource_type = ? FOR UPDATE',
      [request.requested_hospital_id, request.resource_type]
    );

    if (resRows.length === 0) {
      const err = new Error(`Target hospital ${request.requested_hospital_id} has no registered resource for ${request.resource_type}`);
      err.statusCode = 404;
      throw err;
    }

    const resItem = resRows[0];
    if (resItem.available < request.quantity) {
      const err = new Error(`Insufficient resources: Hospital ${request.requested_hospital_id} has only ${resItem.available} available ${request.resource_type}, but ${request.quantity} requested.`);
      err.statusCode = 409;
      throw err;
    }

    // Update quantities: available decreases, reserved increases
    const newAvailable = resItem.available - request.quantity;
    const newReserved = resItem.reserved + request.quantity;

    await resourceService.updateResource(client, {
      resourceId: resItem.resource_id,
      hospitalId: request.requested_hospital_id,
      newTotal: resItem.total,
      newAvailable,
      newOccupied: resItem.occupied,
      newReserved,
      user,
      action: 'RESERVE_EMERGENCY',
      relatedRequestId: requestId,
      notes: `Reserved ${request.quantity} x ${request.resource_type} for emergency request #${requestId} from ${request.requesting_hospital_id}`
    });

    // Update request state & link resource_id
    await client.query(
      'UPDATE emergency_requests SET status = "RESERVED", resource_id = ?, updated_at = NOW() WHERE request_id = ?',
      [resItem.resource_id, requestId]
    );

    // Send notifications
    await alertService.createNotification(client, {
      hospitalId: request.requesting_hospital_id,
      role: 'COORDINATOR',
      title: `Resources RESERVED: Request #${requestId}`,
      message: `${request.quantity} x ${request.resource_type} has been safely reserved at Hospital ${request.requested_hospital_id}. Ready for allocation/dispatch.`,
      type: 'RESOURCE_RESERVED',
      severity: 'INFO',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    return {
      ...request,
      status: 'RESERVED',
      resource_id: resItem.resource_id,
      reserved_resource: {
        hospital_id: request.requested_hospital_id,
        available: newAvailable,
        reserved: newReserved
      }
    };
  }

  /**
   * Allocates the resource (completing transfer / dispatch)
   */
  async allocateRequest(client, requestId, user) {
    const request = await this.lockAndFetchRequest(client, requestId);

    if (!this.isValidTransition(request.status, 'ALLOCATED')) {
      const err = new Error(`Invalid state transition: Cannot transition from ${request.status} to ALLOCATED.`);
      err.statusCode = 409;
      throw err;
    }

    const resRows = await client.query(
      'SELECT * FROM resources WHERE hospital_id = ? AND resource_type = ? FOR UPDATE',
      [request.requested_hospital_id, request.resource_type]
    );

    if (resRows.length === 0) {
      const err = new Error('Resource record not found for allocation.');
      err.statusCode = 404;
      throw err;
    }

    const resItem = resRows[0];
    if (resItem.reserved < request.quantity) {
      const err = new Error(`Allocation error: Reserved quantity (${resItem.reserved}) is less than required quantity (${request.quantity}).`);
      err.statusCode = 409;
      throw err;
    }

    // Update quantities: reserved decreases, occupied increases (resource in use for this transfer)
    const newReserved = resItem.reserved - request.quantity;
    const newOccupied = resItem.occupied + request.quantity;

    await resourceService.updateResource(client, {
      resourceId: resItem.resource_id,
      hospitalId: request.requested_hospital_id,
      newTotal: resItem.total,
      newAvailable: resItem.available,
      newOccupied,
      newReserved,
      user,
      action: 'ALLOCATE_EMERGENCY',
      relatedRequestId: requestId,
      notes: `Allocated and dispatched ${request.quantity} x ${request.resource_type} for emergency transfer #${requestId} to Hospital ${request.requesting_hospital_id}`
    });

    await client.query(
      'UPDATE emergency_requests SET status = "ALLOCATED", updated_at = NOW() WHERE request_id = ?',
      [requestId]
    );

    // Notify requesting hospital and admins
    await alertService.createNotification(client, {
      hospitalId: request.requesting_hospital_id,
      role: 'COORDINATOR',
      title: `Resource ALLOCATED: Request #${requestId}`,
      message: `${request.quantity} x ${request.resource_type} has been allocated and dispatched from ${request.requested_hospital_id}.`,
      type: 'RESOURCE_ALLOCATED',
      severity: 'INFO',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    return {
      ...request,
      status: 'ALLOCATED',
      allocated_resource: {
        hospital_id: request.requested_hospital_id,
        occupied: newOccupied,
        reserved: newReserved
      }
    };
  }

  /**
   * Completes the emergency request after successful handoff
   */
  async completeRequest(client, requestId, user) {
    const request = await this.lockAndFetchRequest(client, requestId);

    if (!this.isValidTransition(request.status, 'COMPLETED')) {
      const err = new Error(`Invalid state transition: Cannot transition from ${request.status} to COMPLETED.`);
      err.statusCode = 409;
      throw err;
    }

    await client.query(
      'UPDATE emergency_requests SET status = "COMPLETED", updated_at = NOW() WHERE request_id = ?',
      [requestId]
    );

    await alertService.createNotification(client, {
      hospitalId: request.requested_hospital_id,
      role: 'COORDINATOR',
      title: `Emergency Request #${requestId} COMPLETED`,
      message: `Transfer complete for ${request.quantity} x ${request.resource_type}. Patient handoff confirmed.`,
      type: 'EMERGENCY_COMPLETED',
      severity: 'INFO',
      relatedEntityType: 'EMERGENCY_REQUEST',
      relatedEntityId: String(requestId)
    });

    return { ...request, status: 'COMPLETED' };
  }

  /**
   * Cancels a request and reverses any reserved resources
   */
  async cancelRequest(client, requestId, user, reason = 'Cancelled by coordinator') {
    const request = await this.lockAndFetchRequest(client, requestId);

    if (!this.isValidTransition(request.status, 'CANCELLED')) {
      const err = new Error(`Invalid state transition: Request #${requestId} is in status ${request.status} and cannot be cancelled.`);
      err.statusCode = 409;
      throw err;
    }

    // If already reserved, release the reservation back to available!
    if (request.status === 'RESERVED') {
      const resRows = await client.query(
        'SELECT * FROM resources WHERE hospital_id = ? AND resource_type = ? FOR UPDATE',
        [request.requested_hospital_id, request.resource_type]
      );
      if (resRows.length > 0) {
        const resItem = resRows[0];
        const newReserved = Math.max(0, resItem.reserved - request.quantity);
        const newAvailable = resItem.available + request.quantity;

        await resourceService.updateResource(client, {
          resourceId: resItem.resource_id,
          hospitalId: request.requested_hospital_id,
          newTotal: resItem.total,
          newAvailable,
          newOccupied: resItem.occupied,
          newReserved,
          user,
          action: 'CANCEL_RESERVATION',
          relatedRequestId: requestId,
          notes: `Reservation rollback: Cancelled emergency request #${requestId}`
        });
      }
    }

    await client.query(
      'UPDATE emergency_requests SET status = "CANCELLED", notes = CONCAT(COALESCE(notes, ""), " [Cancellation Reason: ", ?, "]"), updated_at = NOW() WHERE request_id = ?',
      [reason, requestId]
    );

    return { ...request, status: 'CANCELLED' };
  }

  /**
   * Helper to select and lock request row
   */
  async lockAndFetchRequest(client, requestId) {
    const rows = await client.query(
      'SELECT * FROM emergency_requests WHERE request_id = ? FOR UPDATE',
      [requestId]
    );
    if (rows.length === 0) {
      const err = new Error(`Emergency request #${requestId} not found.`);
      err.statusCode = 404;
      throw err;
    }
    return rows[0];
  }
}

module.exports = new EmergencyService();
