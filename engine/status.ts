/** Live game state the engine reports to whoever embeds it (the dashboard shows it as HUD badges). */
export type GamePhase = 'intro' | 'playing' | 'won' | 'lost';

export interface GameStatus {
  phase: GamePhase;
  score: number;
  target?: number;
  lives: number;
  maxLives: number;
}

const PHASES: readonly GamePhase[] = ['intro', 'playing', 'won', 'lost'];

/** Messages cross a sandbox boundary, so check their shape before trusting them. */
export function isGameStatus(value: unknown): value is GameStatus {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const int = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1e7;
  return (
    PHASES.includes(v.phase as GamePhase) &&
    int(v.score) &&
    int(v.lives) &&
    int(v.maxLives) &&
    (v.target === undefined || int(v.target))
  );
}
