import { z } from 'zod';

/**
 * A snapshot of a round in progress. It crosses the sandbox boundary in both directions (game -> dashboard on save,
 * dashboard -> game on load), so both sides validate it with this schema.
 */
const Num = z.number().finite();
const Vec = z.object({ x: Num, y: Num });

const NumRecord = z.record(z.string().max(40), Num);

export const SaveStateSchema = z.object({
  v: z.literal(1),
  levelIndex: z.number().int().min(0).max(7),
  /** Points banked from earlier levels. */
  carried: z.number().int().min(0).max(1_000_000),
  score: z.number().int().min(0).max(1_000_000),
  lives: z.number().int().min(1).max(9),
  elapsedMs: Num.min(0).max(3_600_000),
  player: z.object({ pos: Vec, vel: Vec, flip: z.boolean() }),
  entities: z
    .array(
      z.object({
        id: z.string().max(32),
        pos: Vec,
        vel: Vec,
        entered: z.boolean(),
        mover: z.object({ dir: Vec, ageMs: Num, phase: Num, turnInMs: Num, leaving: z.boolean() }),
      }),
    )
    .max(200),
  /** Rule progress (which one-off rules fired, speed and spawn-rate changes), when the game has rules. */
  rules: z
    .object({ fired: z.array(z.number().int().min(0).max(19)).max(20), nextEvery: NumRecord, touches: NumRecord, speed: NumRecord, rate: NumRecord })
    .optional(),
});
export type SaveState = z.infer<typeof SaveStateSchema>;

/** One-line summary for lists: "Level 2 · 14 points · 2 lives · 0:37". */
export function describeSave(s: SaveState, scoreLabel: string, levelCount: number): string {
  const secs = Math.floor(s.elapsedMs / 1000);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const level = levelCount > 1 ? `Level ${s.levelIndex + 1} · ` : '';
  return `${level}${s.carried + s.score} ${scoreLabel.toLowerCase()} · ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} · ${time}`;
}
