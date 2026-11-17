import { describe, expect, it } from 'vitest';
import { GameSpecSchema, formatIssues, maxReachableScore, type GameSpecInput } from './schema';
import { philosopherFishing } from './examples/philosopherFishing';

const clone = (): GameSpecInput => structuredClone(philosopherFishing);

describe('GameSpecSchema', () => {
  it('accepts the philosopher fishing sample and fills defaults', () => {
    const spec = GameSpecSchema.parse(philosopherFishing);
    expect(spec.sprites.hook.faces).toBe('none');
    expect(spec.entities[0].onCollide.lives).toBe(0);
    expect(spec.spawns[0].startDelayMs).toBe(0);
  });

  it('rejects references to unknown sprites and entities', () => {
    const bad = clone();
    bad.player.sprite = 'ghost';
    bad.spawns[0].entity = 'nobody';
    const result = GameSpecSchema.safeParse(bad);
    expect(result.success).toBe(false);
    const text = formatIssues(result.error!);
    expect(text).toContain('player.sprite: unknown sprite "ghost"');
    expect(text).toContain('spawns.0.entity: unknown entity "nobody"');
  });

  it('rejects SVGs with scripts or event handlers', () => {
    for (const svg of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><image href="https://evil.example/x.png"/></svg>',
      '<div></div>',
    ]) {
      const bad = clone();
      bad.sprites.hook.svg = svg;
      expect(GameSpecSchema.safeParse(bad).success, svg).toBe(false);
    }
  });

  it('rejects a survive win combined with a time limit', () => {
    const bad = clone();
    bad.win = { type: 'survive', seconds: 60 };
    const result = GameSpecSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(formatIssues(result.error!)).toContain('lose.timeLimitSeconds');
  });

  it('rejects chasing hazards the player cannot outrun', () => {
    const bad = clone();
    bad.entities[2] = { ...bad.entities[2], behavior: 'chase', speed: 200 }; // player speed 220
    const result = GameSpecSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(formatIssues(result.error!)).toContain('entities.2.speed: chasing hazard is too fast to escape: speed 200 must be at most 165');

    bad.entities[2].speed = 160;
    expect(GameSpecSchema.safeParse(bad).success).toBe(true);
  });

  it('rejects score targets that cannot realistically be reached in the time limit', () => {
    const spec = GameSpecSchema.parse(philosopherFishing);
    // Socrates: 1pt every 1.4s for 120s = 86; Plato: 3pts every 4s after 5s = 87.
    expect(maxReachableScore(spec, 120)).toBe(86 + 87);

    const bad = clone();
    bad.lose = { timeLimitSeconds: 10 };
    const result = GameSpecSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(formatIssues(result.error!)).toContain('win.target: target 25 is not realistically reachable in 10s');
  });
});
