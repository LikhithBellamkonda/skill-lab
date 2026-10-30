import bcrypt from 'bcryptjs';
import User from '../../models/User.js';
import Item from '../../models/Item.js';
import Claim from '../../models/Claim.js';
import Notification from '../../models/Notification.js';
import { badRequest, conflict, unauthorized } from '../../utils/httpError.js';
import * as auditService from '../../services/audit.service.js';
import { signToken } from '../../utils/jwt.js';

export function mapUser(row) {
  return {
    userId: row._id.toString(),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function register(body) {
  const { email, password, fullName } = body;
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw conflict('Email address is already in use');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const user = await User.create({
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: fullName.trim(),
  });
  await auditService.logSystemAction({
    action: 'user.registered',
    entityType: 'user',
    entityId: user._id.toString(),
    actorUserId: user._id,
  });
  return {
    user: mapUser(user),
    token: signToken({ userId: user._id.toString(), role: user.role }),
  };
}
export async function login(body) {
  const { email, password } = body;
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail, is_active: true });
  if (!user) throw unauthorized('Invalid credentials or inactive account');
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw unauthorized('Invalid credentials or inactive account');
  await auditService.logSystemAction({
    action: 'user.login',
    entityType: 'user',
    entityId: user._id.toString(),
    actorUserId: user._id,
  });
  return {
    user: mapUser(user),
    token: signToken({ userId: user._id.toString(), role: user.role }),
  };
}
export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user || !user.is_active) throw unauthorized('Account inactive or not found');
  const [itemCount, claimCount, unreadNotificationCount] = await Promise.all([
    Item.countDocuments({ user_id: userId, deleted_at: null }),
    Claim.countDocuments({ user_id: userId }),
    Notification.countDocuments({ user_id: userId, is_read: false }),
  ]);
  return { ...mapUser(user), stats: { itemCount, claimCount, unreadNotificationCount } };
}
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId);
  if (!user || !user.is_active) throw unauthorized('User not found or inactive');
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw badRequest('Current password is incorrect');
  const salt = await bcrypt.genSalt(10);
  user.password_hash = await bcrypt.hash(newPassword, salt);
  await user.save();
  return true;
}
export default { mapUser, register, login, getProfile, changePassword };
