// ARF HTTP broker.
//
// Security posture:
//  - Binds to loopback by default; LAN exposure is opt-in and token-gated.
//  - A per-run bearer token is required for every state-changing request.
//  - Strict CSP, no inline script, no external origins.
//  - Per-client rate limiting.
//  - Request bodies are size-capped and schema-checked.

import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { createApp } from '../app.js';
import { listLanguages } from '../core/languages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const MAX_BODY = 32 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 120 };

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function startServer({
  port = Number(process.env.ARF_PORT || 8787),
  host = process.env.ARF_HOST || '127.0.0.1',
  token = process.env.ARF_TOKEN || randomBytes(24).toString('hex'),
  persistAudit = true,
} = {}) {
  const app = createApp({ persistAudit, auditPath: process.env.ARF_AUDIT || 'data/audit.log' });
  const hits = new Map();

  function rateLimited(ip) {
    const now = Date.now();
    const rec = hits.get(ip) || { count: 0, reset: now + RATE_LIMIT.windowMs };
    if (now > rec.reset) { rec.count = 0; rec.reset = now + RATE_LIMIT.windowMs; }
    rec.count += 1;
    hits.set(ip, rec);
    return rec.count > RATE_LIMIT.max;
  }

  function send(res, status, body, extraHeaders = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    });
    res.end(payload);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  function authed(req) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    return bearer && safeEqual(bearer, token);
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = normalize(join(PUBLIC_DIR, rel));
    if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
    try {
      const data = readFileSync(filePath);
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }

  const server = createServer(async (req, res) => {
    const ip = req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) return send(res, 429, { error: 'rate limited' });

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    // Public, non-sensitive endpoints.
    if (req.method === 'GET' && pathname === '/api/health') {
      return send(res, 200, { ok: true, name: 'ARF', version: '1.0.0' });
    }
    if (req.method === 'GET' && pathname === '/api/languages') {
      return send(res, 200, { languages: listLanguages() });
    }

    if (pathname.startsWith('/api/')) {
      if (!authed(req)) return send(res, 401, { error: 'unauthorized' });

      try {
        if (req.method === 'GET' && pathname === '/api/status') {
          return send(res, 200, app.status());
        }
        if (req.method === 'GET' && pathname === '/api/audit') {
          return send(res, 200, { entries: app.audit.tail(100), chain: app.audit.verify() });
        }
        if (req.method === 'GET' && pathname === '/api/devices') {
          return send(res, 200, { devices: app.registry.list(), grants: app.policy.listGrants() });
        }
        if (req.method === 'POST' && pathname === '/api/command') {
          const body = await readBody(req);
          if (typeof body.text !== 'string' || body.text.length > 1000) {
            return send(res, 400, { error: 'text required (max 1000 chars)' });
          }
          const result = app.assistant.handle(body.text, {
            lang: typeof body.lang === 'string' ? body.lang : 'en-US',
            speaker: typeof body.speaker === 'string' ? body.speaker : 'owner',
          });
          return send(res, 200, result);
        }
        if (req.method === 'POST' && pathname === '/api/confirm') {
          const body = await readBody(req);
          if (typeof body.token !== 'string') return send(res, 400, { error: 'token required' });
          const result = app.assistant.confirm(body.token, {
            lang: typeof body.lang === 'string' ? body.lang : 'en-US',
            speaker: typeof body.speaker === 'string' ? body.speaker : 'owner',
          });
          return send(res, 200, result);
        }
        if (req.method === 'POST' && pathname === '/api/grant') {
          const body = await readBody(req);
          if (typeof body.deviceId !== 'string' || typeof body.capability !== 'string') {
            return send(res, 400, { error: 'deviceId and capability required' });
          }
          if (!app.registry.get(body.deviceId)) return send(res, 404, { error: 'unknown device' });
          if (!app.registry.hasCapability(body.deviceId, body.capability)) {
            return send(res, 400, { error: 'device does not expose that capability' });
          }
          return send(res, 200, { grant: app.grant(body.deviceId, body.capability, body.grantedBy || 'owner') });
        }
        if (req.method === 'POST' && pathname === '/api/revoke') {
          const body = await readBody(req);
          if (typeof body.deviceId !== 'string' || typeof body.capability !== 'string') {
            return send(res, 400, { error: 'deviceId and capability required' });
          }
          return send(res, 200, { revoked: app.revoke(body.deviceId, body.capability, body.revokedBy || 'owner') });
        }
        return send(res, 404, { error: 'not found' });
      } catch (err) {
        return send(res, 400, { error: String(err?.message || err) });
      }
    }

    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    return serveStatic(req, res, pathname);
  });

  server.listen(port, host, () => {
    const addr = server.address();
    // The token is printed once so the operator can pair a client. It is never
    // logged again and never exposed over the API.
    process.stdout.write(
      `ARF listening on http://${addr.address}:${addr.port}\n` +
      `Pairing token: ${token}\n`
    );
  });

  return { server, app, token };
}

// Allow `node src/server/server.js` directly.
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}
