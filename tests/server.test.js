import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server/server.js';

function withServer(fn, opts = {}) {
  return async () => {
    const { server, token } = startServer({ port: 0, host: '127.0.0.1', token: 'test-token', persistAudit: false, ...opts });
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    try { await fn(base, token); } finally { server.close(); }
  };
}

test('health is public', withServer(async (base) => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, 'ARF');
}));

test('state endpoints reject missing token', withServer(async (base) => {
  const res = await fetch(`${base}/api/status`);
  assert.equal(res.status, 401);
}));

test('state endpoints reject a wrong token', withServer(async (base) => {
  const res = await fetch(`${base}/api/status`, { headers: { Authorization: 'Bearer nope' } });
  assert.equal(res.status, 401);
}));

test('valid token returns status', withServer(async (base, token) => {
  const res = await fetch(`${base}/api/status`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((await res.json()).devices));
}));

test('security headers are present', withServer(async (base) => {
  const res = await fetch(`${base}/`);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
}));

test('oversized command text is rejected', withServer(async (base, token) => {
  const res = await fetch(`${base}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: 'x'.repeat(2000) }),
  });
  assert.equal(res.status, 400);
}));

test('command flow: denied then granted', withServer(async (base, token) => {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const denied = await (await fetch(`${base}/api/command`, { method: 'POST', headers: h, body: JSON.stringify({ text: 'turn on the kitchen light' }) })).json();
  assert.equal(denied.denied, true);

  await fetch(`${base}/api/grant`, { method: 'POST', headers: h, body: JSON.stringify({ deviceId: 'kitchen-light', capability: 'device.on' }) });

  const ok = await (await fetch(`${base}/api/command`, { method: 'POST', headers: h, body: JSON.stringify({ text: 'turn on the kitchen light' }) })).json();
  assert.equal(ok.denied, undefined);
  assert.equal(ok.result.power, true);
}));

test('grant is rejected for a capability the device lacks', withServer(async (base, token) => {
  const res = await fetch(`${base}/api/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId: 'kitchen-light', capability: 'lock.unlock' }),
  });
  assert.equal(res.status, 400);
}));

test('path traversal is blocked', withServer(async (base) => {
  const res = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  assert.ok([403, 404].includes(res.status));
}));
