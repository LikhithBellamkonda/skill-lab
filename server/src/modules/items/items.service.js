import Item from '../../models/Item.js';
import Category from '../../models/Category.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import * as auditService from '../../services/audit.service.js';
export const ALLOWED_TRANSITIONS = { active: ['resolved'], resolved: [] };
export function canTransition(current, next) { return ALLOWED_TRANSITIONS[current]?.includes(next); }
export function mapItem(row) {
  return {
    itemId: row._id.toString(),
    userId: row.user_id?.toString(),
    categoryId: row.category_id?.toString(),
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    locationName: row.location_name,
    date: row.date,
    imageUrl: row.image_url,
    latitude: row.location?.coordinates?.[1] || null,
    longitude: row.location?.coordinates?.[0] || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
export async function createItem(data, userId) {
  const { categoryId, type, title, description, locationName, latitude, longitude, date, imageUrl } = data;
  const itemData = { user_id: userId, category_id: categoryId, type, title: title.trim(), description: description?.trim(), location_name: locationName?.trim(), date: date || new Date(), image_url: imageUrl };
  if (latitude !== undefined && longitude !== undefined) itemData.location = { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] };
  const item = await Item.create(itemData);
  await auditService.logSystemAction({ action: 'item.created', entityType: 'item', entityId: item._id.toString(), actorUserId: userId, newState: { type: item.type, title: item.title, status: item.status } });
  return mapItem(item);
}
export async function searchItems(filters) {
  const query = {};
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.categoryId) query.category_id = filters.categoryId;
  if (filters.query) query.$or = [{ title: { $regex: filters.query, $options: 'i' } }, { description: { $regex: filters.query, $options: 'i' } }];
  if (filters.latitude && filters.longitude && filters.radius) query.location = { $near: { $geometry: { type: "Point", coordinates: [parseFloat(filters.longitude), parseFloat(filters.latitude)] }, $maxDistance: parseFloat(filters.radius) } };
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  const total = await Item.countDocuments(query);
  const items = await Item.find(query).sort({ created_at: -1 }).skip(offset).limit(limit);
  return { items: items.map(mapItem), meta: { page, limit, total } };
}
export async function listOwnItems(userId, filters) {
  const query = { user_id: userId };
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  const total = await Item.countDocuments(query);
  const items = await Item.find(query).sort({ created_at: -1 }).skip(offset).limit(limit);
  return { items: items.map(mapItem), meta: { page, limit, total } };
}
export async function getItemById(id) {
  const item = await Item.findById(id);
  if (!item) return null;
  return mapItem(item);
}
export async function updateItem(id, updates, user) {
  const item = await Item.findById(id);
  if (!item) throw notFound('Item not found');
  if (item.user_id.toString() !== user.userId && user.role !== 'admin') throw badRequest('Unauthorized');
  if (updates.title) item.title = updates.title;
  if (updates.description !== undefined) item.description = updates.description;
  if (updates.status) item.status = updates.status;
  if (updates.latitude !== undefined && updates.longitude !== undefined) item.location = { type: 'Point', coordinates: [parseFloat(updates.longitude), parseFloat(updates.latitude)] };
  await item.save();
  await auditService.logSystemAction({ action: 'item.updated', entityType: 'item', entityId: id, actorUserId: user.userId });
  return mapItem(item);
}
export async function updateStatus(id, status, user) {
  const item = await Item.findById(id);
  if (!item) throw notFound('Item not found');
  if (item.user_id.toString() !== user.userId && user.role !== 'admin') throw badRequest('Unauthorized');
  if (!canTransition(item.status, status)) throw badRequest('Invalid status transition');
  item.status = status;
  await item.save();
  await auditService.logSystemAction({ action: 'item.status_updated', entityType: 'item', entityId: id, actorUserId: user.userId });
  return mapItem(item);
}
export async function softDeleteItem(id, user) {
  const item = await Item.findById(id);
  if (!item) return false;
  if (item.user_id.toString() !== user.userId && user.role !== 'admin') throw badRequest('Unauthorized');
  item.status = 'resolved';
  await item.save();
  await auditService.logSystemAction({ action: 'item.deleted', entityType: 'item', entityId: id, actorUserId: user.userId });
  return true;
}
export async function addImage(id, file, user) {
  const item = await Item.findById(id);
  if (!item) throw notFound('Item not found');
  if (item.user_id.toString() !== user.userId && user.role !== 'admin') throw badRequest('Unauthorized');
  item.image_url = `/uploads/${file.filename}`;
  await item.save();
  return { imageId: 'image-123', url: item.image_url };
}
export async function deleteImage(itemId, imageId, user) {
  const item = await Item.findById(itemId);
  if (!item) throw notFound('Item not found');
  if (item.user_id.toString() !== user.userId && user.role !== 'admin') throw badRequest('Unauthorized');
  item.image_url = null;
  await item.save();
}
export async function listCategories() {
  const categories = await Category.find();
  return categories.map(c => ({ categoryId: c._id.toString(), name: c.name, description: c.description }));
}
export default { mapItem, createItem, searchItems, listOwnItems, getItemById, updateItem, updateStatus, softDeleteItem, addImage, deleteImage, listCategories, ALLOWED_TRANSITIONS, canTransition };
