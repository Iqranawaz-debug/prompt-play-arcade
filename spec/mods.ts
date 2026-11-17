import { z } from 'zod';
import { MAX_CHASER_SPEED_RATIO, MAX_TARGET_SHARE, MUSIC_STYLES, maxReachableScore, type GameSpec } from './schema';
import { RuleSchema, type Rule } from './rules';

/**
 * Mods: reusable, shareable changes that work on ANY game. A mod is data (a list of typed operations), never code,
 * and imported mod files are validated like everything else. Rules inside a mod refer to "@hazard" / "@reward",
 * which resolve to the game's own main hazard and reward.
 */
const Who = z.enum(['all', 'hazards', 'rewards']);
const Factor = (min: number, max: number) => z.number().min(min).max(max);
export const PALETTES = ['night', 'neon', 'pastel', 'mono', 'inverted'] as const;


export const ModOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('playerSpeed'), factor: Factor(0.25, 3) }),
  z.object({ op: z.literal('entitySpeed'), who: Who, factor: Factor(0.25, 3) }),
  z.object({ op: z.literal('spawnRate'), who: Who, factor: Factor(0.25, 4) }),
  z.object({ op: z.literal('lives'), set: z.number().int().min(1).max(9) }),
  z.object({ op: z.literal('spriteScale'), who: z.enum(['player', 'all', 'hazards', 'rewards']), factor: Factor(0.5, 2) }),
  z.object({ op: z.literal('theme'), palette: z.enum(PALETTES) }),
  z.object({ op: z.literal('gravity'), factor: Factor(0.25, 2) }),
  z.object({ op: z.literal('removeHazards') }),
  z.object({ op: z.literal('timeLimit'), factor: Factor(0.5, 3) }),
  z.object({ op: z.literal('scoreTarget'), factor: Factor(0.25, 3) }),
  z.object({ op: z.literal('music'), style: z.enum(MUSIC_STYLES) }),
  z.object({ op: z.literal('addRules'), rules: z.array(RuleSchema).min(1).max(5) }),
]);
export type ModOp = z.infer<typeof ModOpSchema>;

export const ModSchema = z.object({
  v: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'ids are lowercase letters, digits and dashes'),
  name: z.string().min(1).max(40),
  description: z.string().max(160),
  author: z.string().max(40).optional(),
  ops: z.array(ModOpSchema).min(1).max(12),
});
export type Mod = z.infer<typeof ModSchema>;
export type ModInput = z.input<typeof ModSchema>;

// ---------- colours (small, local: spec code doesn't depend on the engine) ----------
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const blend = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const grey = (h: string) => {
  const [r, g, b] = rgb(h);
  const y = 0.3 * r + 0.59 * g + 0.11 * b;
  return hex([y, y, y]);
};
const saturate = (h: string) => {
  const c = rgb(h);
  const max = Math.max(...c);
  const min = Math.min(...c);
  return hex(c.map((v) => (max === min ? v : ((v - min) / (max - min)) * 255)));
};

function recolor(theme: GameSpec['theme'], palette: (typeof PALETTES)[number]): GameSpec['theme'] {
  const map = (f: (h: string) => string) => ({ background: f(theme.background), primary: f(theme.primary), accent: f(theme.accent), text: f(theme.text) });
  switch (palette) {
    case 'night':
      return { background: blend(theme.background, '#05060f', 0.75), primary: blend(theme.primary, '#7aa2ff', 0.35), accent: blend(theme.accent, '#c084fc', 0.35), text: '#dfe6ff' };
    case 'neon':
      return { background: '#07040f', primary: saturate(theme.primary), accent: saturate(theme.accent), text: '#f5f3ff' };
    case 'pastel':
      return { background: blend(theme.background, '#fdf6ff', 0.15), primary: blend(theme.primary, '#ffffff', 0.4), accent: blend(theme.accent, '#ffffff', 0.4), text: blend(theme.text, '#ffffff', 0.3) };
    case 'mono':
      return map(grey);
    case 'inverted':
      return map((h) => hex(rgb(h).map((v) => 255 - v)));
  }
}

// ---------- applying ----------
const isHazard = (e: GameSpec['entities'][number]) => e.onCollide.lives < 0;
const isReward = (e: GameSpec['entities'][number]) => e.onCollide.score > 0 && e.onCollide.lives >= 0;
const picks = (who: z.infer<typeof Who>) => (e: GameSpec['entities'][number]) => who === 'all' || (who === 'hazards' ? isHazard(e) : isReward(e));
const clampInt = (n: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, n)));

/** Swap "@hazard"/"@reward" in a mod rule for real entity ids; undefined if the game has no such entity. */
function resolveRule(rule: Rule, spec: GameSpec): Rule | undefined {
  const hazard = spec.entities.find(isHazard)?.id;
  const reward = spec.entities.find(isReward)?.id;
  let missing = false;
  const json = JSON.stringify(rule).replace(/"@(hazard|reward)"/g, (_, kind: string) => {
    const id = kind === 'hazard' ? hazard : reward;
    if (!id) missing = true;
    return JSON.stringify(id ?? 'x');
  });
  return missing ? undefined : (JSON.parse(json) as Rule);
}

/** Keep a modded game fair: chasers stay escapable and score targets reachable (the schema's balance rules). */
export function fitBalance(spec: GameSpec): void {
  const maxChaser = Math.floor(spec.player.speed * MAX_CHASER_SPEED_RATIO);
  for (const e of spec.entities) if (e.behavior === 'chase' && e.onCollide.lives < 0) e.speed = Math.min(e.speed, maxChaser);
  const limit = spec.lose.timeLimitSeconds;
  if (spec.win.type === 'score' && limit !== undefined) {
    spec.win.target = Math.max(1, Math.min(spec.win.target, Math.floor(maxReachableScore(spec, limit) * MAX_TARGET_SHARE)));
  }
}

/** Apply a mod to a game. Returns the new spec and notes about operations that didn't apply to this game. */
export function applyMod(input: GameSpec, mod: Mod): { spec: GameSpec; notes: string[] } {
  const spec = structuredClone(input);
  const notes: string[] = [];
  for (const op of mod.ops) {
    switch (op.op) {
      case 'playerSpeed':
        spec.player.speed = clampInt(spec.player.speed * op.factor, 40, 700);
        break;
      case 'entitySpeed':
        for (const e of spec.entities.filter(picks(op.who))) e.speed = clampInt(e.speed * op.factor, 0, 600);
        break;
      case 'spawnRate': {
        const ids = new Set(spec.entities.filter(picks(op.who)).map((e) => e.id));
        for (const s of spec.spawns) if (ids.has(s.entity)) s.everyMs = clampInt(s.everyMs / op.factor, 200, 20000);
        break;
      }
      case 'lives':
        spec.player.lives = op.set;
        break;
      case 'spriteScale': {
        const ids = new Set(op.who === 'player' ? [spec.player.sprite] : spec.entities.filter(picks(op.who)).map((e) => e.sprite));
        if (op.who === 'all') ids.add(spec.player.sprite);
        for (const id of ids) {
          const s = spec.sprites[id];
          if (s) Object.assign(s, { width: clampInt(s.width * op.factor, 8, 256), height: clampInt(s.height * op.factor, 8, 256) });
        }
        break;
      }
      case 'theme':
        spec.theme = recolor(spec.theme, op.palette);
        break;
      case 'gravity':
        if (spec.player.controls !== 'platformer' || !spec.physics) notes.push(`"${mod.name}": gravity only affects platformers.`);
        else {
          // Keep jumps the same height relative to gravity, so levels stay reachable.
          const g = clampInt(spec.physics.gravity * op.factor, 200, 2000);
          spec.physics.jump = clampInt(spec.physics.jump * Math.sqrt(g / spec.physics.gravity), 0, 1200);
          spec.physics.gravity = g;
        }
        break;
      case 'removeHazards': {
        const gone = new Set(spec.entities.filter(isHazard).map((e) => e.id));
        if (gone.size === spec.entities.length) {
          notes.push(`"${mod.name}": every entity is a hazard here, so they were kept.`);
          break;
        }
        spec.entities = spec.entities.filter((e) => !gone.has(e.id));
        spec.spawns = spec.spawns.filter((s) => !gone.has(s.entity));
        spec.rules = spec.rules?.filter((r) => !JSON.stringify(r).match(new RegExp(`"(${[...gone].join('|')})"`)));
        if (spec.spawns.length === 0) spec.spawns = [{ entity: spec.entities[0].id, edge: 'anywhere', everyMs: 1500, maxAlive: 5, startDelayMs: 0 }];
        break;
      }
      case 'timeLimit':
        if (spec.lose.timeLimitSeconds !== undefined) spec.lose.timeLimitSeconds = clampInt(spec.lose.timeLimitSeconds * op.factor, 5, 600);
        else if (spec.win.type === 'survive') spec.win.seconds = clampInt(spec.win.seconds * op.factor, 5, 600);
        else notes.push(`"${mod.name}": this game has no clock to change.`);
        break;
      case 'scoreTarget':
        if (spec.win.type === 'score') spec.win.target = clampInt(spec.win.target * op.factor, 1, 10000);
        else notes.push(`"${mod.name}": this game is won by surviving, not by score.`);
        break;
      case 'music':
        spec.audio = { ...spec.audio, music: op.style };
        break;
      case 'addRules': {
        const rules = op.rules.map((r) => resolveRule(r, spec)).filter((r): r is Rule => r !== undefined);
        if (rules.length < op.rules.length) notes.push(`"${mod.name}": some rules need a hazard or reward this game doesn't have.`);
        spec.rules = [...(spec.rules ?? []), ...rules].slice(0, 20);
        break;
      }
    }
  }
  fitBalance(spec);
  return { spec, notes };
}

/** One line per operation, for mod cards. */
export function describeOp(op: ModOp): string {
  const x = (f: number) => `×${Math.round(f * 100) / 100}`;
  switch (op.op) {
    case 'playerSpeed':
      return `Player speed ${x(op.factor)}`;
    case 'entitySpeed':
      return `${op.who === 'all' ? 'Entity' : op.who === 'hazards' ? 'Hazard' : 'Reward'} speed ${x(op.factor)}`;
    case 'spawnRate':
      return `${op.who === 'all' ? 'Spawns' : op.who === 'hazards' ? 'Hazard spawns' : 'Reward spawns'} ${x(op.factor)} as often`;
    case 'lives':
      return `${op.set} ${op.set === 1 ? 'life' : 'lives'}`;
    case 'spriteScale':
      return `${op.who === 'player' ? 'Player' : op.who === 'all' ? 'All sprites' : op.who === 'hazards' ? 'Hazards' : 'Rewards'} size ${x(op.factor)}`;
    case 'theme':
      return `${op.palette[0].toUpperCase()}${op.palette.slice(1)} colours`;
    case 'gravity':
      return `Gravity ${x(op.factor)}`;
    case 'removeHazards':
      return 'No hazards';
    case 'timeLimit':
      return `Clock ${x(op.factor)}`;
    case 'scoreTarget':
      return `Score target ${x(op.factor)}`;
    case 'music':
      return `Music: ${op.style}`;
    case 'addRules':
      return `${op.rules.length} rule${op.rules.length === 1 ? '' : 's'}: ${op.rules.map((r) => r.name).join(', ')}`;
  }
}

const mod = (m: Omit<ModInput, 'v' | 'author'>): Mod => ModSchema.parse({ v: 1, author: 'Game Generator', ...m });

/** Mods that ship with the app. */
export const BUILTIN_MODS: Mod[] = [
  mod({ id: 'turbo', name: 'Turbo', description: 'Everything moves faster, including you.', ops: [{ op: 'playerSpeed', factor: 1.3 }, { op: 'entitySpeed', who: 'all', factor: 1.3 }, { op: 'music', style: 'arcade' }] }),
  mod({ id: 'zen-garden', name: 'Zen Garden', description: 'No hazards, more time, calm music. Just collect.', ops: [{ op: 'removeHazards' }, { op: 'timeLimit', factor: 1.5 }, { op: 'music', style: 'chill' }] }),
  mod({ id: 'one-hit', name: 'One-Hit Wonder', description: 'A single life, but an easier target.', ops: [{ op: 'lives', set: 1 }, { op: 'scoreTarget', factor: 0.7 }] }),
  mod({ id: 'giants', name: 'Giants', description: 'Every sprite is half again as big.', ops: [{ op: 'spriteScale', who: 'all', factor: 1.5 }] }),
  mod({ id: 'tiny-world', name: 'Tiny World', description: 'Everything shrinks; you get a little slower to match.', ops: [{ op: 'spriteScale', who: 'all', factor: 0.7 }, { op: 'playerSpeed', factor: 0.9 }] }),
  mod({ id: 'night-shift', name: 'Night Shift', description: 'Dark colours and spooky music.', ops: [{ op: 'theme', palette: 'night' }, { op: 'music', style: 'spooky' }] }),
  mod({ id: 'neon-rush', name: 'Neon Rush', description: 'Neon colours and more of everything.', ops: [{ op: 'theme', palette: 'neon' }, { op: 'spawnRate', who: 'all', factor: 1.4 }, { op: 'music', style: 'upbeat' }] }),
  mod({ id: 'moon-gravity', name: 'Moon Gravity', description: 'Floaty platforming: gravity drops to under half.', ops: [{ op: 'gravity', factor: 0.45 }, { op: 'music', style: 'dreamy' }] }),
  mod({ id: 'bullet-time', name: 'Bullet Time', description: 'Hazards slow to a crawl.', ops: [{ op: 'entitySpeed', who: 'hazards', factor: 0.6 }] }),
  mod({
    id: 'chaos-waves',
    name: 'Chaos Waves',
    description: 'Hazard waves every 15 seconds, and they keep getting faster.',
    ops: [
      {
        op: 'addRules',
        rules: [
          { name: 'Chaos wave', when: { on: 'every', seconds: 15 }, then: [{ do: 'spawn', entity: '@hazard', count: 3 }, { do: 'message', text: 'Chaos wave!' }] },
          { name: 'Escalation', when: { on: 'every', seconds: 20 }, then: [{ do: 'speed', target: '@hazard', factor: 1.1 }] },
        ],
      },
    ],
  }),
];
