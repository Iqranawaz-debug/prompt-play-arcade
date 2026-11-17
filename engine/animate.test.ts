import { describe, expect, it } from 'vitest';
import { frameAt, isAnimated, pose } from './animate';

const def = { svg: '<svg></svg>', width: 20, height: 20, faces: 'none' as const };

describe('sprite animation', () => {
  it('only animates sprites that ask for it', () => {
    expect(isAnimated(def)).toBe(false);
    expect(isAnimated({ ...def, anim: { idle: 'none', move: 'none', speed: 1 } })).toBe(false);
    expect(isAnimated({ ...def, anim: { idle: 'bob', move: 'none', speed: 1 } })).toBe(true);
    expect(isAnimated({ ...def, frames: ['<svg></svg>'] })).toBe(true);
  });

  it('uses the idle motion when still and the move motion when moving', () => {
    const anim = { idle: 'bob', move: 'tilt', speed: 1 } as const;
    const still = pose(anim, 0.3, 0, 0);
    expect(still.dy).not.toBe(0);
    expect(still.rotation).toBe(0);
    const moving = pose(anim, 0.3, 300, 0);
    expect(moving.dy).toBe(0);
    expect(moving.rotation).toBeCloseTo(0.22); // clamped tilt
  });

  it('cycles frames at fps', () => {
    const framed = { ...def, frames: ['<svg></svg>', '<svg></svg>'], fps: 4 };
    expect([0, 0.25, 0.5, 0.75].map((t) => frameAt(framed, t))).toEqual([0, 1, 2, 0]);
    expect(frameAt(def, 5)).toBe(0);
  });
});
