import { createDatabase } from '../backend/src/db/database.js';
import { createApp } from '../backend/src/app.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createDatabase({ memory: false }).then((db) => createApp(db));
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Function Error]', err);
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Erro interno no servidor REST.'
    });
  }
}
