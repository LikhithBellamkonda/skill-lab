import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import Match from '../../models/Match.js';
import Item from '../../models/Item.js';
import { notFound, forbidden, badRequest } from '../../utils/httpError.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import * as auditService from '../../services/audit.service.js';
import * as matchingService from './../../services/matching.service.js';

export const matchesRouter = Router();
matchesRouter.use(authenticate);

const matchIdParamSchema = z.object({ matchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Match ID') });

matchesRouter.get('/:matchId', validate({ params: matchIdParamSchema }), async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.matchId).populate('item1_id item2_id');
    if (!match) throw notFound('Match not found');
    const item1Owner = match.item1_id.user_id.toString() === req.user.userId;
    const item2Owner = match.item2_id.user_id.toString() === req.user.userId;
    if (!item1Owner && !item2Owner && req.user.role !== 'admin') throw forbidden('Access denied');
    res.json({ data: match });
  } catch (err) { next(err); }
});

matchesRouter.post('/:matchId/dismiss', validate({ params: matchIdParamSchema }), async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) throw notFound('Match not found');
    const item1 = await Item.findById(match.item1_id);
    const item2 = await Item.findById(match.item2_id);
    const item1Owner = item1.user_id.toString() === req.user.userId;
    const item2Owner = item2.user_id.toString() === req.user.userId;
    if (!item1Owner && !item2Owner && req.user.role !== 'admin') throw forbidden('Access denied');
    if (match.status !== 'pending') throw badRequest('Match is not pending');
    match.status = 'rejected';
    await match.save();
    await auditService.logSystemAction({ action: 'match.dismissed', entityType: 'match', entityId: match._id.toString(), actorUserId: req.user.userId });
    res.json({ data: match });
  } catch (err) { next(err); }
});

matchesRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const items = await Item.find({ user_id: userId });
    const itemIds = items.map(i => i._id);
    const matches = await Match.find({ $or: [{ item1_id: { $in: itemIds } }, { item2_id: { $in: itemIds } }] }).populate('item1_id item2_id').sort({ score: -1 });
    res.json({ data: matches, meta: { total: matches.length } });
  } catch (err) { next(err); }
});

matchesRouter.post('/recalculate', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') throw forbidden('Admin only');
    const items = await Item.find({ status: 'active' });
    for (const item of items) await matchingService.findMatchesForItem(item._id);
    res.json({ data: { message: 'Recalculation started' } });
  } catch (err) { next(err); }
});

export const itemMatchesRouter = Router({ mergeParams: true });
itemMatchesRouter.use(authenticate);

itemMatchesRouter.get('/', async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const item = await Item.findById(itemId);
    if (!item) throw notFound('Item not found');
    if (item.user_id.toString() !== req.user.userId && req.user.role !== 'admin') throw forbidden('Access denied');
    const matches = await Match.find({ $or: [{ item1_id: itemId }, { item2_id: itemId }] }).populate('item1_id item2_id').sort({ score: -1 });
    res.json({ data: matches, meta: { total: matches.length } });
  } catch (err) { next(err); }
});

export default { matchesRouter, itemMatchesRouter };
