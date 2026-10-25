// Device connector registry.
//
// A connector represents a device the owner has paired. Each declares the
// capabilities it supports and an `invoke` handler. ARF never invents a device:
// connectors are registered explicitly, and every invocation passes through the
// policy engine first.

export class ConnectorRegistry {
  #devices = new Map();

  register({ id, name, kind, capabilities, invoke, metadata = {}, aliases = [] }) {
    if (!id || !name) throw new Error('connector requires id and name');
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new Error(`connector ${id} must declare at least one capability`);
    }
    if (typeof invoke !== 'function') throw new Error(`connector ${id} requires an invoke function`);
    if (this.#devices.has(id)) throw new Error(`connector ${id} already registered`);
    const device = {
      id, name, kind, capabilities: [...capabilities], invoke, metadata,
      aliases: [...aliases].map((a) => String(a).toLowerCase()),
      pairedAt: new Date().toISOString(),
    };
    this.#devices.set(id, device);
    return { id, name, kind, capabilities: device.capabilities, aliases: device.aliases };
  }

  get(id) {
    return this.#devices.get(id) || null;
  }

  // Match a device by id, exact name, or alias; then by substring on name/kind/alias.
  find(query) {
    if (!query) return null;
    const q = String(query).toLowerCase().trim();
    if (this.#devices.has(query)) return this.#devices.get(query);
    for (const d of this.#devices.values()) {
      if (d.name.toLowerCase() === q || d.id.toLowerCase() === q) return d;
    }
    for (const d of this.#devices.values()) {
      if (d.aliases.includes(q)) return d;
    }
    for (const d of this.#devices.values()) {
      if (d.name.toLowerCase().includes(q) || d.kind.toLowerCase().includes(q) || d.aliases.some((a) => a.includes(q))) return d;
    }
    return null;
  }

  list() {
    return [...this.#devices.values()].map(({ id, name, kind, capabilities, aliases, pairedAt }) => ({
      id, name, kind, capabilities, aliases, pairedAt,
    }));
  }

  hasCapability(deviceId, capability) {
    const d = this.#devices.get(deviceId);
    return Boolean(d && d.capabilities.includes(capability));
  }

  unregister(id) {
    return this.#devices.delete(id);
  }
}
