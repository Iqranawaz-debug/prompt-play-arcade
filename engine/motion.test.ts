import { describe, expect, it } from 'vitest';
import { LIFETIME_MS, bounceOffWalls, isFarOutside, newMover, placeSpawn, steer } from './motion';

const world = { w: 800, h: 600 };
const size = { w: 40, h: 20 };
const fixed = (v: number) => () => v;

describe('placeSpawn', () => {
  it('spawns off-screen on the given edge, heading inward', () => {
    const left = placeSpawn('left', size, world, { x: 400, y: 300 }, fixed(0.5));
    expect(left.pos.x).toBeLessThan(0);
    expect(left.dir).toEqual({ x: 1, y: 0 });
    const top = placeSpawn('top', size, world, { x: 400, y: 300 }, fixed(0.5));
    expect(top.pos.y).toBeLessThan(0);
    expect(top.dir).toEqual({ x: 0, y: 1 });
  });

  it('resolves "sides" to left or right', () => {
    expect(placeSpawn('sides', size, world, { x: 0, y: 0 }, fixed(0.1)).dir.x).toBe(1);
    expect(placeSpawn('sides', size, world, { x: 0, y: 0 }, fixed(0.9)).dir.x).toBe(-1);
  });

  it('keeps "anywhere" spawns inside the screen', () => {
    const { pos } = placeSpawn('anywhere', size, world, { x: 0, y: 0 }, fixed(0.5));
    expect(isFarOutside(pos, { w: 20, h: 10 }, world)).toBe(false);
    expect(pos.x).toBeGreaterThan(0);
  });
});

describe('steer', () => {
  it('moves straight entities along their heading', () => {
    const m = newMover({ x: 1, y: 0 }, 'straight', fixed(0.5));
    expect(steer('straight', m, { x: 0, y: 0 }, { x: 0, y: 0 }, 100, 16)).toEqual({ x: 100, y: 0 });
  });

  it('chases and flees relative to the player', () => {
    const m = newMover({ x: 1, y: 0 }, 'chase', fixed(0.5));
    const chase = steer('chase', m, { x: 0, y: 0 }, { x: 0, y: 100 }, 50, 16);
    expect(chase.y).toBeCloseTo(50);
    const flee = steer('flee', newMover({ x: 1, y: 0 }, 'flee'), { x: 0, y: 0 }, { x: 0, y: 100 }, 50, 16);
    expect(flee.y).toBeCloseTo(-50);
  });

  it('makes roaming entities leave after their lifetime', () => {
    const m = newMover({ x: 1, y: 0 }, 'wander', fixed(0.5));
    steer('wander', m, { x: 0, y: 0 }, { x: 0, y: 0 }, 50, LIFETIME_MS + 1, fixed(0.5));
    expect(m.leaving).toBe(true);
  });

  it('keeps static entities still', () => {
    const m = newMover({ x: 1, y: 0 }, 'static');
    expect(steer('static', m, { x: 0, y: 0 }, { x: 9, y: 9 }, 100, 16)).toEqual({ x: 0, y: 0 });
  });
});

describe('bounceOffWalls', () => {
  it('reflects velocity and heading at a wall', () => {
    const m = newMover({ x: 1, y: 0 }, 'straight');
    const v = bounceOffWalls(m, { x: 100, y: 0 }, { x: 795, y: 300 }, { w: 20, h: 10 }, world);
    expect(v.x).toBe(-100);
    expect(m.dir.x).toBe(-1);
  });
});
