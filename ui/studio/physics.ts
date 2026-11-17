import { GameSpecSchema, MIN_JUMP_TILES, formatIssues, type GameSpec } from '../../spec/schema';
import { DEFAULT_TILE, PLATFORMER_PHYSICS, jumpHeight, parseLevel } from '../../spec/level';
import { makePlatformer } from '../../spec/platformer';
import { h } from '../modal';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';

type Mode = GameSpec['player']['controls'];
const MODES: { id: Mode; name: string; hint: string }[] = [
  { id: 'free', name: 'Free', hint: 'Move in all directions' },
  { id: 'horizontal', name: 'Horizontal', hint: 'Left and right only' },
  { id: 'vertical', name: 'Vertical', hint: 'Up and down only' },
  { id: 'platformer', name: 'Platformer', hint: 'Run and jump with gravity' },
];

/** A small picture of the level's tile map. */
function mapPreview(spec: GameSpec): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'map-preview', attrs: { 'aria-label': 'Level preview', role: 'img' } });
  canvas.width = 480;
  canvas.height = 248;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = spec.theme.background;
  ctx.fillRect(0, 0, 480, 248);
  if (!spec.level) return canvas;
  const g = parseLevel(spec.level);
  const s = g.tile / 2;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!g.walls[r][c]) continue;
      ctx.fillStyle = spec.theme.primary;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(c * s, r * s, s - 1, s - 1);
      ctx.globalAlpha = 1;
      if (r === 0 || !g.walls[r - 1][c]) ctx.fillRect(c * s, r * s, s - 1, 2);
    }
  }
  if (g.start) {
    ctx.fillStyle = spec.theme.accent;
    ctx.beginPath();
    ctx.arc(g.start.col * s + s / 2, g.start.row * s + s / 2, s / 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** Physics Settings: movement mode, speed, gravity, jump and friction, with a one-click platformer preset. */
export function createPhysicsSettings(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  let draft: GameSpec;
  let original = '';

  const slider = (label: string, value: number, min: number, max: number, step: number, apply: (n: number) => void, disabled = false) => {
    const out = h('output', { textContent: String(value) });
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), disabled, attrs: { 'aria-label': label } });
    input.addEventListener('input', () => {
      out.textContent = input.value;
      apply(Number(input.value));
      readout();
    });
    input.addEventListener('change', () => render());
    return h('label', { class: 'physics-row' }, h('span', { textContent: label }), input, out);
  };

  let readout = () => {};

  const render = () => {
    const p = draft.physics ?? { gravity: 0, jump: 0, friction: 0 };
    const platformer = draft.player.controls === 'platformer';
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });

    const modes = h(
      'div',
      { class: 'music-grid mode-grid', attrs: { role: 'radiogroup', 'aria-label': 'Movement' } },
      ...MODES.map((m) => {
        const b = h('button', { type: 'button', class: `music-pick mode-pick${m.id === draft.player.controls ? ' on' : ''}`, attrs: { role: 'radio', 'aria-checked': String(m.id === draft.player.controls) } }, h('strong', { textContent: m.name }), h('span', { textContent: m.hint }));
        b.addEventListener('click', () => {
          if (m.id === 'platformer' && !platformer) {
            draft = makePlatformer(draft);
          } else {
            draft.player.controls = m.id;
          }
          render();
        });
        return h('div', { class: `music-card${m.id === draft.player.controls ? ' on' : ''}` }, b);
      }),
    );

    const jumpInfo = h('p', { class: 'physics-readout', attrs: { 'aria-live': 'polite' } });
    readout = () => {
      if (draft.player.controls !== 'platformer') {
        jumpInfo.textContent = 'Gravity and jump apply to platformer movement.';
        jumpInfo.className = 'physics-readout';
        return;
      }
      const q = draft.physics ?? p;
      const tile = draft.level?.tileSize ?? DEFAULT_TILE;
      const height = jumpHeight(q.jump, q.gravity);
      const ok = q.gravity >= 200 && height >= MIN_JUMP_TILES * tile;
      jumpInfo.textContent = q.gravity < 200 ? 'Gravity must be at least 200 for a platformer.' : `Jump height ${Math.round(height)}px (${(height / tile).toFixed(1)} tiles)${ok ? '' : ` - needs ${MIN_JUMP_TILES} tiles`}`;
      jumpInfo.className = `physics-readout${ok ? ' ok' : ' warn'}`;
    };
    readout();

    const setPhysics = (key: 'gravity' | 'jump' | 'friction') => (n: number) => {
      draft.physics = { ...(draft.physics ?? { gravity: 0, jump: 0, friction: 0 }), [key]: n };
    };

    const levelTools = h('div', { class: 'tool-actions' });
    if (draft.level) {
      const remove = h('button', { type: 'button', class: 'ghost', textContent: 'Remove level map' });
      remove.addEventListener('click', () => {
        draft.level = undefined;
        for (const s of draft.spawns) if (s.edge === 'platforms') s.edge = 'anywhere';
        render();
      });
      levelTools.append(remove);
    } else if (platformer) {
      const add = h('button', { type: 'button', textContent: 'Add starter ledges' });
      add.addEventListener('click', () => {
        draft = makePlatformer(draft);
        render();
      });
      levelTools.append(add);
    }

    const reset = h('button', { type: 'button', class: 'ghost', textContent: 'Reset to platformer defaults', disabled: !platformer });
    reset.addEventListener('click', () => {
      draft.physics = { ...PLATFORMER_PHYSICS };
      render();
    });

    d.body.replaceChildren(
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Movement' }), modes, slider('Player speed', draft.player.speed, 40, 700, 10, (n) => (draft.player.speed = n))),
      h(
        'section',
        { class: 'sb-section' },
        h('h3', { textContent: 'Physics' }),
        slider('Gravity', p.gravity, 0, 2000, 50, setPhysics('gravity'), !platformer),
        slider('Jump', p.jump, 0, 1200, 10, setPhysics('jump'), !platformer),
        slider('Friction', p.friction, 0, 0.95, 0.05, setPhysics('friction'), !platformer),
        jumpInfo,
        h('div', { class: 'tool-actions' }, reset),
      ),
      h('section', { class: 'sb-section' }, h('h3', { textContent: draft.level ? 'Level' : 'Level (none)' }), mapPreview(draft), levelTools),
      err,
    );

    const changed = JSON.stringify(draft) !== original;
    const save = h('button', { type: 'button', class: 'primary', textContent: changed ? 'Save physics' : 'No changes yet', disabled: !changed });
    save.addEventListener('click', async () => {
      const result = GameSpecSchema.safeParse(draft);
      if (!result.success) {
        err.textContent = formatIssues(result.error);
        return;
      }
      d.modal.close();
      const what = result.data.player.controls === 'platformer' ? `platformer, gravity ${result.data.physics?.gravity}, jump ${result.data.physics?.jump}` : `${result.data.player.controls} movement`;
      await ctx.applyVersion(result.data, `Physics: ${what}`);
    });
    d.footer.replaceChildren(save);
  };

  return {
    open() {
      const game = ctx.current();
      if (!game) return;
      draft = structuredClone(game.spec);
      original = JSON.stringify(draft);
      d.setTitle(`Physics Settings: ${game.title}`, 'Movement, gravity and jumping; changes save as a new version');
      render();
      d.modal.open();
    },
  };
}
