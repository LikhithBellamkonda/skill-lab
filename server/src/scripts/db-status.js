import db from '../config/db.js';

try {
  await db.connect();
  const status = await db.checkConnection();
  console.log(`MongoDB connected to "${status.database}" (${status.latencyMs} ms).`);
} catch (error) {
  console.error(`[db] MongoDB status check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.closePool();
}
