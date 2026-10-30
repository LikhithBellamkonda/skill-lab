import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import User from '../../models/User.js';
import Item from '../../models/Item.js';
import Category from '../../models/Category.js';
import AuditLog from '../../models/AuditLog.js';
import { notFound, badRequest } from '../../utils/httpError.js';
import { logSystemAction } from '../../services/audit.service.js';
import { mapItem } from '../items/items.service.js';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeItems = await Item.countDocuments({ status: 'active' });
    const resolvedItems = await Item.countDocuments({ status: 'resolved' });
    const totalCategories = await Category.countDocuments();
    res.json({ data: { totalUsers, activeItems, resolvedItems, totalCategories } });
  } catch (err) { next(err); }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}, { password_hash: 0 }).sort({ created_at: -1 });
    res.json({ data: users.map(u => ({ id: u._id, fullName: u.full_name, email: u.email, role: u.role, isActive: u.is_active, createdAt: u.created_at })) });
  } catch (err) { next(err); }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') throw badRequest('isActive must be a boolean');
    const user = await User.findById(req.params.id);
    if (!user) throw notFound('User not found');
    if (user.role === 'admin') throw badRequest('Cannot modify admin status');
    user.is_active = isActive;
    await user.save();
    await logSystemAction({ action: 'admin.user_status_changed', entityType: 'user', entityId: user._id.toString(), actorUserId: req.user.userId, newState: { isActive } });
    res.json({ data: { id: user._id, isActive: user.is_active } });
  } catch (err) { next(err); }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { entityType, entityId, action, limit = 50, offset = 0 } = req.query;
    const queryObj = {};
    if (entityType) queryObj.entity_type = entityType;
    if (entityId) queryObj.entity_id = entityId;
    if (action) queryObj.action = action;
    const total = await AuditLog.countDocuments(queryObj);
    const logs = await AuditLog.find(queryObj).sort({ created_at: -1 }).skip(parseInt(offset)).limit(parseInt(limit));
    res.json({ data: logs, meta: { total } });
  } catch (err) { next(err); }
});

router.get('/items', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const total = await Item.countDocuments();
    const items = await Item.find().sort({ created_at: -1 }).skip(offset).limit(limit);
    res.json({ data: items.map(mapItem), meta: { page, limit, total } });
  } catch (err) { next(err); }
});

const moderationSchema = z.object({ body: z.object({ status: z.enum(['active', 'resolved']), reason: z.string().trim().min(5) }) });
router.patch('/items/:id/moderation', validate(moderationSchema), async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) throw notFound('Item not found');
    item.status = req.body.status;
    await item.save();
    await logSystemAction({ action: 'admin.item_moderated', entityType: 'item', entityId: item._id.toString(), actorUserId: req.user.userId, newState: { status: req.body.status, reason: req.body.reason } });
    res.json({ data: mapItem(item) });
  } catch (err) { next(err); }
});

export default router;
