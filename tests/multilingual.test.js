import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { parseIntent, extractTarget, INTENTS } from '../src/core/intents.js';
import { isSupported, resolveLanguage } from '../src/core/languages.js';
import { t } from '../src/core/i18n.js';

test('the language registry covers a broad set and resolves variants', () => {
  assert.ok(isSupported('en-AU'));
  assert.equal(resolveLanguage('en-AU'), 'en-US');
  assert.equal(resolveLanguage('es-MX'), 'es-ES');
  assert.ok(isSupported('zh-TW'));
});

test('intents parse in several languages', () => {
  assert.equal(parseIntent('turn on the light', 'en-US').intent, INTENTS.DEVICE_ON);
  assert.equal(parseIntent('apaga la luz', 'es-ES').intent, INTENTS.DEVICE_OFF);
  assert.equal(parseIntent('allume la lampe', 'fr-FR').intent, INTENTS.DEVICE_ON);
  assert.equal(parseIntent('hilfe', 'de-DE').intent, INTENTS.HELP);
  assert.equal(parseIntent('madad', 'hi-IN').intent, INTENTS.HELP);
  assert.equal(parseIntent('bangzhu', 'zh-CN').intent, INTENTS.HELP);
});

test('targets are stripped of the leading verb', () => {
  assert.equal(extractTarget('turn on the kitchen light'), 'kitchen light');
  assert.equal(extractTarget('apaga la luz'), 'luz');
});

test('responses are localized', () => {
  assert.match(t('en-US', 'greeting'), /ARF/);
  assert.match(t('es-ES', 'greeting'), /Hola/);
  assert.match(t('ja-JP', 'greeting'), /ARF/);
  // Unknown language falls back to English rather than throwing.
  assert.match(t('xx-XX', 'greeting'), /ARF/);
});

test('device control works via localized aliases', () => {
  const a = createApp();
  a.grant('kitchen-light', 'device.on');
  const es = a.assistant.handle('enciende la luz de la cocina', { lang: 'es-ES' });
  assert.equal(es.denied, undefined);
  assert.equal(es.deviceId, 'kitchen-light');

  a.grant('living-room-light', 'device.on');
  const de = a.assistant.handle('einschalten wohnzimmer licht', { lang: 'de-DE' });
  assert.equal(de.deviceId, 'living-room-light');
});

test('the same language is still enforced in other languages', () => {
  const a = createApp();
  // No grant for the Spanish request, so it must be denied.
  const r = a.assistant.handle('apaga la luz de la cocina', { lang: 'es-ES' });
  assert.equal(r.denied, true);
});
