import Item from '../../models/Item.js';
import Category from '../../models/Category.js';
import User from '../../models/User.js';
import Claim from '../../models/Claim.js';
import Match from '../../models/Match.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/httpError.js';
import { removeStoredFile } from '../../middleware/upload.js';
import * as auditService from '../../services/audit.service.js';
import config from '../../config/env.js';

export const ALLOWED_TRANSITIONS = Object.freeze({
  open: ['matched', 'claimed', 'closed', 'rejected'],
  matched: ['claimed', 'returned', 'closed'],
  claimed: ['returned', 'closed', 'open'],
  returned: ['closed'],
  closed: ['open'],
  rejected: ['open', 'closed'],
});

export function canTransition(current, next) {
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
}

function idOf(value) {
  return value?._id ? value._id.toString() : value?.toString();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function distanceMeters(latitude1, longitude1, latitude2, longitude2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(latitude2 - latitude1);
  const deltaLongitude = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mapItem(item, { includePrivate = false } = {}) {
  if (!item) return null;
  const category =
    item.category_id && item.category_id.name
      ? {
          categoryId: idOf(item.category_id),
          name: item.category_id.name,
          description: item.category_id.description,
        }
      : null;
  const reporter =
    item.user_id && item.user_id.full_name
      ? {
          userId: idOf(item.user_id),
          fullName: item.user_id.full_name,
        }
      : null;

  const result = {
    itemId: idOf(item),
    reportType: item.type,
    title: item.title,
    description: item.description,
    status: item.status,
    categoryId: idOf(item.category_id),
    category,
    colour: item.colour ?? null,
    brand: item.brand ?? null,
    eventTime: item.date,
    locationName: item.location_name ?? null,
    location:
      item.location?.coordinates?.length === 2
        ? { longitude: item.location.coordinates[0], latitude: item.location.coordinates[1] }
        : null,
    images: (item.images ?? []).map((image) => ({
      imageId: idOf(image),
      imageUrl: image.url,
      altText: image.alt_text ?? null,
      uploadedAt: image.uploaded_at,
    })),
    reporter,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    deletedAt: item.deleted_at ?? null,
    closedAt: item.closed_at ?? null,
  };
  if (includePrivate && item.verification_hint) {
    result.privateDetails = { verificationHint: item.verification_hint };
  }
  return result;
}

function pageOptions(filters = {}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit };
}

function populateItem(query) {
  return query.populate('category_id', 'name description').populate('user_id', 'full_name email');
}

export async function createItem(data, userId) {
  const category = await Category.findById(data.categoryId).select('_id');
  if (!category) throw badRequest('The selected category does not exist.');

  const itemData = {
    user_id: userId,
    category_id: category._id,
    type: data.reportType,
    title: data.title.trim(),
    description: data.description.trim(),
    colour: data.colour?.trim() || undefined,
    brand: data.brand?.trim() || undefined,
    date: data.eventTime,
    location_name: data.locationName?.trim() || undefined,
    verification_hint: data.verificationHint?.trim() || undefined,
  };
  if (
    data.latitude !== null &&
    data.latitude !== undefined &&
    data.longitude !== null &&
    data.longitude !== undefined
  ) {
    itemData.location = {
      type: 'Point',
      coordinates: [data.longitude, data.latitude],
    };
  }

  const item = await Item.create(itemData);
  await auditService.logSystemAction({
    action: 'item.created',
    entityType: 'item',
    entityId: item._id.toString(),
    actorUserId: userId,
    newState: { type: item.type, title: item.title, status: item.status },
  });
  return mapItem(await populateItem(Item.findById(item._id)), { includePrivate: true });
}

export async function searchItems(filters) {
  const query = { deleted_at: null };
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.categoryId) query.category_id = filters.categoryId;
  if (filters.colour) query.colour = new RegExp(escapeRegex(filters.colour), 'i');
  if (filters.brand) query.brand = new RegExp(escapeRegex(filters.brand), 'i');
  if (filters.q) {
    const term = new RegExp(escapeRegex(filters.q), 'i');
    query.$or = [{ title: term }, { description: term }, { location_name: term }];
  }
  if (filters.from || filters.to) {
    query.date = {};
    if (filters.from) query.date.$gte = filters.from;
    if (filters.to) query.date.$lte = filters.to;
  }
  const hasCoordinates = filters.latitude !== undefined && filters.longitude !== undefined;
  const distanceSort = filters.sort === 'distance' && hasCoordinates;
  const radiusMeters = filters.radiusMeters ?? config.matching.radiusMeters;
  if (hasCoordinates && (filters.radiusMeters || distanceSort)) {
    query.location = {
      $geoWithin: {
        $centerSphere: [[filters.longitude, filters.latitude], radiusMeters / 6_371_000],
      },
    };
  }

  const { page, limit, skip } = pageOptions(filters);
  const total = await Item.countDocuments(query);
  let items;
  if (filters.sort === 'relevance' && filters.q) {
    const pattern = escapeRegex(filters.q);
    items = await Item.aggregate([
      { $match: query },
      {
        $addFields: {
          _relevance: {
            $add: [
              {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $ifNull: ['$title', ''] },
                      regex: pattern,
                      options: 'i',
                    },
                  },
                  2,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $ifNull: ['$description', ''] },
                      regex: pattern,
                      options: 'i',
                    },
                  },
                  1,
                  0,
                ],
              },
            ],
          },
        },
      },
      { $sort: { _relevance: -1, created_at: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: Category.collection.name,
          localField: 'category_id',
          foreignField: '_id',
          as: 'category_id',
        },
      },
      { $unwind: { path: '$category_id', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: User.collection.name,
          localField: 'user_id',
          foreignField: '_id',
          as: 'user_id',
        },
      },
      { $unwind: { path: '$user_id', preserveNullAndEmptyArrays: true } },
    ]);
  } else if (distanceSort) {
    const nearQuery = {
      ...query,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [filters.longitude, filters.latitude],
          },
          $maxDistance: radiusMeters,
        },
      },
    };
    items = await populateItem(Item.find(nearQuery)).skip(skip).limit(limit);
  } else {
    let itemsQuery = populateItem(Item.find(query));
    if (filters.sort === 'event_time') itemsQuery = itemsQuery.sort({ date: -1 });
    else itemsQuery = itemsQuery.sort({ created_at: -1 });
    items = await itemsQuery.skip(skip).limit(limit);
  }
  const rows = items.map((item) => {
    const mapped = mapItem(item);
    if (distanceSort && item.location?.coordinates?.length === 2) {
      mapped.distanceMeters = distanceMeters(
        filters.latitude,
        filters.longitude,
        item.location.coordinates[1],
        item.location.coordinates[0]
      );
    }
    return mapped;
  });
  return { items: rows, meta: { page, limit, total } };
}

export async function listOwnItems(userId, filters) {
  const query = { user_id: userId };
  if (!filters.includeDeleted) query.deleted_at = null;
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  const { page, limit, skip } = pageOptions(filters);
  const total = await Item.countDocuments(query);
  const items = await populateItem(Item.find(query))
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);
  return { items: items.map((item) => mapItem(item)), meta: { page, limit, total } };
}

export async function getItemById(id, viewer = {}) {
  const item = await populateItem(Item.findById(id));
  if (!item) return null;
  const isPrivileged = viewer.role === 'admin' || viewer.userId === idOf(item.user_id);
  if (item.deleted_at && !isPrivileged) return null;
  return mapItem(item, { includePrivate: isPrivileged });
}

async function getMutableItem(id, user) {
  const item = await Item.findById(id);
  if (!item) throw notFound('Item not found');
  if (item.deleted_at) throw conflict('Deleted reports cannot be changed.');
  if (idOf(item.user_id) !== user.userId && user.role !== 'admin') {
    throw forbidden('You do not have permission to modify this item.');
  }
  return item;
}

export async function updateItem(id, updates, user) {
  const item = await getMutableItem(id, user);
  if (updates.categoryId) {
    const category = await Category.findById(updates.categoryId).select('_id');
    if (!category) throw badRequest('The selected category does not exist.');
    item.category_id = category._id;
  }
  if (updates.title !== undefined) item.title = updates.title.trim();
  if (updates.description !== undefined) item.description = updates.description.trim();
  if (updates.colour !== undefined) item.colour = updates.colour?.trim() || undefined;
  if (updates.brand !== undefined) item.brand = updates.brand?.trim() || undefined;
  if (updates.eventTime !== undefined) item.date = updates.eventTime;
  if (updates.locationName !== undefined)
    item.location_name = updates.locationName?.trim() || undefined;
  if (updates.verificationHint !== undefined)
    item.verification_hint = updates.verificationHint?.trim() || undefined;
  if (updates.latitude !== undefined && updates.longitude !== undefined) {
    item.location =
      updates.latitude === null || updates.longitude === null
        ? undefined
        : { type: 'Point', coordinates: [updates.longitude, updates.latitude] };
  }
  await item.save();
  await auditService.logSystemAction({
    action: 'item.updated',
    entityType: 'item',
    entityId: id,
    actorUserId: user.userId,
  });
  return getItemById(id, user);
}

export async function updateStatus(id, status, user) {
  const item = await getMutableItem(id, user);
  if (!canTransition(item.status, status)) throw badRequest('Invalid status transition.');
  item.status = status;
  item.closed_at = ['closed', 'returned', 'rejected'].includes(status) ? new Date() : null;
  await item.save();
  if (status === 'returned') {
    await Match.updateMany(
      { $or: [{ item1_id: item._id }, { item2_id: item._id }], status: 'suggested' },
      { $set: { status: 'resolved' } }
    );
  }
  await auditService.logSystemAction({
    action: 'item.status_changed',
    entityType: 'item',
    entityId: id,
    actorUserId: user.userId,
    newState: { status },
  });
  return getItemById(id, user);
}

export async function softDeleteItem(id, user) {
  const item = await getMutableItem(id, user);
  const pendingClaims = await Claim.countDocuments({ item_id: id, status: 'pending' });
  if (pendingClaims) throw conflict('Reports with pending claims cannot be deleted.');
  item.status = 'closed';
  item.deleted_at = new Date();
  item.closed_at = item.deleted_at;
  await item.save();
  await Match.updateMany(
    { $or: [{ item1_id: item._id }, { item2_id: item._id }], status: 'suggested' },
    { $set: { status: 'resolved' } }
  );
  await auditService.logSystemAction({
    action: 'item.soft_deleted',
    entityType: 'item',
    entityId: id,
    actorUserId: user.userId,
  });
  return true;
}

export async function addImage(id, file, user) {
  try {
    const item = await getMutableItem(id, user);
    const image = { url: `/uploads/${file.filename}` };
    item.images.push(image);
    await item.save();
    await auditService.logSystemAction({
      action: 'item.image_uploaded',
      entityType: 'item',
      entityId: id,
      actorUserId: user.userId,
    });
    const savedImage = item.images[item.images.length - 1];
    return {
      imageId: savedImage._id.toString(),
      imageUrl: savedImage.url,
    };
  } catch (error) {
    await removeStoredFile(file.filename);
    throw error;
  }
}

export async function deleteImage(itemId, imageId, user) {
  const item = await getMutableItem(itemId, user);
  const image = item.images.id(imageId);
  if (!image) throw notFound('Image not found');
  const storageKey = image.url;
  image.deleteOne();
  await item.save();
  await removeStoredFile(storageKey);
}

export async function listCategories() {
  const categories = await Category.find().sort({ name: 1 });
  return categories.map((category) => ({
    categoryId: category._id.toString(),
    name: category.name,
    description: category.description,
  }));
}

export default {
  mapItem,
  createItem,
  searchItems,
  listOwnItems,
  getItemById,
  updateItem,
  updateStatus,
  softDeleteItem,
  addImage,
  deleteImage,
  listCategories,
  ALLOWED_TRANSITIONS,
  canTransition,
};
