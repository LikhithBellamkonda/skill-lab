import Item from '../models/Item.js';
import Match from '../models/Match.js';
import Notification from '../models/Notification.js';

export async function findMatchesForItem(itemId) {
  const item = await Item.findById(itemId);
  if (!item || item.status !== 'active') return;

  const typeMap = { lost: 'found', found: 'lost' };
  const oppositeType = typeMap[item.type];
  if (!oppositeType) return;

  const candidates = await Item.find({
    type: oppositeType,
    status: 'active',
    category_id: item.category_id
  });

  const matches = [];

  for (const c of candidates) {
    if (c.user_id.toString() === item.user_id.toString()) continue;

    const existingMatch = await Match.findOne({
      $or: [
        { item1_id: item._id, item2_id: c._id },
        { item1_id: c._id, item2_id: item._id }
      ]
    });

    if (!existingMatch) {
      let score = 50;

      if (c.location && item.location) {
        if (c.location.type === 'Point' && item.location.type === 'Point') {
          score += 20;
        }
      }

      if (score >= 40) {
        matches.push({ candidateId: c._id, candidateUserId: c.user_id, score });
      }
    }
  }

  for (const m of matches) {
    const match = await Match.create({
      item1_id: item._id,
      item2_id: m.candidateId,
      score: m.score,
      status: 'pending'
    });

    await Notification.create({
      user_id: item.user_id,
      type: 'match',
      title: 'New match found!',
      content: `A potential match was found for your ${item.type} item.`,
      reference_id: match._id,
      reference_type: 'match'
    });

    await Notification.create({
      user_id: m.candidateUserId,
      type: 'match',
      title: 'New match found!',
      content: `A potential match was found for your ${oppositeType} item.`,
      reference_id: match._id,
      reference_type: 'match'
    });
  }
}

export async function getMatches(itemId) {
  const matches = await Match.find({
    $or: [{ item1_id: itemId }, { item2_id: itemId }]
  }).populate('item1_id item2_id');

  return matches;
}

export default { findMatchesForItem, getMatches };
