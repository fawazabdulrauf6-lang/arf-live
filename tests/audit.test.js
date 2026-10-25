import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog } from '../src/security/audit.js';

test('records entries in a verifiable hash chain', () => {
  const a = new AuditLog();
  a.record({ type: 'a', actor: 'owner' });
  a.record({ type: 'b', actor: 'owner' });
  const v = a.verify();
  assert.equal(v.valid, true);
  assert.equal(v.entries, 2);
});

test('a persisted log reloads and still verifies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arf-audit-'));
  const path = join(dir, 'audit.log');
  const a = new AuditLog({ path, persist: true });
  a.record({ type: 'a', actor: 'owner' });
  a.record({ type: 'b', actor: 'owner' });
  const reloaded = new AuditLog({ path, persist: true });
  assert.equal(reloaded.verify().valid, true);
  assert.equal(reloaded.all().length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('detects tampering of a persisted log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arf-audit-'));
  const path = join(dir, 'audit.log');
  const a = new AuditLog({ path, persist: true });
  a.record({ type: 'a', actor: 'owner' });
  a.record({ type: 'b', actor: 'owner' });

  // Rewrite the first line with altered content, keeping its old hash.
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const first = JSON.parse(lines[0]);
  first.actor = 'attacker';
  lines[0] = JSON.stringify(first);
  writeFileSync(path, lines.join('\n') + '\n');

  const tampered = new AuditLog({ path, persist: true });
  const v = tampered.verify();
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 0);
  rmSync(dir, { recursive: true, force: true });
});
