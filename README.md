# ARF — Adaptive Responsive Framework

A cross-device, multilingual voice assistant that runs on your own hardware and
only acts on devices you have explicitly approved.

ARF is deliberately built around one rule: **nothing is permitted implicitly.**
Every device capability must be paired and granted by you, every action is
logged in a tamper-evident audit chain, and sensitive actions require a
second confirmation. That is what makes "control all my apps" safe to build.

## What ARF does

- **Any device** — the UI is a responsive web app, so it runs on phones,
  tablets, desktops, kiosks, and TVs. A CLI covers headless boxes like a Pi.
- **39 languages** — speech-to-text and text-to-speech use the browser's own
  engines. Intent parsing and responses are localized in the app itself.
- **Voice and text** — tap the mic to speak, or type. Both paths are identical
  from the intent layer down.
- **Device control with consent** — pair a device, grant the specific
  capabilities you want, revoke any time.
- **Tamper-evident audit log** — every utterance, grant, action, and denial is
  hash-chained. You can prove the log was not edited.
- **Offline-first** — no cloud service is required. No telemetry. No hidden
  network calls.

## What ARF deliberately does not do

It will not break into devices, bypass authentication, or act on hardware that
was not paired by its owner. Those are not "missing features" — they are the
line between an assistant and malware. Anything ARF can touch, you paired and
granted on purpose.

## Quick start

```bash
npm start
```

The server prints a URL and a one-time **pairing token**:

```
ARF listening on http://127.0.0.1:8787
Pairing token: 6f1c...
```

Open the URL, click the gear icon, paste the token, and save. The device list
appears; tick the capabilities you want ARF to be able to use.

By default ARF binds to **loopback only**. To reach it from another device on
your network:

```bash
ARF_HOST=0.0.0.0 ARF_PORT=8787 ARF_TOKEN=$(openssl rand -hex 24) npm start
```

Only do this on a network you trust, and keep the token secret — it is the
only thing standing between a client and your devices.

## Try it

```bash
npm run cli -- "turn on the kitchen light"     # denied until you grant it
npm run cli -- "calculate 12 times 8"
npm run cli -- --lang es-ES "hola"
npm run cli -- --interactive
```

Or just type into the web UI. Say **help** to list what it can do.

## How the security model works

```
utterance ─▶ intent parser ─▶ policy engine ─▶ connector ─▶ device
                                   │
                                   ├─ no grant?      → deny, log
                                   ├─ revoked?       → deny, log
                                   ├─ expired?       → deny, log
                                   └─ sensitive?     → require confirmation token
```

1. **Pairing** (`ConnectorRegistry.register`) — a device only exists to ARF if
   it was registered deliberately. There is no device discovery that reaches
   out and grabs things.
2. **Grants** (`PolicyEngine.grant`) — access is per device *and* per
   capability. Granting `kitchen-light: device.on` does not grant `device.off`,
   and does not touch any other device. Grants can expire.
3. **Confirmation** — capabilities in `CONFIRMATION_REQUIRED` (unlocking a
   door, disarming an alarm, sending a payment, opening a camera stream) always
   need a one-time token, even when granted. Tokens expire in 60 seconds and
   are bound to the speaker.
4. **Audit** (`AuditLog`) — SHA-256 hash chain. `verify()` recomputes it and
   reports the exact entry number where tampering occurred.
5. **Transport** — a per-run bearer token, compared in constant time. Strict
   CSP with no inline script and no external origins. Path traversal is
   rejected. Bodies are size-capped. Per-IP rate limiting.

### Adding a real device

A connector is a small object. Here is a light that talks to your own bridge:

```js
app.pairDevice({
  id: 'desk-lamp',
  name: 'Desk Lamp',
  kind: 'light',
  capabilities: ['device.on', 'device.off', 'device.toggle'],
  aliases: ['desk lamp', 'lampara del escritorio'],
  invoke: async ({ action }) => {
    await fetch('http://192.168.1.50/light', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    return { action };
  },
});
```

Then grant it:

```js
app.grant('desk-lamp', 'device.on');
```

`invoke` is never called unless the policy engine says yes first. That ordering
is enforced in one place (`Assistant#handleDevice`), which is what keeps the
guarantee honest as the project grows.

## Configuration

| Variable     | Default      | Purpose                                   |
|--------------|--------------|-------------------------------------------|
| `ARF_PORT`   | `8787`       | Listen port                               |
| `ARF_HOST`   | `127.0.0.1`  | Bind address. Use `0.0.0.0` for LAN.      |
| `ARF_TOKEN`  | random       | Pairing token. Set it to keep it stable.  |
| `ARF_AUDIT`  | `data/audit.log` | Audit log path.                       |
| `ARF_URL`    | `http://127.0.0.1:8787` | Broker URL for the CLI.     |

## Tests

```bash
npm test
```

39 tests cover the policy engine, audit integrity and tamper detection, the
intent parser across languages, the multilingual alias resolution, the
orchestrator, and the HTTP layer (auth, headers, traversal, size limits).

Notable cases: *a denied action never reaches the connector*, and *detects
tampering of a persisted log*.

## Project layout

```
src/
  core/         languages, intents, i18n, math, assistant
  security/     policy engine, audit chain
  connectors/   registry + demo devices
  server/       HTTP broker
  cli.js        headless client
public/         web UI (no build step, no dependencies)
tests/          node:test suites
```

## Extending

- **Add a language**: add a table to `src/core/intents.js` and strings to
  `src/core/i18n.js`. The registry in `languages.js` drives the UI list.
- **Add a skill**: add an intent, a handler in `Assistant#dispatch`, and
  response strings.
- **Add a device type**: register a connector with its capabilities.

## Roadmap

- Weather, calendar, and music skills behind explicit provider configuration
  (ARF refuses to guess rather than invent data).
- Wake-word support via the Web Speech API where the browser allows it.
- Grant expiry UI and per-speaker profiles.

## License

MIT
