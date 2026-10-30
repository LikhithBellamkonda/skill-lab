import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createItemSchema, listItemsQuerySchema } from '../src/modules/items/items.validation.js';
import { canTransition, mapItem } from '../src/modules/items/items.service.js';
import { ALLOWED_MIME_TYPES, detectImageMime } from '../src/middleware/upload.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const app = createApp();
const validId = '507f1f77bcf86cd799439011';

test('create item validation accepts MongoDB ids and matching form fields', () => {
  const parsed = createItemSchema.parse({
    reportType: 'found',
    categoryId: validId,
    title: 'Blue water bottle',
    description: 'Blue bottle with a silver cap.',
    eventTime: '2026-10-30T12:00:00.000Z',
    latitude: 51.5,
    longitude: -0.12,
  });
  assert.equal(parsed.categoryId, validId);
  assert.equal(parsed.reportType, 'found');
  assert.equal(parsed.eventTime.toISOString(), '2026-10-30T12:00:00.000Z');
});

test('item filters reject malformed MongoDB ids and accept UI statuses', () => {
  assert.equal(
    listItemsQuerySchema.parse({ categoryId: validId, status: 'matched' }).categoryId,
    validId
  );
  assert.equal(listItemsQuerySchema.safeParse({ categoryId: '23' }).success, false);
  assert.equal(listItemsQuerySchema.safeParse({ status: 'active' }).success, false);
  assert.equal(listItemsQuerySchema.safeParse({ sort: 'distance' }).success, false);
  assert.equal(
    listItemsQuerySchema.safeParse({ sort: 'distance', latitude: 51.5, longitude: -0.12 }).success,
    true
  );
});

test('item lifecycle transitions match the client status values', () => {
  assert.equal(canTransition('open', 'matched'), true);
  assert.equal(canTransition('matched', 'returned'), true);
  assert.equal(canTransition('returned', 'open'), false);
});

test('item response mapping omits private details and reporter email by default', () => {
  const item = {
    _id: validId,
    user_id: {
      _id: '507f1f77bcf86cd799439012',
      full_name: 'Ada Lovelace',
      email: 'private@example.test',
    },
    category_id: { _id: '507f1f77bcf86cd799439013', name: 'Books', description: 'Books' },
    type: 'lost',
    title: 'Blue book',
    description: 'A blue book.',
    date: new Date('2026-10-30T12:00:00.000Z'),
    location: { type: 'Point', coordinates: [-0.12, 51.5] },
    verification_hint: 'Private mark inside the cover',
    images: [],
    status: 'open',
    created_at: new Date('2026-10-30T12:00:00.000Z'),
  };
  const publicItem = mapItem(item);
  assert.equal(publicItem.reportType, 'lost');
  assert.deepEqual(publicItem.location, { longitude: -0.12, latitude: 51.5 });
  assert.equal('privateDetails' in publicItem, false);
  assert.equal('email' in publicItem.reporter, false);
  assert.equal(
    mapItem(item, { includePrivate: true }).privateDetails.verificationHint,
    'Private mark inside the cover'
  );
});

test('WebP uploads pass the actual RIFF and WEBP signature check', async (context) => {
  assert.deepEqual(ALLOWED_MIME_TYPES['image/webp'].magic[0], [0x52, 0x49, 0x46, 0x46]);
  assert.deepEqual(ALLOWED_MIME_TYPES['image/webp'].magicAt[0], [0x57, 0x45, 0x42, 0x50]);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sllf-image-test-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, 'image.webp');
  const header = Buffer.alloc(16);
  Buffer.from('RIFF').copy(header, 0);
  Buffer.from('WEBP').copy(header, 8);
  await fs.writeFile(imagePath, header);
  assert.equal(detectImageMime(imagePath), 'image/webp');
});

test('health endpoint separates liveness from MongoDB readiness', async () => {
  const alive = await request(app).get('/api/v1/health').expect(200);
  assert.equal(alive.body.status, 'ok');

  const ready = await request(app).get('/api/v1/health?db=1').expect(503);
  assert.equal(ready.body.status, 'degraded');
  assert.equal(ready.body.checks.database.status, 'unavailable');
});

test('item route validates ObjectIds before querying MongoDB', async () => {
  const response = await request(app).get('/api/v1/items/not-an-object-id').expect(422);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('CORS rejects unlisted origins with a forbidden response', async () => {
  const response = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'https://untrusted.example')
    .expect(403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('Mongo duplicate-key errors produce a conflict response', () => {
  let statusCode;
  let body;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  errorHandler(
    { name: 'MongoServerError', code: 11000, message: 'duplicate key' },
    { method: 'POST', originalUrl: '/api/v1/auth/register' },
    response,
    () => {}
  );
  assert.equal(statusCode, 409);
  assert.equal(body.error.code, 'CONFLICT');
});
