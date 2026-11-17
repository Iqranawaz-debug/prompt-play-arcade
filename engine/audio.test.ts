import { describe, expect, it } from 'vitest';
import { collisionSound } from './audio';

const hit = (score: number, lives: number, sfx: Parameters<typeof collisionSound>[0]['sfx'] = 'auto') => ({
  score,
  lives,
  destroy: true,
  sfx,
});

describe('collisionSound', () => {
  it('derives a sound from the collision effect', () => {
    expect(collisionSound(hit(1, 0))).toBe('pickup');
    expect(collisionSound(hit(5, 0))).toBe('big');
    expect(collisionSound(hit(0, -1))).toBe('hurt');
    expect(collisionSound(hit(0, 1))).toBe('heal');
    expect(collisionSound(hit(0, 0))).toBe('pop');
  });

  it('respects an explicit choice, including silence', () => {
    expect(collisionSound(hit(1, 0, 'hurt'))).toBe('hurt');
    expect(collisionSound(hit(1, 0, 'none'))).toBeUndefined();
  });
});
