const { db } = require('../database/db');

/**
 * Internal helper to create an in-app notification for a user
 * @param {Object} param0 { userId, title, message, type }
 */
async function createInAppNotification({ userId, title, message, type = 'info' }) {
  try {
    if (!userId || !title || !message) return null;
    const result = await db.runAsync(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES (?, ?, ?, ?, 0)`,
      [userId, title, message, type]
    );
    return result.lastID;
  } catch (err) {
    console.error('[Notification] Failed to create in-app notification:', err.message);
    return null;
  }
}

/**
 * Auto-seed friendly starter notifications if a user has no notifications yet
 */
async function ensureStarterNotifications(userId) {
  try {
    const countResult = await db.getAsync(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ?',
      [userId]
    );
    if (countResult && countResult.cnt === 0) {
      await db.runAsync(
        `INSERT INTO notifications (user_id, title, message, type, is_read)
         VALUES 
         (?, 'Welcome to SolWash Solar Care! ☀️', 'Thank you for choosing SolWash. Book your rooftop solar washing in just 2 taps!', 'system', 0),
         (?, 'Boost Solar Power by 30% ⚡', 'Dust and bird droppings decrease panel efficiency quickly. Schedule regular cleaning to maximize power generation!', 'promo', 0)`,
        [userId, userId]
      );
    }
  } catch (err) {
    console.warn('[Notification] Starter notification warning:', err.message);
  }
}

// GET /api/notifications
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    await ensureStarterNotifications(userId);

    const notifications = await db.allAsync(
      `SELECT * FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );

    const unreadResult = await db.getAsync(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    return res.json({
      success: true,
      unreadCount: unreadResult ? unreadResult.unread_count : 0,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications.',
      error: error.message
    });
  }
};

// PUT /api/notifications/:id/read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await db.runAsync(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    return res.json({
      success: true,
      message: 'Notification marked as read.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update notification.',
      error: error.message
    });
  }
};

// POST /api/notifications/mark-all-read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await db.runAsync(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );

    return res.json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read.',
      error: error.message
    });
  }
};

// DELETE /api/notifications/:id
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await db.runAsync(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    return res.json({
      success: true,
      message: 'Notification deleted.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete notification.',
      error: error.message
    });
  }
};

// POST /api/notifications (create notification, e.g. for testing or admin alert)
exports.createNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required.'
      });
    }

    const notifId = await createInAppNotification({
      userId,
      title,
      message,
      type: type || 'info'
    });

    return res.status(201).json({
      success: true,
      message: 'Notification created successfully.',
      data: { id: notifId }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create notification.',
      error: error.message
    });
  }
};

module.exports = {
  ...exports,
  createInAppNotification
};
