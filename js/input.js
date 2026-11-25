/*
 * Controller and keyboard input for Mesa Trails.
 * Gamepads use the browser's "standard" button layout (Xbox controllers report it).
 * The Menu button (index 9) is left alone: Edge on Xbox uses it to switch
 * between browsing controls and game controls.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MesaInput = factory();
})(this, function () {
  'use strict';

  const BUTTONS = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'view', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const REPEATS = { up: true, down: true, left: true, right: true };
  const STICK = 0.6;
  const FIRST_REPEAT = 320;
  const NEXT_REPEAT = 115;
  const DEDUPE_MS = 250;
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b',
    x: 'x', r: 'x', y: 'y', n: 'y', q: 'lb', e: 'rb',
    '-': 'lt', _: 'lt', '=': 'rt', '+': 'rt', h: 'view', '?': 'view',
    // Edge on Xbox can also send controller presses as these key names.
    GamepadA: 'a', GamepadB: 'b', GamepadX: 'x', GamepadY: 'y',
    GamepadLeftShoulder: 'lb', GamepadRightShoulder: 'rb',
    GamepadLeftTrigger: 'lt', GamepadRightTrigger: 'rt', GamepadView: 'view',
    GamepadDPadUp: 'up', GamepadDPadDown: 'down', GamepadDPadLeft: 'left', GamepadDPadRight: 'right',
    GamepadLeftThumbstickUp: 'up', GamepadLeftThumbstickDown: 'down',
    GamepadLeftThumbstickLeft: 'left', GamepadLeftThumbstickRight: 'right',
  };

  function pressed(b) {
    if (!b) return false;
    return typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5;
  }

  // Reads one gamepad into a set of held actions.
  function readPad(pad) {
    const held = {};
    Object.keys(BUTTONS).forEach((i) => { if (pressed(pad.buttons[i])) held[BUTTONS[i]] = true; });
    const ax = pad.axes || [];
    [[0, 1], [2, 3]].forEach(([ix, iy]) => {
      const x = ax[ix] || 0;
      const y = ax[iy] || 0;
      if (x < -STICK) held.left = true;
      if (x > STICK) held.right = true;
      if (y < -STICK) held.up = true;
      if (y > STICK) held.down = true;
    });
    return held;
  }

  function Input(target, onAction, opts) {
    const o = opts || {};
    this.onAction = onAction;
    this.getPads = o.getPads || (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));
    this.state = {};
    this.lastPress = {};
    this.fromPad = {};
    this.fromKeyPad = {};
    this.connected = 0;
    this.keyboard = !!target;
    if (target) {
      target.addEventListener('keydown', (e) => {
        const action = KEYS[e.key] || KEYS[e.key && e.key.toLowerCase && e.key.toLowerCase()];
        if (!action) return;
        e.preventDefault();
        if (e.repeat && !REPEATS[action]) return;
        if (/^Gamepad/.test(e.key)) {
          // Same press may also arrive through the Gamepad API: let only one through.
          if (Date.now() - (this.fromPad[action] || 0) < DEDUPE_MS) return;
          this.fromKeyPad[action] = Date.now();
        }
        this.fire(action, null);
      });
    }
  }

  Input.prototype.fire = function (action, pad) {
    this.lastPress[action] = Date.now();
    this.onAction(action, pad);
  };

  Input.prototype.poll = function (now) {
    let pads;
    try { pads = this.getPads() || []; } catch (e) { pads = []; }
    let count = 0;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || pad.connected === false) continue;
      count++;
      const idx = pad.index != null ? pad.index : i;
      const held = readPad(pad);
      const prev = this.state[idx] || (this.state[idx] = {});
      Object.keys(held).forEach((action) => {
        const s = prev[action];
        if (!s) {
          prev[action] = { since: now, last: now };
          if (Date.now() - (this.fromKeyPad[action] || 0) < DEDUPE_MS) return;
          this.fromPad[action] = Date.now();
          this.fire(action, idx);
        } else if (REPEATS[action] && now - s.since > FIRST_REPEAT && now - s.last > NEXT_REPEAT) {
          s.last = now;
          this.fire(action, idx);
        }
      });
      Object.keys(prev).forEach((action) => { if (!held[action]) delete prev[action]; });
    }
    this.connected = count;
  };

  return { Input, readPad, BUTTONS, KEYS };
});
