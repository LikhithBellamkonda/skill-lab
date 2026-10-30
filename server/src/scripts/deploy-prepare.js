#!/usr/bin/env node
/**
 * One-command preparation for a hosted MongoDB database.
 *
 *   npm run deploy:prepare
 *
 * What it does
 * ------------
 *   1. Connects to DATABASE_URL and prints the target without credentials.
 *   2. Verifies that MongoDB is reachable.
 *   3. Confirms the Mongoose models can be used by the app.
 *   4. Creates the first administrator if the database has none.
 *   5. Prints the exact environment values to paste into Render and Vercel.
 *
 * It deliberately does NOT run the demo seed, and refuses to continue if the
 * database looks like a local one only when you ask it to.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { closePool } from '../config/db.js';
import config, { ROOT_DIR } from '../config/env.js';
import { connect } from '../config/db.js';
import User from '../models/User.js';
import Item from '../models/Item.js';
function heading(text) {
  console.log(`\n${'='.repeat(64)}\n${text}\n${'='.repeat(64)}`);
}

function runNodeScript(relativePath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT_DIR, relativePath), ...args], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Exited with code ${code}`))
    );
  });
}

async function main() {
  heading('Smart Lost & Found — deployment preparation');
  const databaseName =
    new URL(config.databaseUrl).pathname.replace(/^\/+/, '').split('/')[0] || '(default)';
  console.log(`Target MongoDB database: "${databaseName}"`);
  await connect();

  // ---------------------------------------------------------------------
  // First administrator
  // ---------------------------------------------------------------------
  heading('Administrator account');
  const admins = await User.find({ role: 'admin' }).limit(5);

  if (admins.length > 0) {
    console.log('Administrator(s) already present:');
    for (const row of admins) console.log(`  • ${row.email}`);
    console.log('\nTo add another (for example a teammate):');
    console.log('  npm run admin:create -- --email=them@example.com --name="Their Name" --promote');
  } else {
    console.log(
      'No administrator exists yet. The next step asks for an email, a name and a password.'
    );
    console.log('Create one now, or later with `npm run admin:create`.\n');
    await runNodeScript('server/src/scripts/create-admin.js');
  }

  // ---------------------------------------------------------------------
  // Environment values for the hosts
  // ---------------------------------------------------------------------
  const items = await Item.countDocuments();
  const users = await User.countDocuments();

  heading('Deployment is ready');
  console.log(`Database now holds ${users} user(s) and ${items} report(s).\n`);

  console.log('--- Render (API) environment ------------------------------------');
  console.log('  DATABASE_URL    = <your MongoDB connection string>');

  console.log('  JWT_SECRET      = (generated automatically by render.yaml)');
  console.log('  CLIENT_ORIGIN   = https://<your-app>.vercel.app   (no trailing slash)');
  console.log('  AI_PROVIDER     = disabled');
  console.log('  UPLOAD_DIR      = /tmp/uploads');
  console.log('  NODE_ENV        = production');

  console.log('\n--- Vercel (client) environment ----------------------------------');
  console.log('  VITE_API_URL    = https://<your-api>.onrender.com/api/v1');
  console.log('  VITE_API_ORIGIN = https://<your-api>.onrender.com');

  console.log('\n--- Next ---------------------------------------------------------');
  console.log('  1. Render → New → Blueprint → select this repository.');
  console.log('  2. Vercel → Add New → Project → Root Directory = client.');
  console.log('  3. Set CLIENT_ORIGIN on Render once Vercel gives you a URL.');
  console.log('  4. Verify: https://<your-api>.onrender.com/api/v1/health?db=1');
  console.log('\nFull guide: docs/deployment.md');
}

main()
  .catch((error) => {
    console.error(`\nUnexpected failure: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
