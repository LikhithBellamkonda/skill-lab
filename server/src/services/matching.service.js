import Item from '../models/Item.js';
import Match from '../models/Match.js';
import * as notificationService from './notification.service.js';
import * as auditService from './audit.service.js';
import { mapItem } from '../modules/items/items.service.js';
import { conflict, forbidden, notFound } from '../utils/httpError.js';
import config from '../config/env.js';

function getDistanceMeters(first, second) {
  const firstCoordinates = first.location?.coordinates;
  const secondCoordinates = second.location?.coordinates;
  if (!firstCoordinates || !secondCoordinates) return null;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const [longitude1, latitude1] = firstCoordinates;
  const [longitude2, latitude2] = secondCoordinates;
  const deltaLatitude = toRadians(latitude2 - latitude1);
  const deltaLongitude = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapMatch(match, viewerId) {
  const first = match.item1_id;
  const second = match.item2_id;
  if (!first?._id || !second?._id) return null;
  if (first.deleted_at || second.deleted_at) return null;
  const lost = first.type === 'lost' ? first : second;
  const found = first.type === 'found' ? first : second;
  const lostItem = mapItem(lost);
  const foundItem = mapItem(found);
  lostItem.isMine =
    lost.user_id?._id?.toString() === viewerId || lost.user_id?.toString() === viewerId;
  foundItem.isMine =
    found.user_id?._id?.toString() === viewerId || found.user_id?.toString() === viewerId;
  return {
    matchId: match._id.toString(),
    overallScore: match.score,
    matchStatus: match.status,
    distanceMeters: getDistanceMeters(lost, found),
    reasons: match.reasons?.length ? match.reasons : [{ code: 'category', label: 'Same category' }],
    lostItem,
    foundItem,
    createdAt: match.created_at,
  };
}

function populateMatch(query) {
  return query
    .populate({
      path: 'item1_id',
      populate: [{ path: 'category_id' }, { path: 'user_id', select: 'full_name' }],
    })
    .populate({
      path: 'item2_id',
      populate: [{ path: 'category_id' }, { path: 'user_id', select: 'full_name' }],
    });
}

export async function findMatchesForItem(itemId) {
  const item = await Item.findById(itemId);
  if (!item || item.deleted_at || !['open', 'matched'].includes(item.status)) {
    return { scanned: 0, created: 0 };
  }
  const oppositeType = item.type === 'lost' ? 'found' : 'lost';
  const criteria = {
    type: oppositeType,
    status: { $in: ['open', 'matched'] },
    deleted_at: null,
    category_id: item.category_id,
    user_id: { $ne: item.user_id },
  };
  if (item.date) {
    criteria.date = {
      $gte: new Date(item.date.getTime() - config.matching.maxDays * 86_400_000),
      $lte: new Date(item.date.getTime() + config.matching.maxDays * 86_400_000),
    };
  }
  const candidates = await Item.find(criteria).limit(config.matching.candidateLimit);

  let created = 0;
  let bestScore = 0;
  for (const candidate of candidates) {
    const [item1Id, item2Id] = [item._id, candidate._id].sort((left, right) =>
      left.toString().localeCompare(right.toString())
    );
    const distance = getDistanceMeters(item, candidate);
    if (distance !== null && distance > config.matching.radiusMeters) continue;

    const itemDate = item.date ?? item.created_at;
    const candidateDate = candidate.date ?? candidate.created_at;
    const timeDifference =
      itemDate && candidateDate
        ? Math.abs(itemDate.getTime() - candidateDate.getTime()) / 86_400_000
        : 0;
    const components = [
      { score: 100, weight: config.matching.weights.attribute },
      {
        score: Math.max(0, 100 * (1 - timeDifference / config.matching.maxDays)),
        weight: config.matching.weights.time,
      },
    ];
    if (distance !== null) {
      components.push({
        score: Math.max(0, 100 * (1 - distance / config.matching.radiusMeters)),
        weight: config.matching.weights.spatial,
      });
    }
    const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
    const score = totalWeight
      ? components.reduce((sum, component) => sum + component.score * component.weight, 0) /
        totalWeight
      : components.reduce((sum, component) => sum + component.score, 0) / components.length;
    if (score < config.matching.minScore) continue;
    const reasons = [
      { code: 'category', label: 'Same category' },
      {
        code: 'time',
        label: 'Reported within the matching time window',
        detail: `${timeDifference.toFixed(1)} days apart`,
      },
    ];
    if (distance !== null) {
      reasons.push({
        code: 'distance',
        label: 'Nearby reports',
        detail: `${Math.round(distance)} m apart`,
      });
    }
    try {
      const result = await Match.updateOne(
        { item1_id: item1Id, item2_id: item2Id },
        { $setOnInsert: { score: Math.round(score), reasons, status: 'suggested' } },
        { upsert: true }
      );
      if (!result.upsertedCount) continue;
      created += 1;
      bestScore = Math.max(bestScore, Math.round(score));
      const match = await Match.findOne({ item1_id: item1Id, item2_id: item2Id }).select('_id');
      await Promise.all([
        notificationService.createNotification({
          user_id: item.user_id,
          type: 'match',
          title: 'A potential match was found',
          content: `A possible match was found for "${item.title}".`,
          reference_id: match._id,
          reference_type: 'match',
        }),
        notificationService.createNotification({
          user_id: candidate.user_id,
          type: 'match',
          title: 'A potential match was found',
          content: `A possible match was found for "${candidate.title}".`,
          reference_id: match._id,
          reference_type: 'match',
        }),
      ]);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  return { scanned: candidates.length, created, bestScore };
}

export async function recalculateUserMatches(userId, itemId) {
  let items;
  if (itemId) {
    const item = await Item.findById(itemId);
    if (!item) throw notFound('Item not found');
    if (item.user_id.toString() !== userId)
      throw forbidden('You can only recalculate your own reports.');
    items = [item];
  } else {
    items = await Item.find({ user_id: userId, deleted_at: null });
  }
  const results = await Promise.all(items.map((item) => findMatchesForItem(item._id)));
  const created = results.reduce((sum, result) => sum + result.created, 0);
  const scanned = results.reduce((sum, result) => sum + result.scanned, 0);
  const bestScore = results.reduce((best, result) => Math.max(best, result.bestScore ?? 0), 0);
  await auditService.logSystemAction({
    action: 'matches.recalculated',
    entityType: 'user',
    entityId: userId,
    actorUserId: userId,
    newState: { itemsProcessed: items.length, created, scanned },
  });
  return { itemsProcessed: items.length, created, updated: 0, removed: 0, scanned, bestScore };
}

export async function listMatchesForUser(userId, { status, page = 1, limit = 20 } = {}) {
  const itemIds = await Item.find({ user_id: userId, deleted_at: null }).distinct('_id');
  const query = { $or: [{ item1_id: { $in: itemIds } }, { item2_id: { $in: itemIds } }] };
  if (status) query.status = status;
  const [total, matches] = await Promise.all([
    Match.countDocuments(query),
    populateMatch(Match.find(query))
      .sort({ score: -1, created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return {
    rows: matches.map((match) => mapMatch(match, userId)).filter(Boolean),
    meta: { page, limit, total },
  };
}

export async function getMatches(itemId, viewerId) {
  const item = await Item.findById(itemId);
  if (!item) throw notFound('Item not found');
  if (item.user_id.toString() !== viewerId)
    throw forbidden('You can only view matches for your own reports.');
  const matches = await populateMatch(
    Match.find({ $or: [{ item1_id: itemId }, { item2_id: itemId }] }).sort({ score: -1 })
  );
  return matches.map((match) => mapMatch(match, viewerId)).filter(Boolean);
}

export async function dismissMatch(matchId, userId, isAdmin = false) {
  const match = await Match.findById(matchId);
  if (!match) throw notFound('Match not found');
  const [first, second] = await Promise.all([
    Item.findById(match.item1_id),
    Item.findById(match.item2_id),
  ]);
  const isOwner = first?.user_id.toString() === userId || second?.user_id.toString() === userId;
  if (!isOwner && !isAdmin) throw forbidden('You cannot dismiss this suggestion.');
  if (match.status !== 'suggested') throw conflict('This suggestion has already been updated.');
  match.status = 'dismissed';
  await match.save();
  await auditService.logSystemAction({
    action: 'match.dismissed',
    entityType: 'match',
    entityId: match._id.toString(),
    actorUserId: userId,
  });
  return match;
}

export async function getMatchForUser(matchId, userId, isAdmin = false) {
  const match = await populateMatch(Match.findById(matchId));
  if (!match) throw notFound('Match not found');
  const isOwner =
    (match.item1_id.user_id?._id ?? match.item1_id.user_id).toString() === userId ||
    (match.item2_id.user_id?._id ?? match.item2_id.user_id).toString() === userId;
  if (!isOwner && !isAdmin) throw forbidden('You cannot view this suggestion.');
  return mapMatch(match, userId);
}

export default {
  findMatchesForItem,
  recalculateUserMatches,
  listMatchesForUser,
  getMatches,
  dismissMatch,
  getMatchForUser,
};
