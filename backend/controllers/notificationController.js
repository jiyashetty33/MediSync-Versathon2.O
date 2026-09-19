const db = require('../db');

/**
 * GET /api/notifications
 * Returns notifications relevant to the authenticated user's role and hospital.
 */
async function getNotifications(req, res, next) {
  try {
    const user = req.user;
    let sql = 'SELECT * FROM notifications WHERE ';
    const params = [];

    if (user.role === 'COORDINATOR') {
      sql += '(hospital_id = ? OR (hospital_id IS NULL AND role = "COORDINATOR") OR user_id = ?)';
      params.push(user.hospital_id, user.user_id);
    } else if (user.role === 'ADMIN') {
      sql += '(role = "ADMIN" OR hospital_id IS NULL OR user_id = ?)';
      params.push(user.user_id);
    } else {
      // Patient
      sql += 'user_id = ?';
      params.push(user.user_id);
    }

    if (req.query.unread === 'true') {
      sql += ' AND is_read = FALSE';
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    const rows = await db.query(sql, params);

    return res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully.',
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/notifications/:id/read
 * Marks a notification as read.
 */
async function markAsRead(req, res, next) {
  try {
    const notificationId = parseInt(req.params.id, 10);
    const user = req.user;

    const notifs = await db.query('SELECT * FROM notifications WHERE notification_id = ?', [notificationId]);
    if (notifs.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Notification #${notificationId} not found.`,
        error: {}
      });
    }

    const item = notifs[0];

    // Authorization check
    if (user.role === 'COORDINATOR' && item.hospital_id && item.hospital_id !== user.hospital_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot mark another hospital\'s notification.',
        error: {}
      });
    }

    if (user.role === 'PATIENT' && item.user_id && item.user_id !== user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot mark another user\'s notification.',
        error: {}
      });
    }

    await db.query('UPDATE notifications SET is_read = TRUE WHERE notification_id = ?', [notificationId]);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: { notification_id: notificationId, is_read: true }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNotifications,
  markAsRead
};
