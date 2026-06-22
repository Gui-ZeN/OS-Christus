// Adaptador de dev: serve os handlers serverless de api/*.js num http server
// local, replicando os rewrites do vercel.json. Aponta o firebase-admin para
// os emuladores (envs setadas no comando de start).
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Aponta o firebase-admin pro emulador (defaults; sobrescrevíveis por env).
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ||= 'os-christus';
process.env.FIREBASE_PROJECT_ID ||= 'os-christus';

const PORT = 3001;
const API_DIR = path.resolve(process.cwd(), 'api');

// Espelha vercel.json
const REWRITES = {
  '/api/email/send': { file: 'mail', query: { route: 'send' } },
  '/api/email/health': { file: 'mail', query: { route: 'health' } },
  '/api/email/gmail-sync': { file: 'mail', query: { route: 'gmail-sync' } },
  '/api/email/gmail-watch': { file: 'mail', query: { route: 'gmail-watch' } },
  '/api/email/gmail-push': { file: 'mail', query: { route: 'gmail-push' } },
  '/api/email/inbound': { file: 'mail', query: { route: 'inbound' } },
  '/api/firestore-backfill': { file: 'admin-tools', query: { route: 'backfill' } },
  '/api/firestore-legacy-health': { file: 'admin-tools', query: { route: 'legacy-health' } },
  '/api/integrations-health': { file: 'admin-tools', query: { route: 'integrations-health' } },
};

const handlerCache = new Map();
async function loadHandler(file) {
  if (handlerCache.has(file)) return handlerCache.get(file);
  const mod = await import(pathToFileURL(path.join(API_DIR, `${file}.js`)).href);
  handlerCache.set(file, mod.default);
  return mod.default;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let file;
    let extraQuery = {};
    if (REWRITES[url.pathname]) {
      ({ file } = REWRITES[url.pathname]);
      extraQuery = REWRITES[url.pathname].query;
    } else {
      const match = url.pathname.match(/^\/api\/([^/?]+)/);
      if (!match) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      file = match[1];
    }
    req.query = { ...Object.fromEntries(url.searchParams), ...extraQuery };
    const handler = await loadHandler(file);
    await handler(req, res);
  } catch (err) {
    console.error('[api-adapter]', req.method, req.url, '->', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
    }
  }
});

server.listen(PORT, () => console.log(`[api-adapter] serving api/*.js on http://localhost:${PORT}`));
