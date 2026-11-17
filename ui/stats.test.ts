import { describe, expect, it } from 'vitest';
import type { PlayRecord } from './db';
import { compact, computeStats, duration, personalBest } from './stats';

const play = (gameId: string, result: 'won' | 'lost', score: number, durationMs: number, endedAt: number): PlayRecord => ({
  gameId, title: gameId.toUpperCase(), result, score, durationMs, endedAt,
});
const plays = [play('a', 'won', 25, 60_000, 1), play('a', 'lost', 12, 30_000, 2), play('b', 'won', 40, 90_000, 3), play('b', 'lost', 5, 10_000, 4)];

describe('computeStats', () => {
  it('totals rounds, wins, playtime and best score', () => {
    const s = computeStats(plays);
    expect(s.rounds).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.winRate).toBe(0.5);
    expect(s.playtimeMs).toBe(190_000);
    expect(s.gamesPlayed).toBe(2);
    expect(s.best).toEqual({ title: 'B', score: 40 });
  });

  it('lists personal bests per game, best first, and the latest rounds', () => {
    const s = computeStats(plays, (id) => (id === 'a' ? 'Alpha' : undefined));
    expect(s.perGame.map((g) => `${g.title}:${g.best}:${g.rounds}:${g.wins}`)).toEqual(['B:40:2:1', 'Alpha:25:2:1']);
    expect(s.recent.map((p) => p.endedAt)).toEqual([4, 3, 2, 1]);
  });

  it('handles no plays', () => {
    const s = computeStats([]);
    expect(s).toMatchObject({ rounds: 0, winRate: 0, best: undefined, perGame: [] });
  });

  it('finds one game\'s personal best', () => {
    expect(personalBest(plays, 'a')).toBe(25);
    expect(personalBest(plays, 'zzz')).toBe(0);
  });
});

describe('formatting', () => {
  it('compacts numbers and durations', () => {
    expect(compact(1284)).toBe('1,284');
    expect(compact(12_900)).toBe('12.9K');
    expect(compact(3_400_000)).toBe('3.4M');
    expect(duration(45_000)).toBe('45s');
    expect(duration(125_000)).toBe('2m 05s');
    expect(duration(3_900_000)).toBe('1h 05m');
  });
});
