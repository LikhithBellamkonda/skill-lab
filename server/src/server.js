import { createApp } from './app.js';
import config from './config/env.js';
import { connect, checkConnection, closePool } from './config/db.js';

async function main() {
  const app = createApp();

  try {
    await connect();
    const database = await checkConnection();
    console.log(`[db] connected to MongoDB "${database.database}"`);
  } catch (error) {
    const message = `[db] could not connect: ${error.message}`;
    if (config.isProduction) {
      console.error(message);
      process.exit(1);
    }
    console.warn(`${message} — starting anyway so /api/v1/health can report the failure.`);
  }

  const server = app.listen(config.port, () => {
    console.log(`[http] Smart Lost & Found API listening on http://localhost:${config.port}`);
  });

  const shutdown = (signal) => {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[startup] fatal error:', error.message);
  process.exit(1);
});
