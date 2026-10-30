import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendOk } from '../../utils/respond.js';
import * as matchingService from '../../services/matching.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB id');
const matchIdParams = z.object({ matchId: objectId });
const itemIdParams = z.object({ itemId: objectId });
const listQuery = z.object({
  status: z.enum(['suggested', 'dismissed', 'claimed', 'resolved']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
const recalculateBody = z.object({ itemId: objectId.optional() });

export const matchesRouter = Router();
matchesRouter.use(authenticate);

matchesRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const result = await matchingService.listMatchesForUser(req.user.userId, req.validatedQuery);
    return sendOk(res, result.rows, result.meta);
  })
);

matchesRouter.get(
  '/:matchId',
  validate({ params: matchIdParams }),
  asyncHandler(async (req, res) => {
    const match = await matchingService.getMatchForUser(
      req.params.matchId,
      req.user.userId,
      req.user.role === 'admin'
    );
    return sendOk(res, match);
  })
);

matchesRouter.post(
  '/:matchId/dismiss',
  validate({ params: matchIdParams }),
  asyncHandler(async (req, res) => {
    await matchingService.dismissMatch(
      req.params.matchId,
      req.user.userId,
      req.user.role === 'admin'
    );
    return sendOk(res, { matchId: req.params.matchId, matchStatus: 'dismissed' });
  })
);

matchesRouter.post(
  '/recalculate',
  validate({ body: recalculateBody }),
  asyncHandler(async (req, res) => {
    const result = await matchingService.recalculateUserMatches(req.user.userId, req.body.itemId);
    return sendOk(res, result);
  })
);

export const itemMatchesRouter = Router({ mergeParams: true });
itemMatchesRouter.use(authenticate);
itemMatchesRouter.get(
  '/',
  validate({ params: itemIdParams }),
  asyncHandler(async (req, res) => {
    const matches = await matchingService.getMatches(req.params.itemId, req.user.userId);
    return sendOk(res, matches, { total: matches.length });
  })
);

export default { matchesRouter, itemMatchesRouter };
