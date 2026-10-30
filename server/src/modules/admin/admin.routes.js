import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import User from '../../models/User.js';
import Item from '../../models/Item.js';
import Claim from '../../models/Claim.js';
import Match from '../../models/Match.js';
import AuditLog from '../../models/AuditLog.js';
import { conflict, notFound } from '../../utils/httpError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendOk } from '../../utils/respond.js';
import { checkConnection } from '../../config/db.js';
import { logSystemAction } from '../../services/audit.service.js';
import { mapItem } from '../items/items.service.js';
import * as notificationService from '../../services/notification.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB id');
const pagination = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};
const userIdParams = z.object({ userId: objectId });
const itemIdParams = z.object({ itemId: objectId });
const userStatusBody = z.object({ isActive: z.boolean() });
const userQuery = z.object({
  ...pagination,
  role: z.enum(['user', 'admin']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
const itemsQuery = z.object({
  ...pagination,
  type: z.enum(['lost', 'found']).optional(),
  status: z.enum(['open', 'matched', 'claimed', 'returned', 'closed', 'rejected']).optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
const auditQuery = z.object({
  ...pagination,
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorUserId: objectId.optional(),
});
const moderationBody = z
  .object({
    action: z.enum(['approve', 'close', 'reject']),
    reason: z.string().trim().max(1000).nullish(),
  })
  .refine((value) => value.action !== 'reject' || Boolean(value.reason?.length), {
    path: ['reason'],
    message: 'A reason is required when rejecting a report.',
  });

const router = Router();
router.use(authenticate, requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [
      totalItems,
      lostItems,
      foundItems,
      returnedItems,
      totalMatches,
      suggestedMatches,
      totalClaims,
      pendingClaims,
      totalUsers,
      inactiveUsers,
      database,
    ] = await Promise.all([
      Item.countDocuments({ deleted_at: null }),
      Item.countDocuments({ type: 'lost', deleted_at: null }),
      Item.countDocuments({ type: 'found', deleted_at: null }),
      Item.countDocuments({ status: 'returned', deleted_at: null }),
      Match.countDocuments(),
      Match.countDocuments({ status: 'suggested' }),
      Claim.countDocuments(),
      Claim.countDocuments({ status: 'pending' }),
      User.countDocuments(),
      User.countDocuments({ is_active: false }),
      checkConnection(),
    ]);
    return sendOk(res, {
      items: { total: totalItems, lost: lostItems, found: foundItems, returned: returnedItems },
      matches: { total: totalMatches, suggested: suggestedMatches },
      claims: { total: totalClaims, pending: pendingClaims },
      users: { total: totalUsers, inactive: inactiveUsers },
      database: { name: database.database ?? 'unavailable', connected: database.ok },
    });
  })
);

router.get(
  '/users',
  validate({ query: userQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, role, isActive } = req.validatedQuery;
    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.is_active = isActive;
    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query, { password_hash: 0 })
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    return sendOk(
      res,
      users.map((user) => ({
        userId: user._id.toString(),
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
      })),
      { page, limit, total }
    );
  })
);

router.patch(
  '/users/:userId/status',
  validate({ params: userIdParams, body: userStatusBody }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) throw notFound('User not found');
    if (user.role === 'admin') throw conflict('Administrator accounts cannot be changed here.');
    user.is_active = req.body.isActive;
    await user.save();
    await logSystemAction({
      action: 'admin.user_status_changed',
      entityType: 'user',
      entityId: user._id.toString(),
      actorUserId: req.user.userId,
      newState: { isActive: user.is_active },
    });
    return sendOk(res, { userId: user._id.toString(), isActive: user.is_active });
  })
);

router.get(
  '/audit-logs',
  validate({ query: auditQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, action, entityType, entityId, actorUserId } = req.validatedQuery;
    const query = {};
    if (action) query.action = action;
    if (entityType) query.entity_type = entityType;
    if (entityId) query.entity_id = entityId;
    if (actorUserId) query.actor_user_id = actorUserId;
    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query)
        .populate('actor_user_id', 'full_name')
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    return sendOk(
      res,
      logs.map((log) => ({
        auditId: log._id.toString(),
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_id,
        actorName: log.actor_user_id?.full_name ?? null,
        actorUserId: log.actor_user_id?._id?.toString() ?? null,
        metadata: log.new_state ?? {},
        createdAt: log.created_at,
      })),
      { page, limit, total }
    );
  })
);

router.get(
  '/items',
  validate({ query: itemsQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, type, status, includeDeleted } = req.validatedQuery;
    const query = {};
    if (!includeDeleted) query.deleted_at = null;
    if (type) query.type = type;
    if (status) query.status = status;
    const [total, items] = await Promise.all([
      Item.countDocuments(query),
      Item.find(query)
        .populate('category_id', 'name description')
        .populate('user_id', 'full_name email')
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    const rows = await Promise.all(
      items.map(async (item) => {
        const [matchCount, pendingClaims] = await Promise.all([
          Match.countDocuments({ $or: [{ item1_id: item._id }, { item2_id: item._id }] }),
          Claim.countDocuments({ item_id: item._id, status: 'pending' }),
        ]);
        return {
          ...mapItem(item, { includePrivate: true }),
          matchCount,
          pendingClaims,
          hasPrivateDetails: Boolean(item.verification_hint),
        };
      })
    );
    return sendOk(res, rows, { page, limit, total });
  })
);

router.get(
  '/items/:itemId',
  validate({ params: itemIdParams }),
  asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.itemId)
      .populate('category_id', 'name description')
      .populate('user_id', 'full_name email');
    if (!item) throw notFound('Item not found');
    return sendOk(res, mapItem(item, { includePrivate: true }));
  })
);

router.patch(
  '/items/:itemId/moderation',
  validate({ params: itemIdParams, body: moderationBody }),
  asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.itemId);
    if (!item) throw notFound('Item not found');
    if (item.deleted_at) throw conflict('Deleted reports cannot be moderated.');
    const nextStatus = {
      approve: 'open',
      close: 'closed',
      reject: 'rejected',
    }[req.body.action];
    item.status = nextStatus;
    item.closed_at = ['closed', 'rejected'].includes(nextStatus) ? new Date() : null;
    await item.save();
    await Promise.all([
      logSystemAction({
        action: 'item.moderated',
        entityType: 'item',
        entityId: item._id.toString(),
        actorUserId: req.user.userId,
        newState: { action: req.body.action, reason: req.body.reason ?? null },
      }),
      notificationService.createNotification({
        user_id: item.user_id,
        type: 'moderation',
        title: `Your report was ${{ approve: 'reopened', close: 'closed', reject: 'rejected' }[req.body.action]}`,
        content:
          req.body.reason ||
          `The report "${item.title}" was ${{ approve: 'reopened', close: 'closed', reject: 'rejected' }[req.body.action]}.`,
        reference_id: item._id,
        reference_type: 'item',
      }),
    ]);
    const updated = await Item.findById(item._id)
      .populate('category_id', 'name description')
      .populate('user_id', 'full_name email');
    return sendOk(res, mapItem(updated, { includePrivate: true }));
  })
);

export default router;
