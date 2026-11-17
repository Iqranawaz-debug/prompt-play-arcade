/** Remappable game actions, shared by the engine (input) and the dashboard (settings). Keys are KeyboardEvent.code values. */
export const ACTIONS = [
  { id: 'up', name: 'Move up' },
  { id: 'down', name: 'Move down' },
  { id: 'left', name: 'Move left' },
  { id: 'right', name: 'Move right' },
  { id: 'start', name: 'Start / play again' },
  { id: 'sound', name: 'Toggle sound' },
] as const;
export type Action = (typeof ACTIONS)[number]['id'];
export type KeyMap = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyMap = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  start: ['Space', 'Enter'],
  sound: ['KeyM'],
};

const CODE = /^[A-Za-z0-9]{1,24}$/;

/** Accept a stored or injected key map, falling back to defaults for anything malformed. */
export function normalizeKeyMap(input: unknown): KeyMap {
  const out = structuredClone(DEFAULT_KEYS);
  if (typeof input !== 'object' || input === null) return out;
  for (const { id } of ACTIONS) {
    const keys = (input as Record<string, unknown>)[id];
    if (Array.isArray(keys)) {
      const valid = keys.filter((k): k is string => typeof k === 'string' && CODE.test(k)).slice(0, 2);
      if (valid.length) out[id] = valid;
    }
  }
  return out;
}

/** Bind `code` to `action` in `slot` (0 = primary, 1 = secondary), removing it from any other action. */
export function rebind(map: KeyMap, action: Action, slot: 0 | 1, code: string): KeyMap {
  const next = structuredClone(map);
  for (const { id } of ACTIONS) next[id] = next[id].filter((k) => k !== code);
  const keys = [...next[action]];
  if (slot === 0) keys.unshift(code);
  else keys.splice(1, 0, code);
  next[action] = [...new Set(keys)].slice(0, 2);
  // An action left with no keys gets its default back (unless that key is taken).
  for (const { id } of ACTIONS) {
    if (next[id].length === 0) next[id] = DEFAULT_KEYS[id].filter((k) => !Object.values(next).flat().includes(k)).slice(0, 1);
  }
  return next;
}

const NAMES: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'R Shift',
  ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Esc',
};

/** Short label for a key code: KeyW -> W, Digit1 -> 1, ArrowUp -> ↑. */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
