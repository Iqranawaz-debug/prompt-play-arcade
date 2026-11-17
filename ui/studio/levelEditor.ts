import { GameSpecSchema, formatIssues, levelsOf, type GameSpec } from '../../spec/schema';
import { parseLevel } from '../../spec/level';
import { startTile, unreachable, type Mobility, type Tile } from '../../spec/reach';
import { WORLD_STYLES, generateLevel, type Density, type WorldStyle } from '../../spec/worldgen';
import { h } from '../modal';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';
import { drawLevel, fromMap, tileAt, toMap, type EditLevel } from './tileCanvas';

type Tool = 'wall' | 'erase' | 'start';
const TOOLS: { id: Tool; name: string }[] = [
  { id: 'wall', name: 'Wall' },
  { id: 'erase', name: 'Erase' },
  { id: 'start', name: 'Start' },
];
const MAX_LEVELS = 8;

/** Extra panels (e.g. the AI Level Designer) can add levels through this. */
export interface LevelEditorApi {
  spec(): GameSpec;
  mobility(): Mobility;
  addLevels(levels: { name?: string; tileSize: number; map: string[] }[]): void;
}

const segmented = <T extends string>(label: string, items: { id: T; name: string }[], value: T, pick: (v: T) => void) =>
  h(
    'div',
    { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': label } },
    ...items.map((it) => {
      const b = h('button', { type: 'button', textContent: it.name, attrs: { role: 'radio', 'aria-checked': String(it.id === value) } });
      b.addEventListener('click', () => pick(it.id));
      return b;
    }),
  );

/** Level Editor: paint tile maps, manage a list of levels, and generate layouts procedurally. */
export function createLevelEditor(host: HTMLElement, ctx: StudioContext, extraPanel?: (api: LevelEditorApi) => HTMLElement) {
  const d = createToolDialog(host);
  let draft: GameSpec;
  let levels: EditLevel[] = [];
  let index = 0;
  let tool: Tool = 'wall';
  let cursor: Tile | undefined;
  let original = '';
  let style: WorldStyle = 'arena';
  let density: Density = 'normal';
  let seed = 1;

  const mobility = (): Mobility => ({
    platformer: draft.player.controls === 'platformer',
    speed: draft.player.speed,
    jump: draft.physics?.jump ?? 0,
    gravity: draft.physics?.gravity ?? 0,
  });
  const lostTiles = (level: EditLevel): Tile[] => {
    const grid = parseLevel({ tileSize: level.tileSize, map: toMap(level) });
    const m = mobility();
    if (m.platformer && m.gravity < 200) return [];
    return unreachable(grid, startTile(grid, draft.player.start, m.platformer), m);
  };
  const serialize = () => JSON.stringify(levels.map((l) => ({ ...l, map: toMap(l), walls: undefined })));

  const canvas = h('canvas', { class: 'level-canvas', tabIndex: 0, attrs: { role: 'img', 'aria-label': 'Level map. Arrow keys move the cursor, Space paints with the current tool.' } });
  const reach = h('p', { class: 'physics-readout', attrs: { 'aria-live': 'polite' } });
  let save: HTMLButtonElement | undefined;

  /** Redraw the map and the reachability note (cheap; runs on every brush stroke). */
  const paint = () => {
    const level = levels[index];
    if (!level) return;
    const lost = lostTiles(level);
    drawLevel(canvas, level, draft.theme, lost, document.activeElement === canvas ? cursor : undefined);
    reach.textContent = lost.length
      ? `${lost.length} ${mobility().platformer ? 'standing spot' : 'tile'}${lost.length === 1 ? '' : 's'} can't be reached (red). Move ledges closer or open a gap.`
      : 'Every area is reachable.';
    reach.className = `physics-readout ${lost.length ? 'warn' : 'ok'}`;
    if (save) {
      const changed = serialize() !== original;
      save.disabled = !changed;
      save.textContent = changed ? 'Save levels' : 'No changes yet';
    }
  };

  const apply = (t: Tile) => {
    const level = levels[index];
    if (tool === 'start') {
      level.start = t;
      level.walls[t.row][t.col] = false;
    } else {
      level.walls[t.row][t.col] = tool === 'wall';
      if (tool === 'wall' && level.start?.col === t.col && level.start.row === t.row) level.start = undefined;
    }
    paint();
  };

  let painting = false;
  canvas.addEventListener('pointerdown', (e) => {
    const t = levels[index] && tileAt(canvas, levels[index], e);
    if (!t) return;
    painting = tool !== 'start';
    canvas.setPointerCapture(e.pointerId);
    cursor = t;
    apply(t);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const t = tileAt(canvas, levels[index], e);
    if (t) apply(t);
  });
  canvas.addEventListener('pointerup', () => (painting = false));
  canvas.addEventListener('focus', () => paint());
  canvas.addEventListener('blur', () => paint());
  canvas.addEventListener('keydown', (e) => {
    const level = levels[index];
    if (!level) return;
    const c = cursor ?? { col: 0, row: 0 };
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[e.key]) {
      e.preventDefault();
      cursor = {
        col: Math.max(0, Math.min(level.walls[0].length - 1, c.col + move[e.key][0])),
        row: Math.max(0, Math.min(level.walls.length - 1, c.row + move[e.key][1])),
      };
      paint();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cursor = c;
      apply(c);
    }
  });

  const generate = (into: number) => {
    const g = generateLevel({ style, density, seed, mobility: mobility() });
    const level = fromMap(g, g.name);
    if (into < levels.length) levels[into] = { ...level, name: levels[into].name || g.name };
    else levels.push(level);
    index = into;
    seed = Math.floor(Math.random() * 1e6);
    render();
  };

  /** Walls matter less when the player is locked to one axis; say so instead of silently allowing odd layouts. */
  const oneAxisHint = () => {
    const c = draft.player.controls;
    return c === 'horizontal' || c === 'vertical'
      ? h('p', {
          class: 'physics-readout',
          textContent: `The player only moves ${c === 'horizontal' ? 'left and right' : 'up and down'}, so walls mostly shape where hazards travel. For mazes, switch movement to Free in Physics Settings.`,
        })
      : '';
  };

  const render = () => {
    const platformer = mobility().platformer;
    const styles = WORLD_STYLES.filter((s) => s.platformer === platformer);
    if (!styles.some((s) => s.id === style)) style = styles[0].id;
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });

    const tabs = h(
      'div',
      { class: 'level-tabs', attrs: { role: 'tablist', 'aria-label': 'Levels' } },
      ...levels.map((l, i) => {
        const b = h('button', { type: 'button', class: 'level-tab', textContent: `${i + 1}. ${l.name}`, attrs: { role: 'tab', 'aria-selected': String(i === index) } });
        b.addEventListener('click', () => {
          index = i;
          render();
        });
        return b;
      }),
    );
    const add = h('button', { type: 'button', class: 'ghost', textContent: '+ Add level', disabled: levels.length >= MAX_LEVELS });
    add.addEventListener('click', () => generate(levels.length));
    tabs.append(add);

    const level = levels[index];
    const levelTools = h('div', { class: 'tool-actions level-actions' });
    if (level) {
      const name = h('input', { type: 'text', value: level.name, maxLength: 40, attrs: { 'aria-label': 'Level name' } });
      name.addEventListener('change', () => {
        level.name = name.value.trim() || `Level ${index + 1}`;
        render();
      });
      const btn = (label: string, run: () => void, disabled = false) => {
        const b = h('button', { type: 'button', class: 'ghost', textContent: label, disabled });
        b.addEventListener('click', () => {
          run();
          render();
        });
        return b;
      };
      levelTools.append(
        name,
        btn('Move left', () => ([levels[index - 1], levels[index]] = [levels[index], levels[index - 1]], index--), index === 0),
        btn('Move right', () => ([levels[index + 1], levels[index]] = [levels[index], levels[index + 1]], index++), index === levels.length - 1),
        btn('Duplicate', () => (levels.splice(index + 1, 0, structuredClone({ ...level, name: `${level.name} copy`.slice(0, 40) })), index++), levels.length >= MAX_LEVELS),
        btn('Clear', () => level.walls.forEach((row) => row.fill(false))),
        btn('Delete', () => (levels.splice(index, 1), (index = Math.max(0, index - 1)))),
      );
    }

    const genPanel = h(
      'div',
      { class: 'gen-panel' },
      h('label', { class: 'tool-field' }, h('span', { textContent: 'Style' }), segmented('World style', styles.map((s) => ({ id: s.id, name: s.name })), style, (v) => ((style = v), render()))),
      h('label', { class: 'tool-field' }, h('span', { textContent: 'Density' }), segmented('Density', [{ id: 'sparse', name: 'Sparse' }, { id: 'normal', name: 'Normal' }, { id: 'dense', name: 'Dense' }], density, (v) => ((density = v), render()))),
    );
    const seedInput = h('input', { type: 'number', min: '0', max: '999999', value: String(seed), attrs: { 'aria-label': 'Seed' } });
    seedInput.addEventListener('change', () => (seed = Math.max(0, Math.floor(Number(seedInput.value) || 0))));
    const genBtn = h('button', { type: 'button', class: 'primary', textContent: level ? 'Regenerate this level' : 'Generate a level' });
    genBtn.addEventListener('click', () => generate(level ? index : 0));
    genPanel.append(h('div', { class: 'redraw-row' }, h('label', { class: 'tool-field seed-field' }, h('span', { textContent: 'Seed' }), seedInput), genBtn));

    d.body.replaceChildren(
      h('section', { class: 'sb-section' }, h('h3', { textContent: `Levels (${levels.length}/${MAX_LEVELS})` }), tabs, levelTools),
      level
        ? h('section', { class: 'sb-section' }, h('div', { class: 'level-toolbar' }, segmented('Brush', TOOLS, tool, (v) => ((tool = v), render())), reach), canvas)
        : h('p', { class: 'physics-readout', textContent: 'This game has no level map yet: everything happens on an open field. Generate one below, or design levels with AI.' }),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Procedural generator' }), genPanel, oneAxisHint()),
      extraPanel ? extraPanel(api) : '',
      err,
    );
    paint();

    save = h('button', { type: 'button', class: 'primary' });
    save.addEventListener('click', async () => {
      const next = structuredClone(draft);
      const out = levels.map((l) => ({ name: l.name, tileSize: l.tileSize, map: toMap(l) }));
      next.level = out.length === 1 ? out[0] : undefined;
      next.levels = out.length > 1 ? out : undefined;
      if (!out.length) for (const s of next.spawns) if (s.edge === 'platforms') s.edge = 'anywhere';
      const result = GameSpecSchema.safeParse(next);
      if (!result.success) {
        err.textContent = formatIssues(result.error);
        return;
      }
      d.modal.close();
      await ctx.applyVersion(result.data, `Levels: ${out.length ? out.map((l) => l.name).join(', ') : 'none'}`.slice(0, 160));
    });
    d.footer.replaceChildren(save);
    paint();
  };

  const api: LevelEditorApi = {
    spec: () => draft,
    mobility,
    addLevels(list) {
      for (const l of list) if (levels.length < MAX_LEVELS) levels.push(fromMap(l, `Level ${levels.length + 1}`));
      index = Math.max(0, levels.length - list.length);
      render();
    },
  };

  return {
    open() {
      const game = ctx.current();
      if (!game) return;
      draft = structuredClone(game.spec);
      levels = levelsOf(draft).map((l, i) => fromMap(l, `Level ${i + 1}`));
      original = serialize();
      index = 0;
      cursor = undefined;
      tool = 'wall';
      seed = Math.floor(Math.random() * 1e6);
      d.setTitle(`Level Editor: ${game.title}`, 'Paint walls, order levels, generate layouts; saves as a new version');
      render();
      d.modal.open();
    },
  };
}
