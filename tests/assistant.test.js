import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function app() {
  return createApp({ withDemoDevices: true, persistAudit: false });
}

test('answers identity and help', () => {
  const a = app();
  assert.match(a.assistant.handle('who are you').text, /ARF/);
  assert.match(a.assistant.handle('help').text, /time|date|devices/i);
});

test('does math without eval', () => {
  const a = app();
  assert.match(a.assistant.handle('calculate 12 times 8').text, /96/);
  assert.match(a.assistant.handle('calculate alert(1)').text, /could not/i);
});

test('reports time and date', () => {
  const a = app();
  assert.match(a.assistant.handle('what time is it').text, /\d{2}:\d{2}/);
  assert.match(a.assistant.handle('what date is it').text, /\d{4}/);
});

test('refuses to guess weather without a provider', () => {
  const a = app();
  assert.match(a.assistant.handle("what's the weather").text, /do not have a weather feed/i);
});

test('device action is DENIED when no grant exists', () => {
  const a = app();
  const r = a.assistant.handle('turn on the kitchen light');
  assert.equal(r.denied, true);
  assert.match(r.text, /not allowed/i);
});

test('device action works after an explicit grant', () => {
  const a = app();
  a.grant('kitchen-light', 'device.on');
  const r = a.assistant.handle('turn on the kitchen light');
  assert.equal(r.denied, undefined);
  assert.match(r.text, /Done/);
  assert.equal(r.result.power, true);
});

test('granting one capability does not grant another', () => {
  const a = app();
  a.grant('kitchen-light', 'device.on');
  const r = a.assistant.handle('turn off the kitchen light');
  assert.equal(r.denied, true);
});

test('sensitive action requires a confirmation token', () => {
  const a = app();
  a.grant('front-door', 'lock.unlock');
  const r = a.assistant.handle('unlock the front door');
  assert.equal(r.requiresConfirmation, true);
  assert.ok(r.token);
  const bad = a.assistant.confirm('deadbeef');
  assert.equal(bad.denied, true);
  const ok = a.assistant.confirm(r.token);
  assert.equal(ok.denied, undefined);
});

test('revoking a grant stops the action', () => {
  const a = app();
  a.grant('tv', 'device.on');
  assert.equal(a.assistant.handle('turn on the tv').denied, undefined);
  a.revoke('tv', 'device.on');
  assert.equal(a.assistant.handle('turn on the tv').denied, true);
});

test('unknown device is reported, not guessed', () => {
  const a = app();
  const r = a.assistant.handle('turn on the submarine');
  assert.equal(r.denied, true);
  assert.match(r.text, /could not find/i);
});

test('a denied action never reaches the connector', () => {
  const a = createApp({ withDemoDevices: false });
  let invoked = false;
  a.pairDevice({
    id: 'probe', name: 'Probe', kind: 'test',
    capabilities: ['device.on'],
    invoke: () => { invoked = true; return {}; },
  });
  const r = a.assistant.handle('turn on the probe');
  assert.equal(r.denied, true);
  assert.equal(invoked, false, 'connector must not be invoked without a grant');
});

test('language switching works and responds in the target language', () => {
  const a = app();
  const r = a.assistant.handle('speak in Spanish');
  assert.equal(r.switchTo, 'es-ES');
  const es = a.assistant.handle('hola', { lang: 'es-ES' });
  assert.match(es.text, /ARF/);
  assert.equal(es.lang, 'es-ES');
});

test('every utterance is written to the audit log', () => {
  const a = app();
  const before = a.audit.all().length;
  a.assistant.handle('hello');
  a.assistant.handle('turn on the kitchen light');
  assert.ok(a.audit.all().length > before);
  assert.equal(a.audit.verify().valid, true);
});

test('audit log records denials explicitly', () => {
  const a = app();
  a.assistant.handle('turn on the kitchen light');
  const denials = a.audit.all().filter((e) => String(e.outcome).startsWith('denied'));
  assert.ok(denials.length >= 1);
});
