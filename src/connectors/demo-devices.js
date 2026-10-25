// Demonstration connectors. These are virtual devices so ARF can be exercised
// end to end without touching real hardware. A real integration implements the
// same shape: declare capabilities, provide invoke(). Pairing and grants are
// still required before any of these can be controlled.

export function registerDemoDevices(registry, { onEvent = () => {} } = {}) {
  const state = new Map();

  const mk = (id, name, kind, capabilities, initial = {}, aliases = []) => {
    state.set(id, { ...initial });
    registry.register({
      id, name, kind, capabilities, aliases,
      invoke: ({ action, at }) => {
        const s = state.get(id);
        if (action === 'on') s.power = true;
        else if (action === 'off') s.power = false;
        else if (action === 'toggle') s.power = !s.power;
        else if (action === 'lock') s.locked = true;
        else if (action === 'unlock') s.locked = false;
        const event = { deviceId: id, name, action, state: { ...s }, at };
        onEvent(event);
        return event.state;
      },
      metadata: { virtual: true },
    });
  };

  mk('living-room-light', 'Living Room Light', 'light',
    ['device.on', 'device.off', 'device.toggle'], { power: false, brightness: 80 },
    ['living room light', 'lounge light', 'luz de la sala', 'lampe du salon', 'wohnzimmer licht', 'sala ka light']);
  mk('kitchen-light', 'Kitchen Light', 'light',
    ['device.on', 'device.off', 'device.toggle'], { power: false },
    ['kitchen light', 'luz de la cocina', 'lampe de cuisine', 'kuchenlicht', 'rasoi ka light']);
  mk('bedroom-lamp', 'Bedroom Lamp', 'light',
    ['device.on', 'device.off', 'device.toggle'], { power: false },
    ['bedroom lamp', 'bedside lamp', 'lampara del dormitorio', 'lampe de chevet']);
  mk('thermostat', 'Thermostat', 'climate',
    ['device.on', 'device.off'], { power: true, targetC: 21 },
    ['thermostat', 'heating', 'termostato', 'chauffage', 'heizung']);
  mk('tv', 'Living Room TV', 'media',
    ['device.on', 'device.off', 'device.toggle'], { power: false },
    ['tv', 'television', 'telly', 'televisor', 'fernseher']);
  mk('front-door', 'Front Door Lock', 'lock',
    ['lock.lock', 'lock.unlock'], { locked: true },
    ['front door', 'front door lock', 'puerta principal', 'porte dentree', 'haustur']);

  return {
    snapshot: () => Object.fromEntries([...state.entries()].map(([k, v]) => [k, { ...v }])),
  };
}
