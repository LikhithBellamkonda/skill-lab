import { z } from 'zod';
import { ALLOWED_TRANSITIONS } from './items.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid MongoDB id');
const reportType = z.enum(['lost', 'found']);
const itemStatus = z.enum(['open', 'matched', 'claimed', 'returned', 'closed', 'rejected']);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const trimmed = (max, min = 1) => z.string().trim().min(min).max(max);

function requireCoordinatePair(value, ctx) {
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasLatitude ? 'longitude' : 'latitude'],
      message: 'latitude and longitude must be provided together',
    });
  }
}

export const createItemSchema = z
  .object({
    reportType,
    categoryId: objectId,
    title: trimmed(200, 3),
    description: trimmed(5000, 10),
    colour: trimmed(50).nullish(),
    brand: trimmed(100).nullish(),
    eventTime: z.coerce.date(),
    locationName: trimmed(200).nullish(),
    latitude: latitude.nullish(),
    longitude: longitude.nullish(),
    verificationHint: trimmed(500).nullish(),
  })
  .superRefine(requireCoordinatePair);

export const updateItemSchema = z
  .object({
    categoryId: objectId.optional(),
    title: trimmed(200, 3).optional(),
    description: trimmed(5000, 10).optional(),
    colour: trimmed(50).nullish(),
    brand: trimmed(100).nullish(),
    eventTime: z.coerce.date().optional(),
    locationName: trimmed(200).nullish(),
    latitude: latitude.nullish(),
    longitude: longitude.nullish(),
    verificationHint: trimmed(500).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  })
  .superRefine(requireCoordinatePair);

export const updateStatusSchema = z.object({ status: itemStatus });

export const listItemsQuerySchema = z
  .object({
    type: reportType.optional(),
    categoryId: objectId.optional(),
    status: itemStatus.optional(),
    colour: trimmed(50).optional(),
    brand: trimmed(100).optional(),
    q: z.string().trim().max(200).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().positive().max(200_000).optional(),
    sort: z.enum(['recent', 'relevance', 'distance', 'event_time']).default('recent'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .superRefine((value, ctx) => {
    requireCoordinatePair(value, ctx);
    if (
      value.sort === 'distance' &&
      (value.latitude === undefined || value.longitude === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'latitude and longitude are required for distance sorting',
      });
    }
  });

export const listOwnItemsQuerySchema = z.object({
  type: reportType.optional(),
  status: itemStatus.optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const itemIdParamSchema = z.object({ itemId: objectId });
export const imageParamSchema = z.object({ itemId: objectId, imageId: objectId });
export const TRANSITIONS = ALLOWED_TRANSITIONS;
