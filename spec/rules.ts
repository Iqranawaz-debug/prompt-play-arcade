import { z } from 'zod';

/**
 * Game logic as data: "When <trigger>, if <conditions>, then <actions>". The engine interprets these; nothing here is
 * code, so rules are as safe as the rest of the spec. Kept deliberately small so the builder UI can show every option.
 */
/** An entity id. Mods may also say "@hazard" / "@reward"; games reject those via the unknown-entity check. */
const Ref = z.string().regex(/^(@hazard|@reward|[a-z][a-z0-9_]{0,31})$/, 'entity ids are lowercase letters, digits and underscores');

export const TriggerSchema = z.discriminatedUnion('on', [
  z.object({ on: z.literal('start') }).describe('When a level starts'),
  z.object({ on: z.literal('time'), seconds: z.number().int().min(1).max(600) }).describe('Once, after N seconds'),
  z.object({ on: z.literal('every'), seconds: z.number().int().min(2).max(120) }).describe('Repeatedly, every N seconds'),
  z.object({ on: z.literal('score'), atLeast: z.number().int().min(1).max(10000) }).describe('Once, when the score reaches N'),
  z.object({ on: z.literal('lives'), atMost: z.number().int().min(1).max(8) }).describe('Once, when lives drop to N'),
  z.object({ on: z.literal('touch'), entity: Ref }).describe('Each time the player touches this entity'),
  z.object({ on: z.literal('collect'), entity: Ref, count: z.number().int().min(2).max(100) }).describe('Once, after touching this entity N times'),
]);

export const STATS = ['score', 'lives', 'time', 'level'] as const;
export const ConditionSchema = z.object({
  stat: z.enum(STATS).describe('time is seconds into the level; level is 1-based'),
  op: z.enum(['>=', '<=', '==']),
  value: z.number().int().min(0).max(10000),
});

export const SOUNDS = ['pickup', 'big', 'hurt', 'heal', 'pop', 'start', 'win', 'lose', 'jump'] as const;
export const ActionSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('spawn'), entity: Ref, count: z.number().int().min(1).max(5).default(1) }).describe('Spawn entities (using their spawn rule edge)'),
  z.object({ do: z.literal('score'), amount: z.number().int().min(-100).max(100) }),
  z.object({ do: z.literal('lives'), amount: z.number().int().min(-3).max(3) }),
  z.object({ do: z.literal('speed'), target: z.union([z.literal('player'), Ref]), factor: z.number().min(0.25).max(3) }).describe('Multiply a speed (stacks; capped)'),
  z.object({ do: z.literal('spawnRate'), entity: Ref, factor: z.number().min(0.25).max(4) }).describe('Spawn this entity faster (factor > 1) or slower'),
  z.object({ do: z.literal('clear'), entity: Ref.optional() }).describe('Remove every entity of one kind (or all)'),
  z.object({ do: z.literal('message'), text: z.string().min(1).max(60) }),
  z.object({ do: z.literal('sound'), name: z.enum(SOUNDS) }),
  z.object({ do: z.literal('win') }),
  z.object({ do: z.literal('lose') }),
]);

export const RuleSchema = z.object({
  name: z.string().min(1).max(40),
  when: TriggerSchema,
  if: z.array(ConditionSchema).max(3).default([]),
  then: z.array(ActionSchema).min(1).max(5),
  enabled: z.boolean().default(true),
});

export type Trigger = z.infer<typeof TriggerSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Rule = z.output<typeof RuleSchema>;
export type RuleInput = z.input<typeof RuleSchema>;

/** Entity ids a rule mentions, for reference checks. */
export function ruleRefs(rule: Pick<Rule, 'when' | 'then'>): string[] {
  const refs: string[] = [];
  if ('entity' in rule.when) refs.push(rule.when.entity);
  for (const a of rule.then) {
    if ('entity' in a && a.entity) refs.push(a.entity);
    if (a.do === 'speed' && a.target !== 'player') refs.push(a.target);
  }
  return refs;
}

export interface Stats {
  score: number;
  lives: number;
  time: number;
  level: number;
}

export const conditionsHold = (conds: Condition[], s: Stats): boolean =>
  conds.every((c) => (c.op === '>=' ? s[c.stat] >= c.value : c.op === '<=' ? s[c.stat] <= c.value : s[c.stat] === c.value));

/** Plain-English sentence for a rule, shown in the builder and the debugger. */
export function describeRule(r: Pick<Rule, 'when' | 'if' | 'then'>, names: Record<string, string> = {}): string {
  const n = (id: string) => names[id] ?? id;
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  const when: Record<Trigger['on'], () => string> = {
    start: () => 'When the level starts',
    time: () => `After ${plural((r.when as { seconds: number }).seconds, 'second')}`,
    every: () => `Every ${plural((r.when as { seconds: number }).seconds, 'second')}`,
    score: () => `When the score reaches ${(r.when as { atLeast: number }).atLeast}`,
    lives: () => `When lives drop to ${(r.when as { atMost: number }).atMost}`,
    touch: () => `When the player touches ${n((r.when as { entity: string }).entity)}`,
    collect: () => `After touching ${n((r.when as { entity: string }).entity)} ${plural((r.when as { count: number }).count, 'time')}`,
  };
  const act = (a: Action): string => {
    switch (a.do) {
      case 'spawn':
        return `spawn ${a.count} ${n(a.entity)}`;
      case 'score':
        return `${a.amount >= 0 ? 'add' : 'remove'} ${plural(Math.abs(a.amount), 'point')}`;
      case 'lives':
        return `${a.amount >= 0 ? 'give' : 'take'} ${plural(Math.abs(a.amount), 'life').replace('lifes', 'lives')}`;
      case 'speed':
        return `make ${a.target === 'player' ? 'the player' : n(a.target)} ${a.factor >= 1 ? `${a.factor}x faster` : `${Math.round(a.factor * 100)}% speed`}`;
      case 'spawnRate':
        return `spawn ${n(a.entity)} ${a.factor >= 1 ? `${a.factor}x as often` : `${Math.round(a.factor * 100)}% as often`}`;
      case 'clear':
        return a.entity ? `clear every ${n(a.entity)}` : 'clear the screen';
      case 'message':
        return `show "${a.text}"`;
      case 'sound':
        return `play the ${a.name} sound`;
      case 'win':
        return 'win the level';
      case 'lose':
        return 'lose the game';
    }
  };
  const cond = r.if.length ? `, if ${r.if.map((c) => `${c.stat} ${c.op === '==' ? 'is' : c.op === '>=' ? 'is at least' : 'is at most'} ${c.value}`).join(' and ')}` : '';
  const acts = r.then.map(act);
  const list = acts.length > 1 ? `${acts.slice(0, -1).join(', ')} and ${acts.at(-1)}` : acts[0];
  return `${when[r.when.on]()}${cond}: ${list}.`;
}
