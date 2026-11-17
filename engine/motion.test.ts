import { describe, expect, it } from 'vitest';
import { LIFETIME_MS, bounceOffWalls, isFarOutside, isInside, newMover, placeSpawn, steer } from './motion';

const world = { x: 0, y: 0, w: 800, h: 600 };
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

describe('placeSpawn with a HUD offset', () => {
  const field = { x: 0, y: 44, w: 960, h: 496 };
  it('spawns top entities just above the field, i.e. hidden under the HUD bar', () => {
    const { pos } = placeSpawn('top', size, field, { x: 0, y: 0 }, fixed(0.5));
    expect(pos.y).toBe(44 - size.h / 2);
  });
  it('keeps "anywhere" spawns below the HUD', () => {
    const { pos } = placeSpawn('anywhere', size, field, { x: 0, y: 0 }, fixed(0));
    expect(pos.y).toBeGreaterThanOrEqual(44 + 40);
    expect(isInside(pos, { w: 20, h: 10 }, field)).toBe(true);
  });
  it('bounces off the top of the field, not the top of the screen', () => {
    const m = newMover({ x: 0, y: -1 }, 'bounce', fixed(0.5));
    const v = bounceOffWalls(m, { x: 0, y: -100 }, { x: 400, y: 50 }, { w: 20, h: 10 }, field);
    expect(v.y).toBe(100);
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

describe('patrol and platforms', () => {
  it('patrols horizontally and spawns on a platform top away from the player', () => {
    const state = newMover({ x: 0, y: 1 }, 'patrol', () => 0.9);
    expect(state.dir).toEqual({ x: 1, y: 0 });
    expect(steer('patrol', state, { x: 0, y: 0 }, { x: 0, y: 0 }, 100, 16)).toEqual({ x: 100, y: 0 });
    const tops = [{ x: 100, y: 300 }, { x: 800, y: 300 }];
    const { pos } = placeSpawn('platforms', { w: 20, h: 20 }, { x: 0, y: 44, w: 960, h: 496 }, { x: 110, y: 290 }, () => 0, tops);
    expect(pos).toEqual({ x: 800, y: 290 });
  });
});
