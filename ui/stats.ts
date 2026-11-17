import type { PlayRecord } from './db';

export interface GameStats {
  gameId: string;
  title: string;
  best: number;
  rounds: number;
  wins: number;
  playtimeMs: number;
  lastPlayed: number;
}

export interface Stats {
  rounds: number;
  wins: number;
  winRate: number; // 0..1
  playtimeMs: number;
  gamesPlayed: number;
  best?: { title: string; score: number };
  perGame: GameStats[];
  recent: PlayRecord[];
}

/** Aggregate finished rounds into personal stats. Pure, so it is unit-tested. */
export function computeStats(plays: PlayRecord[], titleOf: (gameId: string) => string | undefined = () => undefined): Stats {
  const byGame = new Map<string, GameStats>();
  let wins = 0;
  let playtimeMs = 0;
  for (const p of plays) {
    if (p.result === 'won') wins++;
    playtimeMs += p.durationMs;
    const g = byGame.get(p.gameId) ?? { gameId: p.gameId, title: titleOf(p.gameId) ?? p.title, best: 0, rounds: 0, wins: 0, playtimeMs: 0, lastPlayed: 0 };
    g.best = Math.max(g.best, p.score);
    g.rounds++;
    if (p.result === 'won') g.wins++;
    g.playtimeMs += p.durationMs;
    g.lastPlayed = Math.max(g.lastPlayed, p.endedAt);
    byGame.set(p.gameId, g);
  }
  const perGame = [...byGame.values()].sort((a, b) => b.best - a.best || b.lastPlayed - a.lastPlayed);
  const top = perGame[0];
  return {
    rounds: plays.length,
    wins,
    winRate: plays.length ? wins / plays.length : 0,
    playtimeMs,
    gamesPlayed: byGame.size,
    best: top && top.best > 0 ? { title: top.title, score: top.best } : undefined,
    perGame,
    recent: [...plays].sort((a, b) => b.endedAt - a.endedAt).slice(0, 8),
  };
}

/** Best score so far for one game, from its finished rounds. */
export const personalBest = (plays: PlayRecord[], gameId: string): number =>
  plays.filter((p) => p.gameId === gameId).reduce((best, p) => Math.max(best, p.score), 0);

/** 1,284 / 12.9K / 3.4M */
export function compact(n: number): string {
  if (n < 10_000) return n.toLocaleString('en-US');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** 45s / 12m / 3h 05m */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
