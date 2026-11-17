import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, keyLabel, normalizeKeyMap, rebind } from './controls';

describe('key maps', () => {
  it('normalizes stored maps and falls back to defaults', () => {
    expect(normalizeKeyMap(null)).toEqual(DEFAULT_KEYS);
    const m = normalizeKeyMap({ up: ['KeyI'], start: ['<bad>', 'KeyJ', 'KeyK', 'KeyL'], sound: 'nope' });
    expect(m.up).toEqual(['KeyI']);
    expect(m.start).toEqual(['KeyJ', 'KeyK']);
    expect(m.sound).toEqual(['KeyM']);
  });

  it('rebinding takes the key away from other actions', () => {
    const m = rebind(DEFAULT_KEYS, 'start', 0, 'KeyW');
    expect(m.start[0]).toBe('KeyW');
    expect(m.up).toEqual(['ArrowUp']);
    const s = rebind(DEFAULT_KEYS, 'sound', 1, 'KeyP');
    expect(s.sound).toEqual(['KeyM', 'KeyP']);
  });

  it('labels keys readably', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Space')).toBe('Space');
  });
});
