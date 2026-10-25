// ARF client. Speech-to-text and text-to-speech use the browser's own engines,
// so audio never leaves the device unless the browser itself is cloud-backed.
// The pairing token lives in localStorage and is sent only to the local broker.

const $ = (id) => document.getElementById(id);
const els = {
  transcript: $('transcript'), status: $('status'), composer: $('composer'),
  mic: $('mic-btn'), input: $('text-input'), speakToggle: $('speak-toggle'),
  langSelect: $('lang-select'), settingsBtn: $('settings-btn'), settings: $('settings'),
  closeSettings: $('close-settings'), tokenInput: $('token-input'), saveToken: $('save-token'),
  connStatus: $('conn-status'), devicesList: $('devices-list'), auditList: $('audit-list'),
  chainStatus: $('chain-status'), confirmBanner: $('confirm-banner'), confirmText: $('confirm-text'),
  confirmYes: $('confirm-yes'), confirmNo: $('confirm-no'),
};

const state = {
  token: localStorage.getItem('arf.token') || '',
  lang: localStorage.getItem('arf.lang') || 'en-US',
  speak: localStorage.getItem('arf.speak') !== 'off',
  listening: false,
  pendingToken: null,
  voices: [],
};

// ---------- rendering ----------
function addMessage(role, text, meta = '') {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  if (meta) {
    const span = document.createElement('span');
    span.className = 'meta';
    span.textContent = meta;
    div.appendChild(span);
  }
  els.transcript.appendChild(div);
  els.transcript.scrollTop = els.transcript.scrollHeight;
  return div;
}

function setStatus(text) { els.status.textContent = text; }

function setDirection(lang) {
  const rtl = ['ar', 'he', 'ur', 'fa'].includes(lang.split('-')[0]);
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

// ---------- api ----------
async function api(path, { method = 'GET', body } = {}) {
  if (!state.token) throw new Error('not-paired');
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- speech output ----------
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  state.voices = speechSynthesis.getVoices();
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function speak(text, lang) {
  if (!state.speak || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const match = state.voices.find((v) => v.lang === lang)
    || state.voices.find((v) => v.lang.split('-')[0] === lang.split('-')[0]);
  if (match) u.voice = match;
  u.rate = 1.0;
  speechSynthesis.speak(u);
}

// ---------- speech input ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function initRecognition() {
  if (!SR) return null;
  const r = new SR();
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onstart = () => { state.listening = true; els.mic.setAttribute('aria-pressed', 'true'); setStatus('Listening…'); };
  r.onend = () => { state.listening = false; els.mic.setAttribute('aria-pressed', 'false'); };
  r.onerror = (e) => {
    state.listening = false;
    els.mic.setAttribute('aria-pressed', 'false');
    setStatus(e.error === 'not-allowed' ? 'Microphone permission denied.' : `Speech error: ${e.error}`);
  };
  r.onresult = (e) => {
    const text = e.results[0][0].transcript;
    if (text) submit(text);
  };
  return r;
}

function toggleListening() {
  if (!SR) { setStatus('This browser has no speech recognition. Typing still works.'); return; }
  if (!recognition) recognition = initRecognition();
  if (state.listening) { recognition.stop(); return; }
  recognition.lang = state.lang;
  try { recognition.start(); } catch { /* already started */ }
}

// ---------- command flow ----------
async function submit(text) {
  addMessage('user', text);
  try {
    const result = await api('/api/command', { method: 'POST', body: { text, lang: state.lang } });
    handleResult(result);
  } catch (err) {
    if (err.message === 'not-paired') {
      addMessage('assistant', 'I need a pairing token first. Open settings and paste the token from the server console.', 'not paired');
      openSettings();
    } else {
      addMessage('assistant', `Request failed: ${err.message}`, 'error');
    }
  }
}

function handleResult(result) {
  const meta = result.intent ? `intent: ${result.intent}` : '';
  addMessage('assistant', result.text, meta).classList.toggle('denied', Boolean(result.denied));
  speak(result.text, result.lang || state.lang);
  if (result.switchTo) {
    state.lang = result.switchTo;
    localStorage.setItem('arf.lang', state.lang);
    els.langSelect.value = state.lang;
    setDirection(state.lang);
  }
  if (result.requiresConfirmation && result.token) {
    state.pendingToken = result.token;
    els.confirmText.textContent = `Sensitive action requested. Confirm to proceed.`;
    els.confirmBanner.hidden = false;
  }
}

async function confirmPending(accept) {
  els.confirmBanner.hidden = true;
  const token = state.pendingToken;
  state.pendingToken = null;
  if (!accept || !token) { setStatus('Cancelled.'); return; }
  try {
    const result = await api('/api/confirm', { method: 'POST', body: { token, lang: state.lang } });
    handleResult(result);
  } catch (err) {
    addMessage('assistant', `Confirmation failed: ${err.message}`, 'error');
  }
}

// ---------- settings ----------
function openSettings() { els.settings.showModal(); refreshSettings(); }

async function refreshSettings() {
  els.tokenInput.value = state.token ? '••••••••' : '';
  if (!state.token) { els.connStatus.textContent = 'Not paired yet.'; return; }
  try {
    const data = await api('/api/devices');
    els.connStatus.textContent = 'Paired.';
    renderDevices(data.devices, data.grants);
    const audit = await api('/api/audit');
    renderAudit(audit.entries, audit.chain);
  } catch (err) {
    els.connStatus.textContent = `Could not reach broker: ${err.message}`;
  }
}

function renderDevices(devices, grants) {
  els.devicesList.innerHTML = '';
  const grantedSet = new Set(grants.filter((g) => !g.revoked).map((g) => `${g.deviceId}::${g.capability}`));
  for (const d of devices) {
    const card = document.createElement('div');
    card.className = 'device';
    const name = document.createElement('div');
    name.className = 'device-name';
    name.textContent = d.name;
    const kind = document.createElement('div');
    kind.className = 'device-kind';
    kind.textContent = d.kind;
    card.append(name, kind);

    const caps = document.createElement('div');
    caps.className = 'caps';
    for (const cap of d.capabilities) {
      const label = document.createElement('label');
      label.className = 'cap' + (grantedSet.has(`${d.id}::${cap}`) ? ' granted' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = grantedSet.has(`${d.id}::${cap}`);
      cb.addEventListener('change', async () => {
        try {
          if (cb.checked) await api('/api/grant', { method: 'POST', body: { deviceId: d.id, capability: cap } });
          else await api('/api/revoke', { method: 'POST', body: { deviceId: d.id, capability: cap } });
          refreshSettings();
        } catch (err) {
          cb.checked = !cb.checked;
          setStatus(`Could not update grant: ${err.message}`);
        }
      });
      label.append(cb, document.createTextNode(cap));
      caps.appendChild(label);
    }
    card.appendChild(caps);
    els.devicesList.appendChild(card);
  }
}

function renderAudit(entries, chain) {
  els.chainStatus.textContent = chain.valid ? `Chain valid (${chain.entries} entries).` : `CHAIN BROKEN at #${chain.brokenAt}.`;
  els.auditList.innerHTML = '';
  for (const e of [...entries].reverse()) {
    const row = document.createElement('div');
    row.className = 'audit-row';
    const denied = String(e.outcome || '').startsWith('denied') || e.outcome === 'error';
    const span = document.createElement('span');
    span.className = denied ? 'deny' : 'ok';
    span.textContent = `#${e.seq} ${e.type} ${e.outcome || ''}`.trim();
    row.append(span, document.createTextNode(` — ${e.at}`));
    els.auditList.appendChild(row);
  }
}

// ---------- boot ----------
async function loadLanguages() {
  try {
    const res = await fetch('/api/languages');
    const { languages } = await res.json();
    els.langSelect.innerHTML = '';
    for (const l of languages) {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = `${l.name} — ${l.native}`;
      els.langSelect.appendChild(opt);
    }
    els.langSelect.value = state.lang;
  } catch { /* fall back to English only */ }
}

function wireEvents() {
  els.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = '';
    submit(text);
  });
  els.mic.addEventListener('click', toggleListening);
  els.langSelect.addEventListener('change', () => {
    state.lang = els.langSelect.value;
    localStorage.setItem('arf.lang', state.lang);
    setDirection(state.lang);
    setStatus(`Language set to ${els.langSelect.selectedOptions[0].textContent}.`);
  });
  els.speakToggle.addEventListener('click', () => {
    state.speak = !state.speak;
    localStorage.setItem('arf.speak', state.speak ? 'on' : 'off');
    els.speakToggle.setAttribute('aria-pressed', String(state.speak));
    els.speakToggle.textContent = state.speak ? 'Voice on' : 'Voice off';
    if (!state.speak && 'speechSynthesis' in window) speechSynthesis.cancel();
  });
  els.settingsBtn.addEventListener('click', openSettings);
  els.closeSettings.addEventListener('click', () => els.settings.close());
  els.saveToken.addEventListener('click', async () => {
    const val = els.tokenInput.value.trim();
    if (val && !val.startsWith('•')) { state.token = val; localStorage.setItem('arf.token', val); }
    await refreshSettings();
  });
  els.confirmYes.addEventListener('click', () => confirmPending(true));
  els.confirmNo.addEventListener('click', () => confirmPending(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.pendingToken) confirmPending(false);
  });
}

(async function boot() {
  wireEvents();
  setDirection(state.lang);
  els.speakToggle.setAttribute('aria-pressed', String(state.speak));
  els.speakToggle.textContent = state.speak ? 'Voice on' : 'Voice off';
  await loadLanguages();
  addMessage('assistant', 'ARF ready. Tap the microphone or type a command. Say "help" to hear what I can do.', 'boot');
  if (!SR) setStatus('Speech recognition unavailable here — typing works fine.');
  if (state.token) refreshSettings();
})();
