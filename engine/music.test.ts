import { describe, expect, it } from 'vitest';
import { STYLES, noteFor } from './music';

describe('music', () => {
  it('maps scale degrees to notes, wrapping octaves', () => {
    const s = { root: 60, scale: [0, 2, 4, 5, 7, 9, 11] };
    expect(noteFor(s, 0, 0)).toBe(60);
    expect(noteFor(s, 0, 2)).toBe(64);
    expect(noteFor(s, 4, 3)).toBe(72); // degree 7 = next octave root
    expect(noteFor(s, 0, -1)).toBe(59);
  });

  it('every style has a full 16-step bar and a 4-bar progression', () => {
    for (const [name, s] of Object.entries(STYLES)) {
      expect(s.bass, name).toHaveLength(16);
      expect(s.lead, name).toHaveLength(16);
      expect(s.chords, name).toHaveLength(4);
      expect(s.bpm, name).toBeGreaterThan(50);
    }
  });
});
