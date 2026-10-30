import mongoose from 'mongoose';
import config from './env.js';
let connecting;

export async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connecting) {
    connecting = mongoose
      .connect(config.databaseUrl, {
        maxPoolSize: config.dbPoolMax,
        serverSelectionTimeoutMS: 10_000,
      })
      .then((db) => db.connection)
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

export async function checkConnection() {
  if (mongoose.connection.readyState !== 1) {
    return { ok: false, database: null, latencyMs: 0 };
  }
  const startedAt = Date.now();
  await mongoose.connection.db.admin().ping();
  return {
    ok: true,
    database: mongoose.connection.name,
    latencyMs: Date.now() - startedAt,
  };
}

export async function closePool() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
export default { connect, checkConnection, closePool };
