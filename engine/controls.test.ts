import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Minimal browser stand-ins: a window to receive key events and a fake connected gamepad.
const pad = { connected: true, id: 'Test Pad', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
const win = new EventTarget();
const key = (type: string, code: string) => {
  const e = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false });
  win.dispatchEvent(e);
  return e;
};

beforeAll(() => {
  Object.assign(globalThis, { window: win });
  Object.defineProperty(globalThis.navigator, 'getGamepads', { value: () => [null, pad], configurable: true });
});
afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('Controls', () => {
  it('reads remapped keys for movement and prevents page scrolling', async () => {
    const { Controls } = await import('./controls');
    const { DEFAULT_KEYS } = await import('../spec/controls');
    const c = new Controls({ ...DEFAULT_KEYS, right: ['KeyL'] });
    const e = key('keydown', 'KeyL');
    expect(c.axis()).toEqual({ x: 1, y: 0 });
    expect(e.defaultPrevented).toBe(true);
    key('keyup', 'KeyL');
    key('keydown', 'ArrowRight'); // no longer bound to right
    expect(c.axis()).toEqual({ x: 0, y: 0 });
    key('keyup', 'ArrowRight');
  });

  it('fires start/sound presses from keys and gamepad buttons (edge-triggered)', async () => {
    const { Controls } = await import('./controls');
    const c = new Controls();
    let starts = 0;
    let sounds = 0;
    const off = c.onPress('start', () => starts++);
    c.onPress('sound', () => sounds++);
    key('keydown', 'Space');
    key('keyup', 'Space');
    pad.buttons[0].pressed = true; // A
    c.poll();
    c.poll(); // still held: no second press
    pad.buttons[0].pressed = false;
    c.poll();
    pad.buttons[3].pressed = true; // Y
    c.poll();
    pad.buttons[3].pressed = false;
    expect(starts).toBe(2);
    expect(sounds).toBe(1);
    off();
    key('keydown', 'Space');
    expect(starts).toBe(2);
    key('keyup', 'Space');
  });

  it('moves with the D-pad and the left stick (with a deadzone)', async () => {
    const { Controls } = await import('./controls');
    const c = new Controls();
    pad.buttons[14].pressed = true; // D-pad left
    expect(c.axis()).toEqual({ x: -1, y: 0 });
    pad.buttons[14].pressed = false;
    pad.axes = [0.1, 0.8];
    expect(c.axis()).toEqual({ x: 0, y: 0.8 });
    pad.axes = [0, 0];
  });
});
