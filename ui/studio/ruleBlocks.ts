import { SOUNDS, STATS, type Action, type Condition, type Rule, type Trigger } from '../../spec/rules';
import { h } from '../modal';

/** Options the block editors need: the game's entities (id + display name). */
export interface BlockContext {
  entities: { id: string; name: string }[];
  /** Called after any edit so the dialog can re-validate and refresh the sentence. */
  changed(): void;
  /** Called after structural edits (block added/removed, type changed) that need a re-render. */
  rebuild(): void;
}

export const TRIGGERS: { on: Trigger['on']; label: string }[] = [
  { on: 'start', label: 'Level starts' },
  { on: 'time', label: 'After N seconds' },
  { on: 'every', label: 'Every N seconds' },
  { on: 'score', label: 'Score reaches' },
  { on: 'lives', label: 'Lives drop to' },
  { on: 'touch', label: 'Player touches' },
  { on: 'collect', label: 'Player touches N times' },
];

export const ACTIONS: { do: Action['do']; label: string }[] = [
  { do: 'spawn', label: 'Spawn' },
  { do: 'score', label: 'Change score' },
  { do: 'lives', label: 'Change lives' },
  { do: 'speed', label: 'Change speed' },
  { do: 'spawnRate', label: 'Change spawn rate' },
  { do: 'clear', label: 'Clear entities' },
  { do: 'message', label: 'Show message' },
  { do: 'sound', label: 'Play sound' },
  { do: 'win', label: 'Win the level' },
  { do: 'lose', label: 'Lose the game' },
];

export function defaultTrigger(on: Trigger['on'], entity: string): Trigger {
  switch (on) {
    case 'start':
      return { on };
    case 'time':
      return { on, seconds: 30 };
    case 'every':
      return { on, seconds: 15 };
    case 'score':
      return { on, atLeast: 20 };
    case 'lives':
      return { on, atMost: 1 };
    case 'touch':
      return { on, entity };
    case 'collect':
      return { on, entity, count: 5 };
  }
}

export function defaultAction(kind: Action['do'], entity: string): Action {
  switch (kind) {
    case 'spawn':
      return { do: kind, entity, count: 1 };
    case 'score':
      return { do: kind, amount: 5 };
    case 'lives':
      return { do: kind, amount: 1 };
    case 'speed':
      return { do: kind, target: entity, factor: 1.2 };
    case 'spawnRate':
      return { do: kind, entity, factor: 1.5 };
    case 'clear':
      return { do: kind, entity };
    case 'message':
      return { do: kind, text: 'Watch out!' };
    case 'sound':
      return { do: kind, name: 'pop' };
    case 'win':
    case 'lose':
      return { do: kind };
  }
}

const select = (label: string, options: [string, string][], value: string, set: (v: string) => void) => {
  const el = h('select', { attrs: { 'aria-label': label } }, ...options.map(([v, text]) => new Option(text, v, false, v === value)));
  el.addEventListener('change', () => set(el.value));
  return el;
};

const number = (label: string, value: number, min: number, max: number, step: number, set: (n: number) => void) => {
  const el = h('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), attrs: { 'aria-label': label } });
  el.addEventListener('input', () => {
    const n = Number(el.value);
    if (el.value !== '' && Number.isFinite(n)) set(n);
  });
  return el;
};

const removeBtn = (label: string, run: () => void) => {
  const b = h('button', { type: 'button', class: 'icon-only block-remove', textContent: '×', attrs: { 'aria-label': label } });
  b.addEventListener('click', run);
  return b;
};

/** The three blocks of one rule: WHEN (trigger), IF (conditions) and THEN (actions). Edits mutate `rule`. */
export function ruleBlocks(rule: Rule, ctx: BlockContext): HTMLElement {
  const ents: [string, string][] = ctx.entities.map((e) => [e.id, e.name]);
  const first = ctx.entities[0]?.id ?? '';
  const ok = () => ctx.changed();
  const rebuild = () => ctx.rebuild();

  // WHEN
  const w = rule.when as Record<string, unknown> & Trigger;
  const whenParams: HTMLElement[] = [];
  if ('seconds' in w) whenParams.push(number('Seconds', w.seconds as number, w.on === 'every' ? 2 : 1, 600, 1, (n) => ((w.seconds = n), ok())), h('span', { textContent: 'seconds' }));
  if ('atLeast' in w) whenParams.push(number('Score', w.atLeast as number, 1, 10000, 1, (n) => ((w.atLeast = n), ok())), h('span', { textContent: 'points' }));
  if ('atMost' in w) whenParams.push(number('Lives', w.atMost as number, 1, 8, 1, (n) => ((w.atMost = n), ok())), h('span', { textContent: 'lives' }));
  if ('entity' in w) whenParams.push(select('Entity', ents, w.entity as string, (v) => ((w.entity = v), ok())));
  if ('count' in w) whenParams.push(number('Times', w.count as number, 2, 100, 1, (n) => ((w.count = n), ok())), h('span', { textContent: 'times' }));
  const when = h(
    'div',
    { class: 'block block-when' },
    h('span', { class: 'block-tag', textContent: 'When' }),
    select('Trigger', TRIGGERS.map((t) => [t.on, t.label]), w.on, (v) => ((rule.when = defaultTrigger(v as Trigger['on'], first)), rebuild())),
    ...whenParams,
  );

  // IF
  const conds = rule.if.map((c: Condition, i) =>
    h(
      'div',
      { class: 'block-row' },
      select('Stat', STATS.map((s) => [s, s]), c.stat, (v) => ((c.stat = v as Condition['stat']), ok())),
      select('Comparison', [['>=', 'at least'], ['<=', 'at most'], ['==', 'exactly']], c.op, (v) => ((c.op = v as Condition['op']), ok())),
      number('Value', c.value, 0, 10000, 1, (n) => ((c.value = n), ok())),
      removeBtn(`Remove condition ${i + 1}`, () => (rule.if.splice(i, 1), rebuild())),
    ),
  );
  const addCond = h('button', { type: 'button', class: 'ghost block-add', textContent: '+ Condition', disabled: rule.if.length >= 3 });
  addCond.addEventListener('click', () => (rule.if.push({ stat: 'score', op: '>=', value: 10 }), rebuild()));
  const iff = h('div', { class: 'block block-if' }, h('span', { class: 'block-tag', textContent: 'If' }), ...(conds.length ? conds : [h('span', { class: 'block-hint', textContent: 'always' })]), addCond);

  // THEN
  const acts = rule.then.map((a, i) => {
    const params: HTMLElement[] = [];
    const ax = a as Record<string, unknown> & Action;
    if (a.do === 'spawn') params.push(number('Count', a.count, 1, 5, 1, (n) => ((ax.count = n), ok())), select('Entity', ents, a.entity, (v) => ((ax.entity = v), ok())));
    if (a.do === 'score' || a.do === 'lives') params.push(number('Amount', a.amount, a.do === 'score' ? -100 : -3, a.do === 'score' ? 100 : 3, 1, (n) => ((ax.amount = n), ok())));
    if (a.do === 'speed') params.push(select('Target', [['player', 'Player'], ...ents], a.target, (v) => ((ax.target = v), ok())), h('span', { textContent: '×' }), number('Factor', a.factor, 0.25, 3, 0.05, (n) => ((ax.factor = n), ok())));
    if (a.do === 'spawnRate') params.push(select('Entity', ents, a.entity, (v) => ((ax.entity = v), ok())), h('span', { textContent: '×' }), number('Factor', a.factor, 0.25, 4, 0.05, (n) => ((ax.factor = n), ok())));
    if (a.do === 'clear') params.push(select('Entity', [['', 'Everything'], ...ents], a.entity ?? '', (v) => ((ax.entity = v || undefined), ok())));
    if (a.do === 'message') {
      const t = h('input', { type: 'text', value: a.text, maxLength: 60, attrs: { 'aria-label': 'Message text' } });
      t.addEventListener('input', () => ((ax.text = t.value), ok()));
      params.push(t);
    }
    if (a.do === 'sound') params.push(select('Sound', SOUNDS.map((s) => [s, s]), a.name, (v) => ((ax.name = v), ok())));
    return h(
      'div',
      { class: 'block-row' },
      select(`Action ${i + 1}`, ACTIONS.map((x) => [x.do, x.label]), a.do, (v) => ((rule.then[i] = defaultAction(v as Action['do'], first)), rebuild())),
      ...params,
      rule.then.length > 1 ? removeBtn(`Remove action ${i + 1}`, () => (rule.then.splice(i, 1), rebuild())) : '',
    );
  });
  const addAct = h('button', { type: 'button', class: 'ghost block-add', textContent: '+ Action', disabled: rule.then.length >= 5 });
  addAct.addEventListener('click', () => (rule.then.push(defaultAction('message', first)), rebuild()));
  const then = h('div', { class: 'block block-then' }, h('span', { class: 'block-tag', textContent: 'Then' }), ...acts, addAct);

  return h('div', { class: 'rule-blocks' }, when, iff, then);
}
