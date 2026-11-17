import { z } from 'zod';
import { GameSpecSchema, LevelSchema, PlayerSchema, SpriteSchema, levelsOf, type GameSpec } from './schema';

/** Contracts for the AI studio tools. Shared by the server (validation) and the UI (types). */

const text = (max: number) => z.string().trim().min(1).max(max);

// ---------- Storyboard ----------
export const StoryboardSchema = z.object({
  title: text(60),
  logline: text(200).describe('One sentence pitch'),
  story: text(700).describe('Short storyline, 2-5 sentences'),
  characters: z
    .array(
      z.object({
        name: text(40),
        role: z.enum(['player', 'reward', 'hazard', 'neutral']),
        look: text(220).describe('Appearance, for drawing the sprite'),
        behavior: text(220).describe('How it moves and acts'),
      }),
    )
    .min(2)
    .max(6),
  levels: z
    .array(z.object({ name: text(40), setting: text(220), challenge: text(220) }))
    .min(1)
    .max(4)
    .describe('Stages of rising difficulty'),
  objectives: z.array(text(160)).min(1).max(4),
  obstacles: z.array(text(160)).max(5),
  win: text(220),
  lose: text(220),
}).superRefine((sb, ctx) => {
  const players = sb.characters.filter((c) => c.role === 'player').length;
  if (players !== 1) ctx.addIssue({ code: 'custom', path: ['characters'], message: `exactly one character must have role "player" (found ${players})` });
  if (!sb.characters.some((c) => c.role === 'reward')) ctx.addIssue({ code: 'custom', path: ['characters'], message: 'add at least one character with role "reward" (something to collect)' });
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

/** Turn an (edited) storyboard into the description sent to the game generator. */
export function storyboardToPrompt(sb: Storyboard): string {
  const lines = [
    `${sb.title}: ${sb.logline}`,
    `Story: ${sb.story}`,
    'Characters:',
    ...sb.characters.map((c) => `- ${c.name} (${c.role}): looks like ${c.look}; ${c.behavior}`),
    'Stages (make later stages harder, e.g. hazards that join later or spawn faster):',
    ...sb.levels.map((l, i) => `- ${i + 1}. ${l.name}: ${l.setting}. Challenge: ${l.challenge}`),
    `Objectives: ${sb.objectives.join('; ')}`,
    sb.obstacles.length ? `Obstacles: ${sb.obstacles.join('; ')}` : '',
    `Win: ${sb.win}`,
    `Lose: ${sb.lose}`,
  ];
  return lines.filter(Boolean).join('\n').slice(0, 2000);
}

// ---------- Character ----------
export const CharacterSchema = z.object({
  name: text(40),
  sprite: SpriteSchema,
  personality: text(220),
  quotes: z.array(text(80)).max(6),
  speed: PlayerSchema.shape.speed,
  lives: PlayerSchema.shape.lives,
  controls: PlayerSchema.shape.controls,
  abilities: text(220).describe('How the abilities map to speed, lives and movement'),
});
export type Character = z.infer<typeof CharacterSchema>;

// ---------- Debugger ----------
export const DebugResultSchema = z
  .object({
    diagnosis: text(700),
    causes: z.array(z.object({ issue: text(180), fix: text(240) })).min(1).max(5),
    /** True when the spec itself should change; false when the fix is outside the game (e.g. click to focus). */
    changed: z.boolean(),
    spec: GameSpecSchema.optional(),
  })
  .superRefine((r, ctx) => {
    if (r.changed && !r.spec) ctx.addIssue({ code: 'custom', path: ['spec'], message: 'changed is true, so include the full fixed spec' });
  });
export type DebugResult = z.infer<typeof DebugResultSchema>;

// ---------- Sprite redraw ----------
export const SpriteResultSchema = z.object({ sprite: SpriteSchema });

// ---------- Animation frames ----------
export const FramesResultSchema = z.object({
  frames: SpriteSchema.shape.frames.unwrap().min(1).describe('Extra frames, same viewBox and size as the original'),
});

// ---------- Level design ----------
const DesignedLevel = LevelSchema.extend({ name: z.string().min(1).max(40) });
export type DesignedLevel = z.infer<typeof DesignedLevel>;

/**
 * Levels for `spec`, validated in context: appended to the game's existing levels, the whole game must still pass the
 * schema (sizes, characters, reachability for this game's movement and jump), so retries get the exact problems.
 */
export function levelsResultSchema(spec: GameSpec, count: number) {
  const existing = levelsOf(spec);
  return z.object({ levels: z.array(DesignedLevel).min(1).max(count) }).superRefine((r, ctx) => {
    const trial = { ...spec, level: undefined, levels: [...existing, ...r.levels] };
    const result = GameSpecSchema.safeParse(trial);
    if (result.success) return;
    for (const i of result.error.issues) {
      if (i.path[0] !== 'levels' || typeof i.path[1] !== 'number' || i.path[1] < existing.length) continue;
      ctx.addIssue({ code: 'custom', path: ['levels', i.path[1] - existing.length, ...i.path.slice(2)], message: i.message });
    }
  });
}
