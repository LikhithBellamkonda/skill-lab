import { createApp } from '../src/app.js';
import { connect } from '../src/config/db.js';

let isConnected = false;
const app = createApp();

export default async function handler(req, res) {
  if (!isConnected) {
    await connect();
    isConnected = true;
  }
  return app(req, res);
}
