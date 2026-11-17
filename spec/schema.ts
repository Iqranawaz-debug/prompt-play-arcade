import { z } from 'zod';
import { jumpReach, startTile, unreachable } from './reach';
import { DEFAULT_TILE, MAP_CHARS, jumpHeight, maxCols, maxRows, parseLevel, platformTops } from './level';

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

export const IDLE_MOTIONS = ['none', 'bob', 'pulse', 'spin', 'sway', 'wobble'] as const;
export const MOVE_MOTIONS = ['none', 'tilt', 'squash', 'bob'] as const;

export const AnimSchema = z
  .object({
    idle: z.enum(IDLE_MOTIONS).default('none').describe('Motion while standing still'),
    move: z.enum(MOVE_MOTIONS).default('none').describe('Motion while moving'),
    speed: z.number().min(0.25).max(3).default(1).describe('1 = normal speed'),
  })
  .describe('Optional simple motion applied to the whole sprite');

export const SpriteSchema = z.object({
  svg: Svg.describe('Inline SVG markup with a viewBox. Flat shapes, no text, no external refs.'),
  width: z.number().int().min(8).max(256).describe('Rendered width in pixels'),
  height: z.number().int().min(8).max(256).describe('Rendered height in pixels'),
  faces: z
    .enum(['left', 'right', 'none'])
    .default('none')
    .describe('Which way the drawing faces, so the engine can mirror it when moving'),
  anim: AnimSchema.optional(),
  frames: z
    .array(Svg)
    .max(3)
    .optional()
    .describe('Optional extra animation frames (same viewBox as svg); the engine cycles svg + frames'),
  fps: z.number().int().min(1).max(12).optional().describe('Frame rate when frames are given (default 6)'),
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
    .enum(['free', 'horizontal', 'vertical', 'platformer'])
    .describe(
      'free = move in all directions; horizontal/vertical = locked to one axis; ' +
        'platformer = run left/right and jump, with physics.gravity pulling down',
    ),
  speed: z.number().min(40).max(700).describe('Pixels per second'),
  start: z.object({ x: Frac, y: Frac }),
  lives: z.number().int().min(1).max(9),
});

export const MUSIC_STYLES = ['none', 'chill', 'arcade', 'spooky', 'upbeat', 'dreamy'] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number];

export const BEHAVIORS = ['straight', 'zigzag', 'chase', 'flee', 'wander', 'bounce', 'static', 'patrol'] as const;

export const EntitySchema = z.object({
  id: Id,
  name: z.string().min(1).max(40),
  sprite: Id,
  behavior: z
    .enum(BEHAVIORS)
    .describe(
      'straight: crosses the screen away from its spawn edge; zigzag: straight with a wave; ' +
        'chase/flee: toward/away from the player; wander: random turns; bounce: bounces off walls; static: does not move; ' +
          'patrol: walks left and right, turning at walls and platform edges',
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
    .enum(['top', 'bottom', 'left', 'right', 'sides', 'anywhere', 'platforms'])
    .describe('Where entities appear; sides = randomly left or right; platforms = standing on top of a level wall tile'),
  everyMs: z.number().int().min(200).max(20000),
  maxAlive: z.number().int().min(1).max(40),
  startDelayMs: z.number().int().min(0).max(60000).default(0),
});

export const WinSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('score'), target: z.number().int().min(1).max(10000) }),
  z.object({ type: z.literal('survive'), seconds: z.number().int().min(5).max(600) }),
]);

export const LevelSchema = z
  .object({
    name: z.string().max(40).optional().describe('Level name shown when it starts'),
    tileSize: z.number().int().min(20).max(80).default(DEFAULT_TILE).describe('Tile size in pixels'),
    map: z
      .array(z.string().max(48))
      .min(1)
      .max(24)
      .describe('Rows from top to bottom: "#" = wall/platform, "." = empty, "P" = player start (optional)'),
  })
  .describe(`Optional tile map. With the default 40px tiles the field is ${maxCols(DEFAULT_TILE)} columns x ${maxRows(DEFAULT_TILE)} rows`);

export const PhysicsSchema = z
  .object({
    gravity: z.number().min(0).max(2000).default(0).describe('Downward pull in px/s^2 (platformer only)'),
    jump: z.number().min(0).max(1200).default(0).describe('Jump launch speed in px/s (platformer only)'),
    friction: z.number().min(0).max(1).default(0).describe('0 = stop instantly, 1 = very slippery'),
  })
  .describe('Optional physics; needed for platformer controls');

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
    level: LevelSchema.optional(),
    levels: z
      .array(LevelSchema)
      .min(1)
      .max(8)
      .optional()
      .describe("Optional sequence of levels played in order (instead of level); the win condition applies to each level"),
    physics: PhysicsSchema.optional(),
    audio: z
      .object({
        music: z.enum(MUSIC_STYLES).default('none').describe('Background music style, played during a round'),
        volume: z.number().min(0).max(1).default(0.5),
      })
      .default({ music: 'none', volume: 0.5 })
      .describe('Optional background music; pick a style that fits the mood'),
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
  checkLevel(spec, issue);
  checkBalance(spec, issue);
});

/** A player jump must clear at least this many tiles, so platforms are reachable. */
export const MIN_JUMP_TILES = 1.5;

/** Every level of a game, in play order: `levels` if given, else the single `level`. */
export function levelsOf<L>(spec: { level?: L; levels?: L[] }): L[] {
  return spec.levels?.length ? spec.levels : spec.level ? [spec.level] : [];
}

function checkLevel(spec: ParsedSpec, issue: Issue): void {
  const levels = levelsOf(spec);
  const root = spec.levels?.length ? 'levels' : 'level';
  const at = (i: number): PropertyKey[] => (root === 'levels' ? ['levels', i] : ['level']);
  if (spec.level && spec.levels?.length) issue(['level'], 'use either "level" or "levels", not both');
  const platformer = spec.player.controls === 'platformer';
  const p = spec.physics;
  const tile = Math.max(DEFAULT_TILE, ...levels.map((l) => l.tileSize));

  if (platformer) {
    if (!p || p.gravity < 200) issue(['physics', 'gravity'], 'platformer controls need physics.gravity of at least 200');
    else {
      const need = Math.ceil(MIN_JUMP_TILES * tile);
      const height = jumpHeight(p.jump, p.gravity);
      if (height < need) {
        const minJump = Math.ceil(Math.sqrt(2 * p.gravity * need));
        issue(['physics', 'jump'], `jump only reaches ${Math.floor(height)}px; it must reach ${need}px (1.5 tiles), so use jump >= ${minJump}`);
      }
    }
  }

  levels.forEach((level, i) => {
    const cols = maxCols(level.tileSize);
    const rows = maxRows(level.tileSize);
    let bad = level.map.length > rows;
    if (bad) issue([...at(i), 'map'], `at most ${rows} rows for ${level.tileSize}px tiles (got ${level.map.length})`);
    let starts = 0;
    level.map.forEach((row, r) => {
      if (row.length > cols) issue([...at(i), 'map', r], `at most ${cols} columns for ${level.tileSize}px tiles (got ${row.length})`);
      if (!MAP_CHARS.test(row)) issue([...at(i), 'map', r], 'only "#", ".", " " and "P" are allowed');
      bad ||= row.length > cols || !MAP_CHARS.test(row);
      starts += row.split('P').length - 1;
    });
    if (starts > 1) issue([...at(i), 'map'], 'at most one "P" (player start)');
    if (bad || (platformer && (!p || p.gravity < 200))) return;

    const grid = parseLevel(level);
    const mobility = { platformer, speed: spec.player.speed, jump: p?.jump ?? 0, gravity: p?.gravity ?? 0 };
    const lost = unreachable(grid, startTile(grid, spec.player.start, platformer), mobility);
    if (lost.length) {
      const where = lost.slice(0, 3).map((t) => `row ${t.row} col ${t.col}`).join(', ');
      issue(
        [...at(i), 'map'],
        platformer
          ? `${lost.length} standing spot(s) cannot be reached from the start (e.g. ${where}); move ledges closer: at most ${jumpReach(grid, mobility).up} rows up and ${jumpReach(grid, mobility).across} columns across per jump`
          : `${lost.length} empty tile(s) are walled off from the start (e.g. ${where}); open a gap or fill them with "#"`,
      );
    }
  });

  spec.spawns.forEach((s, i) => {
    if (s.edge !== 'platforms') return;
    if (!levels.length || levels.some((l) => platformTops(parseLevel(l)).length === 0)) {
      issue(['spawns', i, 'edge'], '"platforms" spawns need level maps with wall tiles that have empty space above them');
    }
  });
}

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
