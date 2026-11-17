import { describe, expect, it } from 'vitest';
import { GameSpecSchema, formatIssues, type GameSpec } from './schema';
import { BUILTIN_MODS, ModSchema, applyMod, describeOp } from './mods';
import { cometCourier } from './examples/cometCourier';
import { lanternHop } from './examples/lanternHop';
import { philosopherFishing } from './examples/philosopherFishing';

const games: [string, GameSpec][] = [
  ['comet', GameSpecSchema.parse(cometCourier)],
  ['hop', GameSpecSchema.parse(lanternHop)],
  ['fishing', GameSpecSchema.parse(philosopherFishing)],
];

describe('mods', () => {
  for (const mod of BUILTIN_MODS) {
    it(`${mod.name} gives a valid game for every example`, () => {
      for (const [name, spec] of games) {
        const { spec: out } = applyMod(spec, mod);
        const result = GameSpecSchema.safeParse(out);
        expect(result.success, `${name}: ${result.success ? '' : formatIssues(result.error)}`).toBe(true);
        expect(out).not.toEqual(spec);
      }
    });
  }

  it('resolves @hazard and @reward in mod rules', () => {
    const chaos = BUILTIN_MODS.find((m) => m.id === 'chaos-waves')!;
    const { spec } = applyMod(games[0][1], chaos);
    expect(JSON.stringify(spec.rules)).not.toContain('@');
    expect(spec.rules![0].then[0]).toMatchObject({ do: 'spawn', entity: 'comet' });
  });

  it('notes operations that do not apply and keeps games fair', () => {
    const moon = BUILTIN_MODS.find((m) => m.id === 'moon-gravity')!;
    expect(applyMod(games[0][1], moon).notes[0]).toContain('only affects platformers');
    const turbo = { v: 1 as const, id: 'fast-foes', name: 'Fast foes', description: '', ops: [{ op: 'entitySpeed' as const, who: 'hazards' as const, factor: 3 }] };
    const chaser = structuredClone(games[0][1]);
    chaser.entities[1].behavior = 'chase';
    const { spec } = applyMod(chaser, ModSchema.parse(turbo));
    expect(spec.entities[1].speed).toBeLessThanOrEqual(Math.floor(spec.player.speed * 0.75));
  });

  it('rejects malformed mod files', () => {
    expect(ModSchema.safeParse({ v: 1, id: 'Bad Id', name: 'x', description: '', ops: [] }).success).toBe(false);
    expect(ModSchema.safeParse({ v: 1, id: 'ok', name: 'x', description: '', ops: [{ op: 'eval', code: 'alert(1)' }] }).success).toBe(false);
    expect(describeOp({ op: 'spawnRate', who: 'rewards', factor: 1.5 })).toBe('Reward spawns ×1.5 as often');
  });
});
