import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Item from '../models/Item.js';
import Category from '../models/Category.js';
import db from '../config/db.js';

const DEMO_PASSWORD = 'Password123';
const DEMO_USERS = [
  { fullName: 'Admin User', email: 'admin@campus.test', role: 'admin' },
  { fullName: 'Ada Lovelace', email: 'ada@campus.test', role: 'user' },
  { fullName: 'Alan Turing', email: 'alan@campus.test', role: 'user' },
  { fullName: 'Grace Hopper', email: 'grace@campus.test', role: 'user' },
  { fullName: 'Linus Torvalds', email: 'linus@campus.test', role: 'user' }
];

async function seed() {
  await db.connect();

  await Category.deleteMany({});
  await User.deleteMany({});
  await Item.deleteMany({});

  const categories = await Category.insertMany([
    { name: 'Mobile Phone', description: 'Smartphones and old phones' },
    { name: 'Laptop & Tablet', description: 'Laptops, tablets, e-readers' },
    { name: 'Water Bottle', description: 'Reusable bottles' },
    { name: 'Umbrella', description: 'Umbrellas of all sizes' },
    { name: 'ID Card & Documents', description: 'Student cards, passports, etc.' },
    { name: 'Books & Stationery', description: 'Textbooks, notebooks, pens' }
  ]);
  console.log(`Seeded ${categories.length} categories.`);

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, salt);

  const users = await User.insertMany(DEMO_USERS.map(u => ({
    email: u.email,
    password_hash: passwordHash,
    full_name: u.fullName,
    role: u.role
  })));
  console.log(`Seeded ${users.length} users.`);

  const ada = users.find(u => u.email === 'ada@campus.test');
  const alan = users.find(u => u.email === 'alan@campus.test');
  const phoneCat = categories.find(c => c.name === 'Mobile Phone');

  await Item.insertMany([
    {
      user_id: ada._id,
      category_id: phoneCat._id,
      type: 'lost',
      title: 'Lost black iPhone 15 with cracked screen',
      description: 'Black iPhone 15 with a cracked screen protector.',
      location_name: 'Main Library',
      location: { type: 'Point', coordinates: [-0.1231, 51.5021] },
      status: 'active'
    },
    {
      user_id: alan._id,
      category_id: phoneCat._id,
      type: 'found',
      title: 'Found smartphone on a bench outside the library',
      description: 'Found a black smartphone left on a bench.',
      location_name: 'Main Library',
      location: { type: 'Point', coordinates: [-0.1231, 51.5021] },
      status: 'active'
    }
  ]);
  console.log('Seeded items.');
  console.log('Done seeding MongoDB!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
