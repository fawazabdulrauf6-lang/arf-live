// Wires the ARF runtime together: audit log, policy engine, connector registry,
// assistant, and a small pairing API. Everything else imports this.

import { AuditLog } from './security/audit.js';
import { PolicyEngine } from './security/policy.js';
import { ConnectorRegistry } from './connectors/registry.js';
import { registerDemoDevices } from './connectors/demo-devices.js';
import { Assistant } from './core/assistant.js';
import { listLanguages } from './core/languages.js';
import { supportedResponseLanguages } from './core/i18n.js';

export function createApp({ persistAudit = false, auditPath = 'data/audit.log', withDemoDevices = true, clock } = {}) {
  const audit = new AuditLog({ path: auditPath, persist: persistAudit });
  const policy = new PolicyEngine({ audit });
  const registry = new ConnectorRegistry();
  const events = [];
  const pushEvent = (e) => { events.push(e); if (events.length > 500) events.shift(); };

  if (withDemoDevices) registerDemoDevices(registry, { onEvent: pushEvent });

  const assistant = new Assistant({ policy, audit, registry, clock });

  return {
    audit, policy, registry, assistant, events,
    meta: {
      languages: listLanguages(),
      responseLanguages: supportedResponseLanguages(),
    },
    // Pairing is the deliberate act that makes a device reachable at all.
    pairDevice(spec) {
      const info = registry.register(spec);
      audit.record({ type: 'device.pair', actor: spec.pairedBy || 'owner', deviceId: info.id, outcome: 'paired' });
      return info;
    },
    grant(deviceId, capability, grantedBy = 'owner', opts = {}) {
      return policy.grant({ deviceId, capability, grantedBy, ...opts });
    },
    revoke(deviceId, capability, revokedBy = 'owner') {
      return policy.revoke({ deviceId, capability, revokedBy });
    },
    status() {
      return {
        devices: registry.list(),
        grants: policy.listGrants(),
        audit: audit.verify(),
        languages: listLanguages().length,
      };
    },
  };
}
