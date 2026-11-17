import { GameSpecSchema, IDLE_MOTIONS, MOVE_MOTIONS, SpriteSchema, formatIssues, type GameSpec } from '../../spec/schema';
import { frameAt, pose } from '../../engine/pose';
import { fetchFrames } from '../api';
import { spriteUrl } from '../cover';
import { h } from '../modal';
import { notify } from '../notifications';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';

type Sprite = GameSpec['sprites'][string];
type Anim = NonNullable<Sprite['anim']>;
const NAMES: Record<string, string> = { none: 'None', bob: 'Bob', pulse: 'Pulse', spin: 'Spin', sway: 'Sway', wobble: 'Wobble', tilt: 'Tilt', squash: 'Squash' };
const DEFAULT_ANIM: Anim = { idle: 'none', move: 'none', speed: 1 };

/** Animation Studio: idle/move motions, speed, frame-by-frame animation with AI-drawn frames, and a live preview. */
export function createAnimationStudio(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  let draft: GameSpec;
  let selected = '';
  let moving = false;
  let raf = 0;
  const changes = new Set<string>();
  let stage: { img: HTMLImageElement; sprite: Sprite; urls: string[]; frame: number } | undefined;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!stage) return;
    const t = now / 1000;
    const { img, sprite, urls } = stage;
    const frame = frameAt(sprite, t);
    if (frame !== stage.frame) {
      img.src = urls[frame];
      stage.frame = frame;
    }
    // Moving preview drifts back and forth, so tilt and facing show both ways.
    const vx = moving ? Math.sign(Math.sin(t * 0.8)) * 200 : 0;
    const p = pose(sprite.anim, t, vx, 0);
    const flip = sprite.faces !== 'none' && vx !== 0 && (sprite.faces === 'left' ? vx > 0 : vx < 0);
    const rot = flip ? -p.rotation : p.rotation;
    img.style.transform = `translate(${p.dx * 3}px, ${p.dy * 3}px) rotate(${rot}rad) scale(${p.sx * (flip ? -1 : 1)}, ${p.sy})`;
  };

  d.modal.close = ((close) => (opts?: { restoreFocus?: boolean }) => {
    cancelAnimationFrame(raf);
    stage = undefined;
    close(opts);
  })(d.modal.close.bind(d.modal));

  const render = () => {
    const ids = Object.keys(draft.sprites);
    if (!ids.includes(selected)) selected = ids[0];
    const s = draft.sprites[selected];
    const anim = s.anim ?? DEFAULT_ANIM;
    const bg = draft.theme.background;
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
    const update = (next: Partial<Sprite>, what: string, redraw = true) => {
      draft.sprites[selected] = { ...draft.sprites[selected], ...next };
      changes.add(`${selected} ${what}`);
      if (redraw) render();
      else if (stage) stage.sprite = draft.sprites[selected];
    };
    const setAnim = (patch: Partial<Anim>, what: string, redraw = true) => update({ anim: { ...(draft.sprites[selected].anim ?? DEFAULT_ANIM), ...patch } }, what, redraw);

    const grid = h(
      'div',
      { class: 'asset-grid', attrs: { role: 'listbox', 'aria-label': 'Sprites' } },
      ...ids.map((id) => {
        const sp = draft.sprites[id];
        const tag = [sp.anim?.idle !== undefined && sp.anim.idle !== 'none' ? NAMES[sp.anim.idle] : '', sp.anim?.move && sp.anim.move !== 'none' ? NAMES[sp.anim.move] : '', sp.frames?.length ? `${sp.frames.length + 1} frames` : ''].filter(Boolean).join(' · ') || 'Still';
        const b = h('button', { type: 'button', class: `asset-tile${id === selected ? ' on' : ''}`, attrs: { role: 'option', 'aria-selected': String(id === selected) } }, h('span', { class: 'asset-thumb', attrs: { style: `background:${bg}` } }, h('img', { src: spriteUrl(sp), alt: '' })), h('strong', { textContent: id }), h('span', { textContent: tag }));
        b.addEventListener('click', () => {
          selected = id;
          render();
        });
        return b;
      }),
    );

    const select = (label: string, options: readonly string[], value: string, apply: (v: string) => void) => {
      const el = h('select', { attrs: { 'aria-label': label } }, ...options.map((o) => new Option(NAMES[o], o, false, o === value)));
      el.addEventListener('change', () => apply(el.value));
      return h('label', { class: 'tool-field' }, h('span', { textContent: label }), el);
    };
    const range = (label: string, value: number, min: number, max: number, step: number, apply: (n: number) => void) => {
      const out = h('output', { textContent: String(value) });
      const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), attrs: { 'aria-label': label } });
      input.addEventListener('input', () => {
        out.textContent = input.value;
        apply(Number(input.value));
      });
      return h('label', { class: 'physics-row' }, h('span', { textContent: label }), input, out);
    };

    // Live preview
    const urls = [s.svg, ...(s.frames ?? [])].map((svg) => spriteUrl({ ...s, svg }));
    const img = h('img', { src: urls[0], alt: `${selected} preview` });
    img.style.width = `${Math.min(200, s.width * 3)}px`;
    img.style.height = `${Math.min(200, s.height * 3)}px`;
    stage = { img, sprite: s, urls, frame: 0 };
    const modeBtn = (label: string, value: boolean) => {
      const b = h('button', { type: 'button', textContent: label, attrs: { role: 'radio', 'aria-checked': String(moving === value) } });
      b.addEventListener('click', () => {
        moving = value;
        render();
      });
      return b;
    };

    // Frames
    const strip = h(
      'div',
      { class: 'frame-strip' },
      ...urls.map((url, i) => {
        const cell = h('div', { class: 'frame-cell', attrs: { style: `background:${bg}` } }, h('img', { src: url, alt: `Frame ${i + 1}` }), h('span', { textContent: i === 0 ? 'Original' : `Frame ${i + 1}` }));
        if (i > 0) {
          const rm = h('button', { type: 'button', class: 'icon-only frame-remove', textContent: '×', attrs: { 'aria-label': `Remove frame ${i + 1}` } });
          rm.addEventListener('click', () => {
            const frames = (s.frames ?? []).filter((_, j) => j !== i - 1);
            update({ frames: frames.length ? frames : undefined }, 'frames');
          });
          cell.append(rm);
        }
        return cell;
      }),
    );
    const room = 3 - (s.frames?.length ?? 0);
    const motion = h('input', { type: 'text', placeholder: 'e.g. legs walking, wings flapping, flame flickering', maxLength: 300, attrs: { 'aria-label': 'Describe the motion' } });
    const count = h('select', { attrs: { 'aria-label': 'Frames to draw' } }, ...[1, 2, 3].filter((n) => n <= room).map((n) => new Option(`${n} frame${n > 1 ? 's' : ''}`, String(n), false, n === Math.min(2, room))));
    const gen = h('button', { type: 'button', class: 'primary', textContent: 'Draw frames with AI', disabled: room === 0 });
    gen.addEventListener('click', async () => {
      if (motion.value.trim().length < 3) return motion.focus();
      gen.disabled = true;
      gen.textContent = 'Drawing…';
      err.textContent = '';
      try {
        const extra = await fetchFrames({ ...s, frames: undefined, anim: undefined }, motion.value.trim(), Number(count.value), bg);
        const frames = [...(s.frames ?? []), ...extra].slice(0, 3);
        const ok = SpriteSchema.safeParse({ ...s, frames });
        if (!ok.success) throw new Error(formatIssues(ok.error));
        update({ frames, fps: s.fps ?? 6 }, 'frames');
        notify('success', 'Frames drawn', `"${selected}": ${motion.value.trim()}`);
      } catch (e) {
        err.textContent = (e as Error).message;
        gen.disabled = false;
        gen.textContent = 'Draw frames with AI';
      }
    });

    const preview = h(
      'div',
      { class: 'anim-preview' },
      h('div', { class: 'char-stage asset-stage anim-stage', attrs: { style: `background:${bg}` } }, img),
      h('div', { class: 'segmented anim-modes', attrs: { role: 'radiogroup', 'aria-label': 'Preview state' } }, modeBtn('Standing', false), modeBtn('Moving', true)),
    );
    const settings = h(
      'div',
      { class: 'anim-settings' },
      h('div', { class: 'tool-grid' }, select('Idle motion', IDLE_MOTIONS, anim.idle, (v) => setAnim({ idle: v as Anim['idle'] }, 'idle')), select('Move motion', MOVE_MOTIONS, anim.move, (v) => setAnim({ move: v as Anim['move'] }, 'move'))),
      range('Speed', anim.speed, 0.25, 3, 0.25, (n) => setAnim({ speed: n }, 'speed', false)),
      s.frames?.length ? range('Frame rate', s.fps ?? 6, 1, 12, 1, (n) => update({ fps: n }, 'fps', false)) : '',
    );

    d.body.replaceChildren(
      h('div', { class: 'asset-layout' }, h('section', { class: 'sb-section' }, h('h3', { textContent: `Sprites (${ids.length})` }), grid), h('section', { class: 'sb-section' }, h('h3', { textContent: `Animate: ${selected}` }), preview, settings)),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Frames' }), strip, room > 0 ? h('div', { class: 'redraw-row' }, motion, count, gen) : h('p', { class: 'physics-readout', textContent: 'Up to 3 extra frames; remove one to draw more.' }), err),
    );

    const save = h('button', { type: 'button', class: 'primary', textContent: changes.size ? 'Save animation' : 'No changes yet', disabled: changes.size === 0 });
    save.addEventListener('click', async () => {
      const result = GameSpecSchema.safeParse(draft);
      if (!result.success) {
        err.textContent = formatIssues(result.error);
        return;
      }
      d.modal.close();
      const touched = [...new Set([...changes].map((c) => c.split(' ')[0]))];
      await ctx.applyVersion(result.data, `Animation: ${touched.join(', ')}`.slice(0, 160));
    });
    d.footer.replaceChildren(save);
  };

  return {
    open() {
      const game = ctx.current();
      if (!game) return;
      draft = structuredClone(game.spec);
      selected = game.spec.player.sprite;
      moving = false;
      changes.clear();
      d.setTitle(`Animation Studio: ${game.title}`, 'Bring sprites to life; changes save as a new version');
      render();
      d.modal.open();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
  };
}
