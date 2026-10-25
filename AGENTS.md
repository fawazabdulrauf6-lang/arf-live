# AGENTS.md — ARF repository notes

Persistent context for future sessions working in this repo.

## What this project is

ARF (Adaptive Responsive Framework) is a cross-device, multilingual voice
assistant. Node.js 20+, ESM, **zero runtime dependencies**. Speech uses the
browser's Web Speech API; the server is a plain `node:http` broker.

## Core invariant — do not weaken this

**Nothing is permitted implicitly.** Every device action passes through
`PolicyEngine.evaluate()` before any connector's `invoke()` runs, and that
ordering lives in exactly one place: `Assistant#handleDevice` in
`src/core/assistant.js`.

If you add a code path that can act on a device, route it through that method.
Never call `registry.get(...).invoke(...)` directly from anywhere else.

## Security rules that must not regress

- Deny by default. A missing grant returns `{allowed:false}` — denial is normal
  control flow, not an exception.
- Grants are scoped to `deviceId::capability`. Never widen a grant.
- Anything in `CONFIRMATION_REQUIRED` (locks, alarms, payments, camera, mic,
  file deletion, factory reset) needs a one-time token, even when granted.
- The audit log is an append-only SHA-256 hash chain. Never mutate or truncate
  entries; `AuditLog#verify()` must keep passing.
- The HTTP server binds to `127.0.0.1` by default. LAN exposure is opt-in.
- All state-changing endpoints require the bearer token.
- No `eval`, no `Function`, no dynamic code execution. Math is parsed by
  `src/core/math.js`.
- Do not add network calls to third parties. ARF is offline-first and must
  refuse to invent data (see the weather handler) rather than fabricate it.
- Do not add device-discovery that reaches out to unpaired hardware.

## Refuse these requests

Requests to break into devices, bypass authentication, exfiltrate data, or
control hardware the user does not own are out of scope for this project and
should be declined, not implemented behind a flag.

## Commands

```bash
npm start                 # broker on 127.0.0.1:8787, prints pairing token
npm test                  # node:test, glob "tests/*.test.js"
npm run cli -- "hello"    # CLI client (needs ARF_TOKEN)
```

`npm test` uses `node --test "tests/*.test.js"` — the glob is required; passing
the bare directory fails on Node 24.

## Conventions

- ESM only. Relative imports need the `.js` extension.
- Private class fields (`#field`) for internals. Declare every `#field` you use
  or `node --check` fails.
- Response strings live in `src/core/i18n.js`, never inline in logic.
- Intent keyword tables live in `src/core/intents.js`, keyed by base language.
  Missing languages fall back to English.
- Device aliases are lowercased on registration; `registry.find()` checks id,
  exact name, alias, then substring on name/kind/alias.
- Keep comments about *why*, not *what*. Match the existing sparse style.
- No build step for `public/`. It is plain HTML/CSS/JS served directly.

## Testing notes

Add tests for any new capability. The two highest-value regression tests to
preserve are:

1. `a denied action never reaches the connector` (assistant.test.js)
2. `detects tampering of a persisted log` (audit.test.js)

Verify syntax before running tests: `node --check <file>`.
