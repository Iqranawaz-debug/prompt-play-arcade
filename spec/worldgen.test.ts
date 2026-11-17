import { describe, expect, it } from 'vitest';
import { GameSpecSchema, formatIssues, type GameSpecInput } from './schema';
import { generateLevel, rng, WORLD_STYLES, type Density } from './worldgen';
import { lanternHop } from './examples/lanternHop';
import { philosopherFishing } from './examples/philosopherFishing';

const platformer = { platformer: true, speed: 260, jump: 680, gravity: 1400 };
const topDown = { platformer: false, speed: 260, jump: 0, gravity: 0 };

describe('world generator', () => {
  it('is deterministic per seed', () => {
    expect(rng(7)()).toBe(rng(7)());
    const o = { style: 'maze', density: 'normal', seed: 42, mobility: topDown } as const;
    expect(generateLevel(o)).toEqual(generateLevel(o));
    expect(generateLevel({ ...o, seed: 43 }).map).not.toEqual(generateLevel(o).map);
  });

  for (const style of WORLD_STYLES) {
    for (const density of ['sparse', 'normal', 'dense'] as Density[]) {
      it(`${style.id}/${density}: 30 seeds all make valid, fully reachable levels`, () => {
        for (let seed = 1; seed <= 30; seed++) {
          const level = generateLevel({ style: style.id, density, seed, mobility: style.platformer ? platformer : topDown });
          const spec: GameSpecInput = structuredClone(style.platformer ? lanternHop : philosopherFishing);
          spec.level = level;
          const result = GameSpecSchema.safeParse(spec);
          expect(result.success, `seed ${seed}: ${result.success ? '' : formatIssues(result.error)}\n${level.map.join('\n')}`).toBe(true);
          expect(level.map.join('')).toContain('#');
        }
      });
    }
  }
});
