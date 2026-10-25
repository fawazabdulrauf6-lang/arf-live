// Capability-based policy engine for ARF.
//
// Design principle: nothing is permitted implicitly. Every device exposes a set of
// named capabilities (e.g. "light.toggle"), and a capability is denied unless an
// explicit grant exists for that device+capability pair. Grants are user-created,
// scoped, and recorded. This is the mechanism that makes "control my apps" safe:
// ARF can only ever act on things the owner has deliberately paired and allowed.

export const RISK = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

// Capabilities that always require a spoken/typed confirmation, even when granted.
// These are physically consequential or privacy-sensitive actions.
export const CONFIRMATION_REQUIRED = new Set([
  'lock.unlock',
  'security.disarm',
  'door.open',
  'garage.open',
  'payment.send',
  'camera.stream',
  'mic.record',
  'contacts.export',
  'file.delete',
  'device.factory_reset',
]);

export class PolicyEngine {
  #grants = new Map(); // key: `${deviceId}::${capability}` -> grant record
  #audit;
  #clock;

  constructor({ audit, clock = () => new Date().toISOString() } = {}) {
    this.#audit = audit;
    this.#clock = clock;
  }

  static #key(deviceId, capability) {
    return `${deviceId}::${capability}`;
  }

  // A grant is explicit and scoped. `expiresAt` enables time-boxed access.
  grant({ deviceId, capability, grantedBy, expiresAt = null, note = '' }) {
    if (!deviceId || !capability) throw new Error('grant requires deviceId and capability');
    if (!grantedBy) throw new Error('grant requires grantedBy (who consented)');
    const key = PolicyEngine.#key(deviceId, capability);
    const record = {
      deviceId,
      capability,
      grantedBy,
      grantedAt: this.#clock(),
      expiresAt,
      note,
      revoked: false,
    };
    this.#grants.set(key, record);
    this.#audit?.record({
      type: 'policy.grant',
      actor: grantedBy,
      deviceId,
      capability,
      outcome: 'granted',
    });
    return record;
  }

  revoke({ deviceId, capability, revokedBy }) {
    const key = PolicyEngine.#key(deviceId, capability);
    const record = this.#grants.get(key);
    if (!record) return false;
    record.revoked = true;
    record.revokedBy = revokedBy;
    record.revokedAt = this.#clock();
    this.#audit?.record({
      type: 'policy.revoke',
      actor: revokedBy,
      deviceId,
      capability,
      outcome: 'revoked',
    });
    return true;
  }

  listGrants() {
    return [...this.#grants.values()];
  }

  // Core decision. Returns { allowed, reason, needsConfirmation }.
  // Never throws on denial: denial is a normal, expected outcome.
  evaluate({ deviceId, capability, now = null }) {
    if (!deviceId || !capability) {
      return { allowed: false, reason: 'malformed-request', needsConfirmation: false };
    }
    const key = PolicyEngine.#key(deviceId, capability);
    const grant = this.#grants.get(key);

    if (!grant) {
      return { allowed: false, reason: 'no-grant', needsConfirmation: false };
    }
    if (grant.revoked) {
      return { allowed: false, reason: 'revoked', needsConfirmation: false };
    }
    if (grant.expiresAt) {
      const at = now ?? this.#clock();
      if (new Date(at).getTime() >= new Date(grant.expiresAt).getTime()) {
        return { allowed: false, reason: 'expired', needsConfirmation: false };
      }
    }
    return {
      allowed: true,
      reason: 'granted',
      needsConfirmation: CONFIRMATION_REQUIRED.has(capability),
    };
  }
}
