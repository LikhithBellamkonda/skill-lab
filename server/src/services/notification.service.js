import Notification from '../models/Notification.js';
export async function createNotification(data) { return await Notification.create(data); }
export async function getNotifications(userId) { return await Notification.find({ user_id: userId }).sort({ created_at: -1 }).limit(50); }
export async function markAsRead(notificationId) { return await Notification.findByIdAndUpdate(notificationId, { is_read: true }, { new: true }); }
export default { createNotification, getNotifications, markAsRead };
