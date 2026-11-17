import { describe, expect, it } from 'vitest';
import { cometCourier } from '../spec/examples/cometCourier';
import { philosopherFishing } from '../spec/examples/philosopherFishing';
import { GameSpecSchema } from '../spec/schema';
import { environmentHints, lintSpec } from '../spec/lint';
import { CharacterSchema, DebugResultSchema, StoryboardSchema, storyboardToPrompt, type Storyboard } from '../spec/tools';
import { askJson } from './ask';
import { debugGame, makeCharacter } from './tools';
import type { ChatMessage, ChatProvider } from './providers';

function fake(replies: string[]) {
  const calls: ChatMessage[][] = [];
  const provider: ChatProvider = {
    name: 'fake',
    label: 'Fake',
    async complete(messages) {
      calls.push(structuredClone(messages));
      const r = replies.shift();
      if (r === undefined) throw new Error('no more replies');
      return r;
    },
  };
  return { provider, calls };
}

const comet = GameSpecSchema.parse(cometCourier);
const fishing = GameSpecSchema.parse(philosopherFishing);
const storyboard: Storyboard = {
  title: 'Lantern Drift',
  logline: 'Guide a paper lantern down a river.',
  story: 'A festival night. Your lantern drifts downstream collecting fireflies.',
  characters: [
    { name: 'Lumi', role: 'player', look: 'a round paper lantern', behavior: 'drifts where you steer' },
    { name: 'Firefly', role: 'reward', look: 'a glowing dot', behavior: 'floats slowly' },
  ],
  levels: [{ name: 'Calm water', setting: 'a quiet stream', challenge: 'few hazards' }],
  objectives: ['Collect 20 fireflies'],
  obstacles: ['Splashing fish'],
  win: 'Reach 20 fireflies',
  lose: 'Lose all three flames',
};

describe('askJson', () => {
  it('sends validation errors back and retries until valid', async () => {
    const { provider, calls } = fake(['nope', JSON.stringify({ ...storyboard, characters: [] }), JSON.stringify(storyboard)]);
    const result = await askJson(provider, { system: 's', user: 'u', schema: StoryboardSchema });
    expect(result.title).toBe('Lantern Drift');
    expect(calls).toHaveLength(3);
    expect(calls[1].at(-1)!.content).toContain('not valid JSON');
    expect(calls[2].at(-1)!.content).toContain('characters');
  });
});

describe('storyboardToPrompt', () => {
  it('includes characters, stages and win/lose for the generator', () => {
    const p = storyboardToPrompt(storyboard);
    expect(p).toContain('Lumi (player)');
    expect(p).toContain('1. Calm water');
    expect(p).toContain('Win: Reach 20 fireflies');
    expect(p.length).toBeLessThanOrEqual(2000);
  });
});

describe('lintSpec and hints', () => {
  it('explains axis-locked controls', () => {
    expect(lintSpec(comet).some((f) => f.issue.includes('only move left and right'))).toBe(true);
    expect(lintSpec(fishing).some((f) => f.issue.includes('only move'))).toBe(false);
  });

  it('flags a silent game and a tiny time limit', () => {
    const quiet = structuredClone(fishing);
    quiet.entities.forEach((e) => (e.onCollide.sfx = 'none'));
    quiet.lose.timeLimitSeconds = 15;
    const issues = lintSpec(quiet).map((f) => f.issue).join(' ');
    expect(issues).toContain('silent');
    expect(issues).toContain('only 15s');
  });

  it('adds focus advice for keyboard problems', () => {
    expect(environmentHints("My character isn't moving when I press the arrow keys")[0].fix).toContain('Click inside the game');
    expect(environmentHints('it is too easy')).toHaveLength(0);
  });
});

describe('tools', () => {
  it('debugGame passes lint findings and the spec, and returns a validated fix', async () => {
    const fixed = { ...comet, player: { ...comet.player, controls: 'free' as const } };
    const { provider, calls } = fake([
      JSON.stringify({ diagnosis: 'The rocket is locked to one axis.', causes: [{ issue: 'horizontal controls', fix: 'use free' }], changed: true, spec: fixed }),
    ]);
    const r = await debugGame(provider, comet, 'up arrow does nothing');
    expect(r.changed).toBe(true);
    expect(r.spec?.player.controls).toBe('free');
    expect(calls[0][1].content).toContain('only move left and right');
    expect(calls[0][1].content).toContain('"title":"Comet Courier"');
  });

  it('debug results that claim a change must include the spec', () => {
    expect(DebugResultSchema.safeParse({ diagnosis: 'x', causes: [{ issue: 'a', fix: 'b' }], changed: true }).success).toBe(false);
    expect(DebugResultSchema.safeParse({ diagnosis: 'x', causes: [{ issue: 'a', fix: 'b' }], changed: false }).success).toBe(true);
  });

  it('makeCharacter validates the sprite and stats', async () => {
    const good = { name: 'Bolt', sprite: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#ff0"/></svg>', width: 44, height: 44, faces: 'none' }, personality: 'zippy', quotes: ['Zoom!'], speed: 320, lives: 2, controls: 'free', abilities: 'very fast but fragile' };
    const { provider } = fake([JSON.stringify({ ...good, speed: 5 }), JSON.stringify(good)]);
    const c = await makeCharacter(provider, 'a fast yellow robot', '#102030');
    expect(CharacterSchema.parse(c).speed).toBe(320);
  });
});

describe('storyboard rules', () => {
  it('requires exactly one player and at least one reward', () => {
    const noReward = { ...storyboard, characters: [storyboard.characters[0], { ...storyboard.characters[1], role: 'neutral' as const }] };
    expect(StoryboardSchema.safeParse(noReward).success).toBe(false);
    const twoPlayers = { ...storyboard, characters: [storyboard.characters[0], { ...storyboard.characters[0], name: 'Twin' }, storyboard.characters[1]] };
    expect(StoryboardSchema.safeParse(twoPlayers).success).toBe(false);
    expect(StoryboardSchema.safeParse(storyboard).success).toBe(true);
  });
});

describe('diffValues', () => {
  it('lists what a fix changes in readable paths', async () => {
    const { diffValues } = await import('../spec/diff');
    const fixed = structuredClone(comet);
    fixed.player.controls = 'free';
    fixed.spawns[1].everyMs = 1400;
    expect(diffValues(comet, fixed)).toEqual(['player.controls: "horizontal" -> "free"', 'spawns[1].everyMs: 900 -> 1400']);
    expect(diffValues(comet, comet)).toEqual([]);
  });
});
