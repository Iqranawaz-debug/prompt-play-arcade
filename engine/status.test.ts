import { describe, expect, it } from 'vitest';
import { isGameStatus } from './status';

describe('isGameStatus', () => {
  it('accepts well-formed status messages', () => {
    expect(isGameStatus({ phase: 'playing', score: 3, target: 25, lives: 2, maxLives: 3 })).toBe(true);
    expect(isGameStatus({ phase: 'won', score: 0, lives: 1, maxLives: 1 })).toBe(true);
  });

  it('rejects anything else that might arrive over postMessage', () => {
    for (const bad of [null, 'x', { phase: 'hacked', score: 1, lives: 1, maxLives: 1 }, { phase: 'intro', score: -1, lives: 1, maxLives: 1 }, { phase: 'intro', score: '<img>', lives: 1, maxLives: 1 }]) {
      expect(isGameStatus(bad)).toBe(false);
    }
  });
});
