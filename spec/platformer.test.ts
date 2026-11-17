import { describe, expect, it } from 'vitest';
import { GameSpecSchema } from './schema';
import { makePlatformer } from './platformer';
import { cometCourier } from './examples/cometCourier';
import { philosopherFishing } from './examples/philosopherFishing';

describe('makePlatformer', () => {
  for (const [name, example] of [['comet courier', cometCourier], ['philosopher fishing', philosopherFishing]] as const) {
    it(`turns ${name} into a valid platformer`, () => {
      const spec = makePlatformer(GameSpecSchema.parse(example));
      const result = GameSpecSchema.safeParse(spec);
      expect(result.error?.issues ?? []).toEqual([]);
      expect(spec.player.controls).toBe('platformer');
      expect(spec.level?.map.length).toBeGreaterThan(0);
      const rewards = spec.entities.filter((e) => e.onCollide.score > 0);
      for (const r of rewards) expect(spec.spawns.filter((s) => s.entity === r.id).every((s) => s.edge === 'platforms')).toBe(true);
    });
  }
});
