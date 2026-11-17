import { describe, expect, it } from 'vitest';
import { GameSpecSchema, formatIssues, type GameSpecInput } from './schema';
import { conditionsHold, describeRule, RuleSchema } from './rules';
import { cometCourier } from './examples/cometCourier';

const base = (): GameSpecInput => structuredClone(cometCourier);

describe('rules', () => {
  it('accepts valid rules and fills defaults', () => {
    const s = base();
    s.rules = [{ name: 'Rush', when: { on: 'every', seconds: 20 }, then: [{ do: 'speed', target: 'comet', factor: 1.2 }, { do: 'message', text: 'Faster!' }] }];
    const spec = GameSpecSchema.parse(s);
    expect(spec.rules![0].if).toEqual([]);
    expect(spec.rules![0].enabled).toBe(true);
  });

  it('rejects unknown entities and bad parameters', () => {
    const s = base();
    s.rules = [{ name: 'Ghost', when: { on: 'touch', entity: 'ghost' }, then: [{ do: 'spawn', entity: 'nobody' }] }];
    const text = formatIssues(GameSpecSchema.safeParse(s).error!);
    expect(text).toContain('unknown entity "ghost"');
    expect(text).toContain('unknown entity "nobody"');
    expect(RuleSchema.safeParse({ name: 'x', when: { on: 'every', seconds: 1 }, then: [{ do: 'win' }] }).success).toBe(false);
    expect(RuleSchema.safeParse({ name: 'x', when: { on: 'start' }, then: [] }).success).toBe(false);
  });

  it('checks conditions', () => {
    const stats = { score: 10, lives: 2, time: 30, level: 1 };
    expect(conditionsHold([{ stat: 'score', op: '>=', value: 10 }, { stat: 'lives', op: '<=', value: 2 }], stats)).toBe(true);
    expect(conditionsHold([{ stat: 'level', op: '==', value: 2 }], stats)).toBe(false);
  });

  it('describes rules in plain English', () => {
    const r = RuleSchema.parse({
      name: 'Bonus',
      when: { on: 'score', atLeast: 50 },
      if: [{ stat: 'lives', op: '<=', value: 1 }],
      then: [{ do: 'lives', amount: 2 }, { do: 'spawn', entity: 'parcel', count: 3 }, { do: 'sound', name: 'heal' }],
    });
    expect(describeRule(r, { parcel: 'Parcel' })).toBe('When the score reaches 50, if lives is at most 1: give 2 lives, spawn 3 Parcel and play the heal sound.');
  });
});
