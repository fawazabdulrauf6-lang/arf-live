// Append-only audit log. Every action ARF takes, and every denial, is recorded.
// Entries are hashed with a rolling chain so tampering is detectable.
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class AuditLog {
  #entries = [];
  #lastHash = 'GENESIS';
  #path;
  #persist;

  constructor({ path = null, persist = false } = {}) {
    this.#path = path;
    this.#persist = persist && Boolean(path);
    if (this.#persist) {
      mkdirSync(dirname(path), { recursive: true });
      if (existsSync(path)) this.#load();
    }
  }

  #load() {
    const lines = readFileSync(this.#path, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        this.#entries.push(JSON.parse(line));
      } catch {
        // A corrupt trailing line should not prevent startup.
      }
    }
    if (this.#entries.length) {
      this.#lastHash = this.#entries[this.#entries.length - 1].hash;
    }
  }

  record(entry) {
    const body = {
      ...entry,
      at: entry.at || new Date().toISOString(),
      seq: this.#entries.length,
      prevHash: this.#lastHash,
    };
    const hash = createHash('sha256')
      .update(this.#lastHash + JSON.stringify(body))
      .digest('hex');
    const full = { ...body, hash };
    this.#entries.push(full);
    this.#lastHash = hash;
    if (this.#persist) appendFileSync(this.#path, JSON.stringify(full) + '\n');
    return full;
  }

  all() {
    return [...this.#entries];
  }

  tail(n = 50) {
    return this.#entries.slice(-n);
  }

  // Recompute the chain to prove nothing was altered or removed.
  verify() {
    let prev = 'GENESIS';
    for (const e of this.#entries) {
      const { hash, ...body } = e;
      const expect = createHash('sha256').update(prev + JSON.stringify(body)).digest('hex');
      if (expect !== hash) return { valid: false, brokenAt: e.seq };
      prev = hash;
    }
    return { valid: true, entries: this.#entries.length };
  }
}
