// ARF orchestrator. Turns a text utterance into a response, enforcing policy at
// the single choke point where any device action can occur.

import { randomBytes } from 'node:crypto';
import { parseIntent, extractTarget, INTENTS } from './intents.js';
import { t } from './i18n.js';
import { evaluate as evalMath, formatNumber } from './math.js';
import { resolveLanguage, LANGUAGES } from './languages.js';
import { CONFIRMATION_REQUIRED } from '../security/policy.js';

const DEVICE_ACTION_MAP = {
  [INTENTS.DEVICE_ON]: { action: 'on', capability: 'device.on' },
  [INTENTS.DEVICE_OFF]: { action: 'off', capability: 'device.off' },
  [INTENTS.DEVICE_TOGGLE]: { action: 'toggle', capability: 'device.toggle' },
  [INTENTS.DEVICE_LOCK]: { action: 'lock', capability: 'lock.lock' },
  [INTENTS.DEVICE_UNLOCK]: { action: 'unlock', capability: 'lock.unlock' },
};

export class Assistant {
  #policy; #audit; #registry; #memory; #notes; #pending; #clock; #timers; #storage;

  constructor({ policy, audit, registry, clock = () => new Date(), storage = null }) {
    this.#policy = policy;
    this.#audit = audit;
    this.#registry = registry;
    this.#clock = clock;
    this.#memory = new Map();   // key -> value
    this.#notes = [];
    this.#pending = new Map();  // token -> {deviceId, action, capability, expiresAt}
    this.#timers = [];
    this.#storage = storage;
  }

  #now() {
    return this.#clock().toISOString();
  }

  get pendingCount() { return this.#pending.size; }
  get notes() { return [...this.#notes]; }
  get timers() { return [...this.#timers]; }

  // Single entry point for all utterances.
  handle(text, { lang = 'en-US', speaker = 'owner' } = {}) {
    const language = resolveLanguage(lang);
    const parsed = parseIntent(text, language);
    let reply;
    try {
      reply = this.#dispatch(parsed, { language, speaker, text });
    } catch (err) {
      this.#audit.record({ type: 'error', actor: speaker, detail: String(err?.message || err), outcome: 'error' });
      reply = { text: t(language, 'error'), intent: parsed.intent, lang: language };
    }
    this.#audit.record({
      type: 'utterance',
      actor: speaker,
      text,
      intent: reply.intent ?? parsed.intent,
      lang: language,
      outcome: reply.denied ? 'denied' : 'ok',
    });
    return { ...reply, lang: language, parsed };
  }

  #dispatch(parsed, ctx) {
    const { intent } = parsed;
    const { language, speaker, text } = ctx;

    switch (intent) {
      case INTENTS.GREET:
        return this.#say(language, 'greeting');
      case INTENTS.IDENTITY:
        return this.#say(language, 'identity');
      case INTENTS.HELP:
        return this.#say(language, 'help');
      case INTENTS.STOP:
        this.#pending.clear();
        return this.#say(language, 'stopped');

      case INTENTS.TIME: {
        const now = this.#clock();
        const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return this.#say(language, 'time', { time });
      }
      case INTENTS.DATE: {
        const now = this.#clock();
        const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return this.#say(language, 'date', { date });
      }
      case INTENTS.WEATHER:
        return this.#say(language, 'weather_offline');

      case INTENTS.TIMER: {
        const dur = parseDuration(text);
        if (!dur) return this.#say(language, 'math_failed');
        this.#timers.push({ label: dur.label, seconds: dur.seconds, setAt: this.#now() });
        return this.#say(language, 'timer_set', { duration: dur.label });
      }

      case INTENTS.MATH: {
        const expr = stripMathLead(text);
        const value = evalMath(expr);
        if (value === null) return this.#say(language, 'math_failed');
        return this.#say(language, 'math_result', { expr, result: formatNumber(value) });
      }

      case INTENTS.NOTE:
      case INTENTS.REMEMBER: {
        const body = stripNoteLead(text);
        if (!body) return this.#say(language, 'note_empty');
        this.#notes.push({ body, at: this.#now(), lang: language });
        return this.#say(language, 'note_saved');
      }
      case INTENTS.RECALL: {
        const key = stripRecallLead(text);
        const hit = [...this.#notes].reverse().find((n) => n.body.toLowerCase().includes(key.toLowerCase()));
        return hit
          ? this.#say(language, 'recall_found', { value: hit.body })
          : this.#say(language, 'recall_missing');
      }

      case INTENTS.LANGUAGE:
        return this.#handleLanguage(text, language);

      case INTENTS.TRANSLATE:
        return this.#say(language, 'translate_offline');

      case INTENTS.DEVICE_LIST: {
        const devices = this.#registry.list();
        if (devices.length === 0) return this.#say(language, 'devices_none');
        const names = devices.map((d) => d.name).join(', ');
        return this.#say(language, 'devices_list', { count: devices.length, devices: names });
      }

      case INTENTS.DEVICE_ON:
      case INTENTS.DEVICE_OFF:
      case INTENTS.DEVICE_TOGGLE:
      case INTENTS.DEVICE_LOCK:
      case INTENTS.DEVICE_UNLOCK:
        return this.#handleDevice(parsed, { language, speaker });

      case INTENTS.UNKNOWN:
      default:
        return this.#say(language, 'unknown');
    }
  }

  #handleLanguage(text, language) {
    const wanted = detectLanguageRequest(text);
    if (wanted) {
      return {
        ...this.#say(wanted.code, 'lang_set', { language: wanted.name }),
        switchTo: wanted.code,
        intent: INTENTS.LANGUAGE,
      };
    }
    return this.#say(language, 'lang_unknown', {
      language: extractTarget(text) || '?',
      count: Object.keys(LANGUAGES).length,
    });
  }

  // Every device action funnels through here. Policy is checked before the
  // connector is ever invoked, and sensitive actions need a matching token.
  #handleDevice(parsed, { language, speaker }) {
    const mapping = DEVICE_ACTION_MAP[parsed.intent];
    const { action, capability } = mapping;
    const target = extractTarget(parsed.text);
    const device = this.#registry.find(target);

    if (!device) {
      this.#audit.record({ type: 'device.action', actor: speaker, target, capability, outcome: 'unknown-device' });
      return { ...this.#say(language, 'device_unknown', { device: target }), denied: true, intent: parsed.intent };
    }

    if (!this.#registry.hasCapability(device.id, capability)) {
      this.#audit.record({ type: 'device.action', actor: speaker, deviceId: device.id, capability, outcome: 'unsupported' });
      return { ...this.#say(language, 'device_unsupported', { device: device.name }), denied: true, intent: parsed.intent };
    }

    const decision = this.#policy.evaluate({ deviceId: device.id, capability, now: this.#now() });
    if (!decision.allowed) {
      this.#audit.record({ type: 'device.action', actor: speaker, deviceId: device.id, capability, outcome: `denied:${decision.reason}` });
      return { ...this.#say(language, 'device_denied', { device: device.name }), denied: true, intent: parsed.intent };
    }

    // Sensitive capability: issue a one-time confirmation token, act on confirm.
    if (decision.needsConfirmation || CONFIRMATION_REQUIRED.has(capability)) {
      const token = randomBytes(3).toString('hex');
      this.#pending.set(token, {
        deviceId: device.id,
        action,
        capability,
        expiresAt: Date.now() + 60_000,
        speaker,
      });
      this.#audit.record({ type: 'device.action', actor: speaker, deviceId: device.id, capability, outcome: 'awaiting-confirmation', token });
      return {
        ...this.#say(language, 'confirm_required', { device: device.name, token }),
        requiresConfirmation: true,
        token,
        intent: parsed.intent,
      };
    }

    return this.#invoke(device, action, capability, language, speaker, parsed.intent);
  }

  #invoke(device, action, capability, language, speaker, intent) {
    try {
      const result = device.invoke({ action, capability, at: this.#now() });
      this.#audit.record({ type: 'device.action', actor: speaker, deviceId: device.id, capability, outcome: 'ok' });
      return {
        ...this.#say(language, 'device_ok', { action: actionLabel(action, language), device: device.name }),
        action, device: device.name, deviceId: device.id, result, intent,
      };
    } catch (err) {
      this.#audit.record({ type: 'device.action', actor: speaker, deviceId: device.id, capability, outcome: `error:${err?.message || err}` });
      return { ...this.#say(language, 'device_failed', { device: device.name, error: err?.message || 'error' }), denied: true, intent };
    }
  }

  // Resolve a pending sensitive action.
  confirm(token, { language = 'en-US', speaker = 'owner' } = {}) {
    const lang = resolveLanguage(language);
    const pending = this.#pending.get(token);
    if (!pending || pending.expiresAt < Date.now() || pending.speaker !== speaker) {
      this.#pending.delete(token);
      this.#audit.record({ type: 'device.confirm', actor: speaker, token, outcome: 'invalid-or-expired' });
      return { ...this.#say(lang, 'confirm_bad'), denied: true };
    }
    this.#pending.delete(token);
    const device = this.#registry.get(pending.deviceId);
    const reply = this.#invoke(device, pending.action, pending.capability, lang, speaker, pending.capability);
    return { ...reply, text: t(lang, 'confirm_ok', { action: actionLabel(pending.action, lang), device: device.name }) };
  }

  #say(lang, key, vars) {
    return { text: t(lang, key, vars), intent: key };
  }
}

const ACTION_LABELS = {
  en: { on: 'turned on', off: 'turned off', toggle: 'toggled', lock: 'locked', unlock: 'unlocked' },
  es: { on: 'encendido', off: 'apagado', toggle: 'alternado', lock: 'bloqueado', unlock: 'desbloqueado' },
  fr: { on: 'allume', off: 'eteint', toggle: 'bascule', lock: 'verrouille', unlock: 'deverrouille' },
  de: { on: 'eingeschaltet', off: 'ausgeschaltet', toggle: 'umgeschaltet', lock: 'verriegelt', unlock: 'entriegelt' },
  hi: { on: 'chalu', off: 'band', toggle: 'badla', lock: 'lock', unlock: 'unlock' },
  ar: { on: 'mushaghghal', off: 'mutfi', toggle: 'tabdil', lock: 'muqfal', unlock: 'maftuh' },
  zh: { on: 'kaiqi', off: 'guanbi', toggle: 'qiehuan', lock: 'suoding', unlock: 'jiesuo' },
  ja: { on: 'on', off: 'off', toggle: 'kirikae', lock: 'lock', unlock: 'unlock' },
  pt: { on: 'ligado', off: 'desligado', toggle: 'alternado', lock: 'trancado', unlock: 'destrancado' },
  ru: { on: 'vklyucheno', off: 'vyklyucheno', toggle: 'pereklyucheno', lock: 'zaperto', unlock: 'otkryto' },
};

function actionLabel(action, lang) {
  const base = String(lang || 'en').split('-')[0].toLowerCase();
  return (ACTION_LABELS[base] || ACTION_LABELS.en)[action] || action;
}

function stripMathLead(text) {
  return String(text)
    .replace(/^\s*(calculate|compute|what is|what's|how much is)\s*/i, '')
    .replace(/\?+$/, '')
    .trim();
}

function stripNoteLead(text) {
  return String(text)
    .replace(/^\s*(take a note|make a note|note that|write this down|remember that|keep in mind|store this)\s*/i, '')
    .trim();
}

function stripRecallLead(text) {
  return String(text)
    .replace(/^\s*(what did i say about|recall|do you remember)\s*/i, '')
    .replace(/\?+$/, '')
    .trim();
}

function parseDuration(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*(second|seconds|minute|minutes|hour|hours|sec|min|hr)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1;
  return { seconds: n * mult, label: `${m[1]} ${m[2]}` };
}

// Map a spoken language name to a supported tag.
const LANGUAGE_NAMES = {
  english: 'en-US', spanish: 'es-ES', espanol: 'es-ES', french: 'fr-FR', francais: 'fr-FR',
  german: 'de-DE', deutsch: 'de-DE', italian: 'it-IT', portuguese: 'pt-BR', portugues: 'pt-BR',
  dutch: 'nl-NL', russian: 'ru-RU', turkish: 'tr-TR', arabic: 'ar-SA', hebrew: 'he-IL',
  hindi: 'hi-IN', bengali: 'bn-IN', urdu: 'ur-PK', tamil: 'ta-IN', telugu: 'te-IN',
  marathi: 'mr-IN', gujarati: 'gu-IN', indonesian: 'id-ID', malay: 'ms-MY', thai: 'th-TH',
  vietnamese: 'vi-VN', japanese: 'ja-JP', korean: 'ko-KR', chinese: 'zh-CN', mandarin: 'zh-CN',
  swedish: 'sv-SE', danish: 'da-DK', norwegian: 'nb-NO', finnish: 'fi-FI', czech: 'cs-CZ',
  greek: 'el-GR', ukrainian: 'uk-UA', romanian: 'ro-RO', hungarian: 'hu-HU',
  swahili: 'sw-KE', filipino: 'fil-PH', tagalog: 'fil-PH', polish: 'pl-PL',
};

function detectLanguageRequest(text) {
  const t2 = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [name, code] of Object.entries(LANGUAGE_NAMES)) {
    if (t2.includes(name)) {
      return { code, name: LANGUAGES[code]?.name || name };
    }
  }
  return null;
}
