import Notification from '../models/Notification.js';

function mapNotification(notification) {
  return {
    notificationId: notification._id.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.content,
    isRead: notification.is_read,
    relatedItemId:
      notification.reference_type === 'item' ? notification.reference_id?.toString() : null,
    relatedClaimId:
      notification.reference_type === 'claim' ? notification.reference_id?.toString() : null,
    createdAt: notification.created_at,
  };
}

export async function createNotification(data) {
  return Notification.create(data);
}

export async function listForUser(userId, { unreadOnly = false, offset = 0, limit = 20 } = {}) {
  const query = { user_id: userId };
  if (unreadOnly) query.is_read = false;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ created_at: -1 }).skip(offset).limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ user_id: userId, is_read: false }),
  ]);
  return { rows: notifications.map(mapNotification), total, unreadCount };
}

export async function unreadCount(userId) {
  return Notification.countDocuments({ user_id: userId, is_read: false });
}

export async function markRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user_id: userId },
    { $set: { is_read: true } },
    { new: true }
  );
  return notification ? mapNotification(notification) : null;
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { user_id: userId, is_read: false },
    { $set: { is_read: true } }
  );
  return result.modifiedCount;
}

export async function getNotifications(userId) {
  const result = await listForUser(userId, { limit: 50 });
  return result.rows;
}

export async function markAsRead(notificationId, userId) {
  return markRead(userId, notificationId);
}

export default {
  createNotification,
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
  getNotifications,
  markAsRead,
};
