import { DEFAULT_KEYS, type Action, type KeyMap } from '../spec/controls';

/** Standard gamepad layout: 0 = A/Cross, 3 = Y/Triangle, 9 = Start, 12-15 = D-pad up/down/left/right. */
const PAD_PRESS: Partial<Record<Action, number[]>> = { start: [0, 9], sound: [3] };
const DEADZONE = 0.3;

/**
 * Keyboard (remappable) and gamepad input for the engine. Created once per game and shared across round restarts.
 * Movement is read every frame (axis); start/sound are edge-triggered presses with subscribe/unsubscribe.
 */
export class Controls {
  private readonly held = new Set<string>();
  private readonly listeners = new Map<Action, Set<() => void>>();
  private padPressed = new Set<number>();
  private readonly gameCodes: Set<string>;

  constructor(private readonly keys: KeyMap = DEFAULT_KEYS) {
    this.gameCodes = new Set(Object.values(keys).flat());
    window.addEventListener('keydown', (e) => {
      if (!this.gameCodes.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // no scrolling or button activation while playing
      if (!e.repeat) {
        for (const [action, codes] of Object.entries(this.keys) as [Action, string[]][]) if (codes.includes(e.code)) this.emit(action);
      }
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  /** Label of the first key for an action, for on-screen hints. */
  firstKey(action: Action): string {
    return this.keys[action][0] ?? '';
  }

  onPress(action: Action, fn: () => void): () => void {
    let set = this.listeners.get(action);
    if (!set) this.listeners.set(action, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(action: Action): void {
    for (const fn of [...(this.listeners.get(action) ?? [])]) fn();
  }

  private isHeld(action: Action): boolean {
    return this.keys[action].some((k) => this.held.has(k));
  }

  /** Read gamepads once per frame: fires start/sound presses on button down. */
  poll(): void {
    const pad = this.pad();
    if (!pad) return;
    const now = new Set(pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    for (const [action, buttons] of Object.entries(PAD_PRESS) as [Action, number[]][]) {
      if (buttons.some((b) => now.has(b) && !this.padPressed.has(b))) this.emit(action);
    }
    this.padPressed = now;
  }

  /** Movement direction from keys, D-pad and left stick; each component in -1..1. */
  axis(): { x: number; y: number } {
    let x = Number(this.isHeld('right')) - Number(this.isHeld('left'));
    let y = Number(this.isHeld('down')) - Number(this.isHeld('up'));
    const pad = this.pad();
    if (pad && x === 0 && y === 0) {
      const b = (i: number) => Boolean(pad.buttons[i]?.pressed);
      x = Number(b(15)) - Number(b(14));
      y = Number(b(13)) - Number(b(12));
      if (x === 0 && y === 0) {
        const [sx = 0, sy = 0] = pad.axes;
        x = Math.abs(sx) > DEADZONE ? sx : 0;
        y = Math.abs(sy) > DEADZONE ? sy : 0;
      }
    }
    return { x, y };
  }

  private pad(): Gamepad | undefined {
    try {
      return navigator.getGamepads?.().find((p): p is Gamepad => Boolean(p?.connected));
    } catch {
      return undefined; // gamepad access blocked (e.g. by permissions policy)
    }
  }
}
