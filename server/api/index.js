import { createApp } from '../src/app.js';
import { connect } from '../src/config/db.js';

const app = createApp();

export default async function handler(req, res) {
  await connect();
  return app(req, res);
}
