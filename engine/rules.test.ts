import { describe, expect, it } from 'vitest';
import { RuleSchema, type RuleInput } from '../spec/rules';
import { RuleRunner, type RuleHost } from './rules';

function setup(rules: RuleInput[]) {
  const stats = { score: 0, lives: 3, time: 0, level: 1 };
  const log: string[] = [];
  const host: RuleHost = {
    stats: () => stats,
    spawn: (e, n) => log.push(`spawn ${e} ${n}`),
    addScore: (n) => ((stats.score += n), log.push(`score ${n}`)),
    addLives: (n) => log.push(`lives ${n}`),
    clear: (e) => log.push(`clear ${e ?? 'all'}`),
    message: (t) => log.push(`msg ${t}`),
    sound: (s) => log.push(`sound ${s}`),
    win: () => log.push('win'),
    lose: () => log.push('lose'),
  };
  return { runner: new RuleRunner(rules.map((r) => RuleSchema.parse(r)), host), stats, log };
}

describe('RuleRunner', () => {
  it('fires start, once-off and repeating triggers', () => {
    const { runner, log } = setup([
      { name: 'a', when: { on: 'start' }, then: [{ do: 'message', text: 'Go' }] },
      { name: 'b', when: { on: 'time', seconds: 5 }, then: [{ do: 'spawn', entity: 'boss' }] },
      { name: 'c', when: { on: 'every', seconds: 2 }, then: [{ do: 'sound', name: 'pop' }] },
    ]);
    runner.start();
    for (let t = 0; t <= 6000; t += 500) runner.tick(t);
    expect(log).toEqual(['msg Go', 'sound pop', 'sound pop', 'spawn boss 1', 'sound pop']);
  });

  it('respects conditions, disabled rules and collect counts', () => {
    const { runner, stats, log } = setup([
      { name: 'a', when: { on: 'touch', entity: 'gem' }, if: [{ stat: 'score', op: '>=', value: 5 }], then: [{ do: 'lives', amount: 1 }] },
      { name: 'b', when: { on: 'collect', entity: 'gem', count: 3 }, then: [{ do: 'win' }] },
      { name: 'c', when: { on: 'touch', entity: 'gem' }, then: [{ do: 'lose' }], enabled: false },
    ]);
    runner.touched('gem');
    stats.score = 5;
    runner.touched('gem');
    runner.touched('gem');
    runner.touched('gem');
    expect(log).toEqual(['lives 1', 'lives 1', 'win', 'lives 1']);
  });

  it('stacks speed and spawn-rate factors within limits', () => {
    const { runner } = setup([{ name: 'a', when: { on: 'every', seconds: 2 }, then: [{ do: 'speed', target: 'player', factor: 3 }, { do: 'spawnRate', entity: 'rock', factor: 0.5 }] }]);
    for (let t = 2000; t <= 8000; t += 2000) runner.tick(t);
    expect(runner.speedOf('player')).toBe(4);
    expect(runner.rateOf('rock')).toBe(0.25);
    expect(runner.speedOf('rock')).toBe(1);
  });

  it('remembers progress across save and load', () => {
    const rules: RuleInput[] = [{ name: 'a', when: { on: 'score', atLeast: 10 }, then: [{ do: 'lives', amount: 1 }] }];
    const first = setup(rules);
    first.stats.score = 10;
    first.runner.tick(0);
    const second = setup(rules);
    second.stats.score = 12;
    second.runner.load(first.runner.save());
    second.runner.tick(100);
    expect(first.log).toEqual(['lives 1']);
    expect(second.log).toEqual([]);
  });
});
