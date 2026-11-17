import { describe, expect, it } from 'vitest';
import { GameSpecSchema, formatIssues, type GameSpecInput } from './schema';
import { isWall, jumpHeight, parseLevel, platformTops, wallRuns } from './level';
import { philosopherFishing } from './examples/philosopherFishing';

const platformer = (): GameSpecInput => {
  const s: GameSpecInput = structuredClone(philosopherFishing);
  s.player.controls = 'platformer';
  s.physics = { gravity: 1200, jump: 560 };
  s.level = { map: ['', '', '', '', '', '', '....####', '', '', '', '', '########################'] };
  return s;
};

describe('level helpers', () => {
  const g = parseLevel({ tileSize: 40, map: ['P...', '.##.'] });

  it('pads the grid to the full field and finds the start', () => {
    expect([g.cols, g.rows]).toEqual([24, 12]);
    expect(g.start).toEqual({ col: 0, row: 0 });
    expect(g.walls[1].slice(0, 4)).toEqual([false, true, true, false]);
  });

  it('treats sides and bottom as solid, the sky as open', () => {
    expect(isWall(g, -1, 3)).toBe(true);
    expect(isWall(g, 3, 12)).toBe(true);
    expect(isWall(g, 3, -1)).toBe(false);
  });

  it('merges wall runs and finds platform tops', () => {
    expect(wallRuns(g)).toEqual([{ col: 1, row: 1, len: 2 }]);
    expect(platformTops(g)).toEqual([{ col: 1, row: 0 }, { col: 2, row: 0 }]);
  });

  it('computes jump height', () => {
    expect(jumpHeight(600, 1200)).toBe(150);
  });
});

describe('platformer specs', () => {
  it('accepts a playable platformer and keeps old specs valid', () => {
    expect(GameSpecSchema.safeParse(platformer()).success).toBe(true);
    expect(GameSpecSchema.parse(philosopherFishing).level).toBeUndefined();
  });

  it('requires gravity and a jump that clears 1.5 tiles', () => {
    const noGravity = platformer();
    noGravity.physics = undefined;
    expect(formatIssues(GameSpecSchema.safeParse(noGravity).error!)).toContain('physics.gravity');
    const weak = platformer();
    weak.physics = { gravity: 1200, jump: 300 };
    expect(formatIssues(GameSpecSchema.safeParse(weak).error!)).toMatch(/physics\.jump: .*jump >= 380/);
  });

  it('rejects oversize or invalid maps', () => {
    const bad = platformer();
    bad.level!.map = ['x'.repeat(25), ...Array(12).fill('')];
    const text = formatIssues(GameSpecSchema.safeParse(bad).error!);
    expect(text).toContain('at most 12 rows');
    expect(text).toContain('at most 24 columns');
    expect(text).toContain('only "#"');
  });

  it('needs a map for platforms spawns', () => {
    const s: GameSpecInput = structuredClone(philosopherFishing);
    s.spawns[0].edge = 'platforms';
    expect(formatIssues(GameSpecSchema.safeParse(s).error!)).toContain('"platforms" spawns need a level map');
    expect(GameSpecSchema.safeParse({ ...platformer(), spawns: s.spawns }).success).toBe(true);
  });
});
