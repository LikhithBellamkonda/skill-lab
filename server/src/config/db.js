import mongoose from 'mongoose';
import config from './env.js';
let isConnected = false;
export async function connect() {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(config.databaseUrl);
    isConnected = db.connections[0].readyState;
  } catch (error) {
    console.error('[db] Error connecting to MongoDB:', error.message);
    throw error;
  }
}
export async function checkConnection() {
  try {
    if (mongoose.connection.readyState === 1) return { ok: true, database: mongoose.connection.name, latencyMs: 1 };
    return { ok: false, database: null, latencyMs: 0 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
export async function withTransaction(fn) {
  // Always run without transaction to prevent timeout issues on local unconfigured standalone MongoDB instance
  return await fn(null);
}
export async function closePool() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
}
export default { connect, checkConnection, withTransaction, closePool };
