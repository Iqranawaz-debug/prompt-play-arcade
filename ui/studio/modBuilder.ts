import { MUSIC_STYLES } from '../../spec/schema';
import { PALETTES, describeOp, type ModOp } from '../../spec/mods';
import { h } from '../modal';

type OpKind = ModOp['op'];
/** Operations the form can create (rule bundles come from AI or imported files and are shown read-only). */
export const OP_KINDS: { op: Exclude<OpKind, 'addRules'>; label: string }[] = [
  { op: 'playerSpeed', label: 'Player speed' },
  { op: 'entitySpeed', label: 'Entity speed' },
  { op: 'spawnRate', label: 'Spawn rate' },
  { op: 'lives', label: 'Lives' },
  { op: 'spriteScale', label: 'Sprite size' },
  { op: 'theme', label: 'Colour palette' },
  { op: 'gravity', label: 'Gravity' },
  { op: 'removeHazards', label: 'Remove hazards' },
  { op: 'timeLimit', label: 'Clock length' },
  { op: 'scoreTarget', label: 'Score target' },
  { op: 'music', label: 'Music' },
];

export function defaultOp(op: Exclude<OpKind, 'addRules'>): ModOp {
  switch (op) {
    case 'playerSpeed':
    case 'gravity':
    case 'timeLimit':
    case 'scoreTarget':
      return { op, factor: op === 'gravity' ? 0.5 : 1.25 };
    case 'entitySpeed':
    case 'spawnRate':
      return { op, who: 'all', factor: 1.25 };
    case 'lives':
      return { op, set: 5 };
    case 'spriteScale':
      return { op, who: 'all', factor: 1.25 };
    case 'theme':
      return { op, palette: 'neon' };
    case 'removeHazards':
      return { op };
    case 'music':
      return { op, style: 'upbeat' };
  }
}

const sel = (label: string, opts: readonly (readonly [string, string])[], value: string, set: (v: string) => void) => {
  const el = h('select', { attrs: { 'aria-label': label } }, ...opts.map(([v, t]) => new Option(t, v, false, v === value)));
  el.addEventListener('change', () => set(el.value));
  return el;
};
const num = (label: string, value: number, min: number, max: number, step: number, set: (n: number) => void) => {
  const el = h('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), attrs: { 'aria-label': label } });
  el.addEventListener('input', () => el.value !== '' && Number.isFinite(Number(el.value)) && set(Number(el.value)));
  return el;
};
const WHO = [['all', 'Everything'], ['hazards', 'Hazards'], ['rewards', 'Rewards']] as const;

/** Editable rows for a mod's operations. `changed` after value edits; `rebuild` after structural ones. */
export function opRows(ops: ModOp[], changed: () => void, rebuild: () => void): HTMLElement {
  const rows = ops.map((op, i) => {
    const o = op as Record<string, unknown> & ModOp;
    const set = (k: string) => (v: unknown) => ((o[k] = v), changed());
    const params: HTMLElement[] = [];
    if (op.op === 'addRules') params.push(h('span', { class: 'block-hint', textContent: describeOp(op) }));
    if ('who' in op) params.push(sel('Applies to', op.op === 'spriteScale' ? [['player', 'Player'], ...WHO] : WHO, op.who, set('who')));
    if ('factor' in op) {
      const [min, max] = op.op === 'spawnRate' ? [0.25, 4] : op.op === 'spriteScale' ? [0.5, 2] : op.op === 'gravity' ? [0.25, 2] : op.op === 'timeLimit' ? [0.5, 3] : [0.25, 3];
      params.push(h('span', { textContent: '×' }), num('Factor', op.factor, min, max, 0.05, set('factor')));
    }
    if (op.op === 'lives') params.push(num('Lives', op.set, 1, 9, 1, set('set')));
    if (op.op === 'theme') params.push(sel('Palette', PALETTES.map((p) => [p, p[0].toUpperCase() + p.slice(1)] as const), op.palette, set('palette')));
    if (op.op === 'music') params.push(sel('Music style', MUSIC_STYLES.map((m) => [m, m] as const), op.style, set('style')));
    const kind =
      op.op === 'addRules'
        ? h('strong', { class: 'op-kind', textContent: 'Rules' })
        : sel(`Operation ${i + 1}`, OP_KINDS.map((k) => [k.op, k.label] as const), op.op, (v) => ((ops[i] = defaultOp(v as Exclude<OpKind, 'addRules'>)), rebuild()));
    const rm = h('button', { type: 'button', class: 'icon-only block-remove', textContent: '×', attrs: { 'aria-label': `Remove operation ${i + 1}` } });
    rm.addEventListener('click', () => (ops.splice(i, 1), rebuild()));
    return h('div', { class: 'block-row' }, kind, ...params, rm);
  });
  const add = h('button', { type: 'button', class: 'ghost block-add', textContent: '+ Operation', disabled: ops.length >= 12 });
  add.addEventListener('click', () => (ops.push(defaultOp('playerSpeed')), rebuild()));
  return h('div', { class: 'block block-then op-block' }, h('span', { class: 'block-tag', textContent: 'Changes' }), ...rows, add);
}
