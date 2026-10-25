import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../src/security/policy.js';
import { AuditLog } from '../src/security/audit.js';

test('denies by default when no grant exists', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  const d = p.evaluate({ deviceId: 'x', capability: 'device.on' });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'no-grant');
});

test('allows after an explicit grant', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  p.grant({ deviceId: 'x', capability: 'device.on', grantedBy: 'owner' });
  assert.equal(p.evaluate({ deviceId: 'x', capability: 'device.on' }).allowed, true);
});

test('grant does not leak to other devices or capabilities', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  p.grant({ deviceId: 'x', capability: 'device.on', grantedBy: 'owner' });
  assert.equal(p.evaluate({ deviceId: 'y', capability: 'device.on' }).allowed, false);
  assert.equal(p.evaluate({ deviceId: 'x', capability: 'device.off' }).allowed, false);
});

test('revoked grants stop working', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  p.grant({ deviceId: 'x', capability: 'device.on', grantedBy: 'owner' });
  p.revoke({ deviceId: 'x', capability: 'device.on', revokedBy: 'owner' });
  const d = p.evaluate({ deviceId: 'x', capability: 'device.on' });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'revoked');
});

test('expired grants stop working', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  p.grant({ deviceId: 'x', capability: 'device.on', grantedBy: 'owner', expiresAt: '2020-01-01T00:00:00Z' });
  assert.equal(p.evaluate({ deviceId: 'x', capability: 'device.on' }).reason, 'expired');
});

test('sensitive capabilities require confirmation', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  p.grant({ deviceId: 'door', capability: 'lock.unlock', grantedBy: 'owner' });
  const d = p.evaluate({ deviceId: 'door', capability: 'lock.unlock' });
  assert.equal(d.allowed, true);
  assert.equal(d.needsConfirmation, true);
});

test('grant without consenting actor is rejected', () => {
  const p = new PolicyEngine({ audit: new AuditLog() });
  assert.throws(() => p.grant({ deviceId: 'x', capability: 'device.on' }));
});
