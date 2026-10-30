import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Item from '../models/Item.js';
import Category from '../models/Category.js';
import db from '../config/db.js';
import { findMatchesForItem } from '../services/matching.service.js';

const DEMO_PASSWORD = 'Password123';
const DEMO_USERS = [
  { full_name: 'Admin User', email: 'admin@campus.test', role: 'admin' },
  { full_name: 'Ada Lovelace', email: 'ada@campus.test', role: 'user' },
  { full_name: 'Alan Turing', email: 'alan@campus.test', role: 'user' },
  { full_name: 'Grace Hopper', email: 'grace@campus.test', role: 'user' },
  { full_name: 'Linus Torvalds', email: 'linus@campus.test', role: 'user' },
];
const DEMO_CATEGORIES = [
  { name: 'Mobile Phone', description: 'Smartphones and old phones' },
  { name: 'Laptop & Tablet', description: 'Laptops, tablets, e-readers' },
  { name: 'Water Bottle', description: 'Reusable bottles' },
  { name: 'Umbrella', description: 'Umbrellas of all sizes' },
  { name: 'ID Card & Documents', description: 'Student cards, passports, etc.' },
  { name: 'Books & Stationery', description: 'Textbooks, notebooks, pens' },
];

async function seed() {
  await db.connect();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const category of DEMO_CATEGORIES) {
    await Category.updateOne({ name: category.name }, { $setOnInsert: category }, { upsert: true });
  }
  for (const user of DEMO_USERS) {
    await User.updateOne(
      { email: user.email },
      {
        $setOnInsert: {
          ...user,
          password_hash: passwordHash,
          is_active: true,
        },
      },
      { upsert: true }
    );
  }

  const ada = await User.findOne({ email: 'ada@campus.test' });
  const alan = await User.findOne({ email: 'alan@campus.test' });
  const phoneCategory = await Category.findOne({ name: 'Mobile Phone' });
  const examples = [
    {
      user_id: ada._id,
      category_id: phoneCategory._id,
      type: 'lost',
      title: 'Lost black iPhone 15 with cracked screen',
      description: 'Black iPhone 15 with a cracked screen protector.',
      location_name: 'Main Library',
      location: { type: 'Point', coordinates: [-0.1231, 51.5021] },
      date: new Date(),
    },
    {
      user_id: alan._id,
      category_id: phoneCategory._id,
      type: 'found',
      title: 'Found smartphone on a bench outside the library',
      description: 'Found a black smartphone left on a bench.',
      location_name: 'Main Library',
      location: { type: 'Point', coordinates: [-0.1231, 51.5021] },
      date: new Date(),
    },
  ];
  for (const item of examples) {
    await Item.updateOne(
      { user_id: item.user_id, type: item.type, title: item.title },
      { $setOnInsert: item },
      { upsert: true }
    );
  }
  let createdMatches = 0;
  for (const example of examples) {
    const item = await Item.findOne({
      user_id: example.user_id,
      type: example.type,
      title: example.title,
      deleted_at: null,
    }).select('_id');
    if (!item) throw new Error(`Seeded ${example.type} demo report could not be found.`);
    const result = await findMatchesForItem(item._id);
    createdMatches += result.created;
  }
  console.log(
    `MongoDB seed data is present; ${createdMatches} demo match(es) created (existing records were not modified or deleted).`
  );
}

seed()
  .catch((error) => {
    console.error(`[seed] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.closePool());
