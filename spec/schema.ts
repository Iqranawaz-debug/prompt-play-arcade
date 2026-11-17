import { z } from 'zod';

/** Lowercase identifier used to cross-reference sprites and entities. */
const Id = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/, 'ids are lowercase letters, digits and underscores');

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colours are #rrggbb hex strings');

/** Fraction of the screen, 0 = left/top, 1 = right/bottom. */
const Frac = z.number().min(0).max(1);

const Svg = z
  .string()
  .max(6000)
  .refine((s) => /^\s*<svg[\s>]/i.test(s) && /<\/svg>\s*$/i.test(s), {
    message: 'must be a single <svg>...</svg> element',
  })
  .refine((s) => !/<script|<foreignObject|\son\w+\s*=|href\s*=\s*["'](?!#)/i.test(s), {
    message: 'no scripts, event handlers, foreignObject or external hrefs',
  });

export const SpriteSchema = z.object({
  svg: Svg.describe('Inline SVG markup with a viewBox. Flat shapes, no text, no external refs.'),
  width: z.number().int().min(8).max(256).describe('Rendered width in pixels'),
  height: z.number().int().min(8).max(256).describe('Rendered height in pixels'),
  faces: z
    .enum(['left', 'right', 'none'])
    .default('none')
    .describe('Which way the drawing faces, so the engine can mirror it when moving'),
});

export const ThemeSchema = z.object({
  background: Hex,
  primary: Hex.describe('Main UI colour (HUD, buttons)'),
  accent: Hex.describe('Highlights and popups'),
  text: Hex,
});

export const PlayerSchema = z.object({
  sprite: Id,
  controls: z
    .enum(['free', 'horizontal', 'vertical'])
    .describe('free = move in all directions; horizontal/vertical = locked to one axis'),
  speed: z.number().min(40).max(700).describe('Pixels per second'),
  start: z.object({ x: Frac, y: Frac }),
  lives: z.number().int().min(1).max(9),
});

export const BEHAVIORS = ['straight', 'zigzag', 'chase', 'flee', 'wander', 'bounce', 'static'] as const;

export const EntitySchema = z.object({
  id: Id,
  name: z.string().min(1).max(40),
  sprite: Id,
  behavior: z
    .enum(BEHAVIORS)
    .describe(
      'straight: crosses the screen away from its spawn edge; zigzag: straight with a wave; ' +
        'chase/flee: toward/away from the player; wander: random turns; bounce: bounces off walls; static: does not move',
    ),
  speed: z.number().min(0).max(600).describe('Pixels per second'),
  onCollide: z.object({
    score: z.number().int().min(-100).max(100).default(0),
    lives: z.number().int().min(-3).max(3).default(0).describe('Negative = damage'),
    destroy: z.boolean().default(true).describe('Remove the entity after touching the player'),
    sfx: z
      .enum(['auto', 'pickup', 'big', 'hurt', 'heal', 'pop', 'none'])
      .default('auto')
      .describe('Sound on touch; auto picks one from the score/lives effect'),
  }),
  quotes: z
    .array(z.string().min(1).max(80))
    .max(12)
    .default([])
    .describe('Optional short lines; one pops up when the player touches this entity'),
});

export const SpawnSchema = z.object({
  entity: Id,
  edge: z
    .enum(['top', 'bottom', 'left', 'right', 'sides', 'anywhere'])
    .describe('Where entities appear; sides = randomly left or right'),
  everyMs: z.number().int().min(200).max(20000),
  maxAlive: z.number().int().min(1).max(40),
  startDelayMs: z.number().int().min(0).max(60000).default(0),
});

export const WinSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('score'), target: z.number().int().min(1).max(10000) }),
  z.object({ type: z.literal('survive'), seconds: z.number().int().min(5).max(600) }),
]);

const GameSpecBase = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(60),
    description: z.string().max(280),
    theme: ThemeSchema,
    sprites: z.record(Id, SpriteSchema),
    player: PlayerSchema,
    entities: z.array(EntitySchema).min(1).max(10),
    spawns: z.array(SpawnSchema).min(1).max(12),
    score: z.object({
      label: z.string().min(1).max(20),
      perSecond: z.number().int().min(0).max(100).default(0),
    }),
    win: WinSchema,
    lose: z.object({
      timeLimitSeconds: z
        .number()
        .int()
        .min(5)
        .max(600)
        .optional()
        .describe('Lose when time runs out. Losing all lives always ends the game.'),
    }),
    messages: z.object({
      intro: z.string().max(160),
      win: z.string().max(160),
      lose: z.string().max(160),
    }),
  });

export const GameSpecSchema = GameSpecBase.superRefine((spec, ctx) => {
  const sprites = new Set(Object.keys(spec.sprites));
  const entityIds = new Set<string>();
  const issue = (path: PropertyKey[], message: string) => ctx.addIssue({ code: 'custom', path, message });

  if (sprites.size > 16) issue(['sprites'], 'at most 16 sprites');
  if (!sprites.has(spec.player.sprite)) {
    issue(['player', 'sprite'], `unknown sprite "${spec.player.sprite}"`);
  }
  spec.entities.forEach((e, i) => {
    if (entityIds.has(e.id)) issue(['entities', i, 'id'], `duplicate entity id "${e.id}"`);
    entityIds.add(e.id);
    if (!sprites.has(e.sprite)) issue(['entities', i, 'sprite'], `unknown sprite "${e.sprite}"`);
  });
  spec.spawns.forEach((s, i) => {
    if (!entityIds.has(s.entity)) issue(['spawns', i, 'entity'], `unknown entity "${s.entity}"`);
  });
  if (spec.win.type === 'score' && !spec.entities.some((e) => e.onCollide.score > 0) && spec.score.perSecond === 0) {
    issue(['win'], 'score win needs an entity with positive onCollide.score or score.perSecond > 0');
  }
  if (spec.win.type === 'survive' && spec.lose.timeLimitSeconds !== undefined) {
    issue(['lose', 'timeLimitSeconds'], 'a survive win cannot also have a time limit');
  }
  checkBalance(spec, issue);
});

/** Chasing hazards faster than this share of the player's speed cannot be escaped. */
export const MAX_CHASER_SPEED_RATIO = 0.75;
/** With a time limit, the score target may be at most this share of the most points that can spawn. */
export const MAX_TARGET_SHARE = 0.6;

type Issue = (path: PropertyKey[], message: string) => void;
type ParsedSpec = z.output<typeof GameSpecBase>;

/** Points that could possibly be collected within `seconds`, if the player caught every reward. */
export function maxReachableScore(spec: ParsedSpec, seconds: number): number {
  let total = spec.score.perSecond * seconds;
  for (const rule of spec.spawns) {
    const points = spec.entities.find((e) => e.id === rule.entity)?.onCollide.score ?? 0;
    const activeMs = seconds * 1000 - rule.startDelayMs;
    if (points > 0 && activeMs > 0) total += points * (Math.floor(activeMs / rule.everyMs) + 1);
  }
  return total;
}

function checkBalance(spec: ParsedSpec, issue: Issue): void {
  const maxChaser = Math.floor(spec.player.speed * MAX_CHASER_SPEED_RATIO);
  spec.entities.forEach((e, i) => {
    if (e.behavior === 'chase' && e.onCollide.lives < 0 && e.speed > maxChaser) {
      issue(
        ['entities', i, 'speed'],
        `chasing hazard is too fast to escape: speed ${e.speed} must be at most ${maxChaser} (75% of player.speed ${spec.player.speed})`,
      );
    }
  });
  const limit = spec.lose.timeLimitSeconds;
  if (spec.win.type === 'score' && limit !== undefined) {
    const reachable = maxReachableScore(spec, limit);
    const allowed = Math.floor(reachable * MAX_TARGET_SHARE);
    if (spec.win.target > allowed) {
      issue(
        ['win', 'target'],
        `target ${spec.win.target} is not realistically reachable in ${limit}s: at most ${reachable} points can spawn, ` +
          `so use a target of at most ${allowed}, or spawn rewards more often, or raise the time limit`,
      );
    }
  }
}

/** Spec as authored / produced by the LLM (defaults optional). */
export type GameSpecInput = z.input<typeof GameSpecSchema>;
/** Spec after validation (defaults filled in). */
export type GameSpec = z.output<typeof GameSpecSchema>;
export type EntitySpec = GameSpec['entities'][number];
export type SpawnSpec = GameSpec['spawns'][number];
export type Behavior = (typeof BEHAVIORS)[number];

/** Human-readable list of validation problems, suitable for sending back to the LLM. */
export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
