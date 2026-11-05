#!/usr/bin/env node
/**
 * Lightweight local server: serves the built UI from ./dist and routes /api/* to the
 * Netlify Functions v2 handlers in ./netlify/functions (using each file's `config.path`).
 * Requires Node ≥ 22.18 (native TypeScript type-stripping).
 *
 *   npm run build && npm run preview:local          # uses .env if present
 *   SUNO_MOCK=true PORT=8888 node scripts/local-server.mjs
 *
 * For full Netlify parity (platform rate limits, Blobs) use `netlify dev` instead.
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const fnDir = join(root, 'netlify', 'functions');

// Minimal .env loader (does not override variables already set).
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const routes = [];
for (const file of await readdir(fnDir)) {
  if (!/\.m?[jt]s$/.test(file)) continue;
  const mod = await import(pathToFileURL(join(fnDir, file)).href);
  const path = mod.config?.path;
  if (!path || typeof mod.default !== 'function') continue;
  const methods = mod.config.method ? [].concat(mod.config.method) : null;
  routes.push({ path, methods, handler: mod.default, file });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

async function serveStatic(pathname, res) {
  let file = normalize(join(dist, decodeURIComponent(pathname)));
  if (!file.startsWith(dist)) return false;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dist, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found — run `npm run build` first.');
  }
  return true;
}

const port = Number(process.env.PORT || 8888);
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`);
  const route = routes.find((r) => r.path === url.pathname);
  if (!route) {
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'not_found', message: 'Not found.' } }));
      return;
    }
    await serveStatic(url.pathname, res);
    return;
  }
  if (route.methods && !route.methods.includes(req.method)) {
    res.writeHead(405, { Allow: route.methods.join(', ') }).end();
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const request = new Request(url, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks),
  });
  try {
    const response = await route.handler(request, { ip: req.socket.remoteAddress || '127.0.0.1' });
    const outHeaders = {};
    response.headers.forEach((v, k) => (outHeaders[k] = v));
    res.writeHead(response.status, outHeaders);
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (err) {
    console.error(`[${route.file}]`, err);
    res.writeHead(500).end('Function error');
  }
});

server.listen(port, () => {
  console.log(`AI Music Studio running at http://localhost:${port}`);
  console.log(`  functions: ${routes.map((r) => r.path).join(', ')}`);
  console.log(`  mode: ${process.env.SUNO_MOCK === 'true' ? 'MOCK (no credits used)' : process.env.SUNO_API_KEY ? 'LIVE SunoAPI' : 'no SUNO_API_KEY set'}`);
});
