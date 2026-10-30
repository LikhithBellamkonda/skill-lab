import Item from '../models/Item.js';
export async function findNearbyItems(latitude, longitude, radiusMeters = 5000, filters = {}) {
  const query = { location: { $near: { $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] }, $maxDistance: parseFloat(radiusMeters) } } };
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.excludeUserId) query.user_id = { $ne: filters.excludeUserId };
  const items = await Item.find(query).limit(100);
  return items;
}
export default { findNearbyItems };
