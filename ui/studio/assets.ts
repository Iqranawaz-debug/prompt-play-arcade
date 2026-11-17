import { GameSpecSchema, SpriteSchema, formatIssues, type GameSpec } from '../../spec/schema';
import { fetchSprite } from '../api';
import { spriteUrl } from '../cover';
import { h } from '../modal';
import { notify } from '../notifications';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';

type Sprite = GameSpec['sprites'][string];
const THEME_KEYS = [
  ['background', 'Background'],
  ['primary', 'Primary'],
  ['accent', 'Accent'],
  ['text', 'Text'],
] as const;

function usage(spec: GameSpec, id: string): string {
  const users = [spec.player.sprite === id ? 'Player' : '', ...spec.entities.filter((e) => e.sprite === id).map((e) => e.name)].filter(Boolean);
  return users.length ? users.join(', ') : 'Unused';
}

function download(name: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = h('a', { href: url, download: `${name}.svg` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Asset Studio: theme colours and every sprite (resize, facing, AI redraw, SVG upload, download). */
export function createAssetStudio(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  let draft: GameSpec;
  let selected = '';
  const changes = new Set<string>();

  const preview = (sprite: Sprite, scale: number) => {
    const img = h('img', { src: spriteUrl(sprite), alt: '' });
    img.style.width = `${Math.min(220, sprite.width * scale)}px`;
    img.style.height = `${Math.min(220, sprite.height * scale)}px`;
    return img;
  };

  const render = () => {
    const ids = Object.keys(draft.sprites);
    if (!ids.includes(selected)) selected = ids[0];
    const bg = draft.theme.background;

    const colours = h(
      'div',
      { class: 'colour-row' },
      ...THEME_KEYS.map(([key, label]) => {
        const input = h('input', { type: 'color', value: draft.theme[key], attrs: { 'aria-label': `${label} colour` } });
        input.addEventListener('input', () => {
          draft.theme[key] = input.value;
          changes.add('colours');
          if (key === 'background') render();
        });
        return h('label', { class: 'colour-field' }, input, h('span', { textContent: label }));
      }),
    );

    const grid = h(
      'div',
      { class: 'asset-grid', attrs: { role: 'listbox', 'aria-label': 'Sprites' } },
      ...ids.map((id) => {
        const s = draft.sprites[id];
        const b = h('button', { type: 'button', class: `asset-tile${id === selected ? ' on' : ''}`, attrs: { role: 'option', 'aria-selected': String(id === selected) } }, h('span', { class: 'asset-thumb', attrs: { style: `background:${bg}` } }, preview(s, 1.2)), h('strong', { textContent: id }), h('span', { textContent: usage(draft, id) }));
        b.addEventListener('click', () => {
          selected = id;
          render();
        });
        return b;
      }),
    );

    const s = draft.sprites[selected];
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
    const setSprite = (next: Sprite, what: string) => {
      const ok = SpriteSchema.safeParse(next);
      if (!ok.success) {
        err.textContent = formatIssues(ok.error);
        return;
      }
      draft.sprites[selected] = ok.data;
      changes.add(`${selected} ${what}`);
      render();
    };
    const num = (value: number, label: string, apply: (n: number) => void) => {
      const input = h('input', { type: 'number', min: '8', max: '256', value: String(value), attrs: { 'aria-label': label } });
      input.addEventListener('change', () => apply(Math.max(8, Math.min(256, Math.round(Number(input.value) || value)))));
      return h('label', { class: 'tool-field' }, h('span', { textContent: label }), input);
    };
    const faces = h('select', { attrs: { 'aria-label': 'Faces' } }, ...(['none', 'left', 'right'] as const).map((f) => new Option(f === 'none' ? 'No direction' : `Faces ${f}`, f, false, s.faces === f)));
    faces.addEventListener('change', () => setSprite({ ...s, faces: faces.value as Sprite['faces'] }, 'facing'));

    const change = h('input', { type: 'text', placeholder: 'e.g. make it a red dragon with tiny wings', maxLength: 600, attrs: { 'aria-label': 'Describe the change' } });
    const redraw = h('button', { type: 'button', class: 'primary', textContent: 'Redraw with AI' });
    redraw.addEventListener('click', async () => {
      if (change.value.trim().length < 3) return change.focus();
      redraw.disabled = true;
      redraw.textContent = 'Redrawing…';
      err.textContent = '';
      try {
        const next = await fetchSprite(s, change.value.trim(), bg);
        setSprite(next, 'redrawn');
        notify('success', 'Sprite redrawn', `"${selected}": ${change.value.trim()}`);
      } catch (e) {
        err.textContent = (e as Error).message;
        redraw.disabled = false;
        redraw.textContent = 'Redraw with AI';
      }
    });
    const upload = h('input', { type: 'file', accept: '.svg,image/svg+xml', hidden: true });
    upload.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      if (file.size > 20_000) {
        err.textContent = 'That SVG is too large (keep sprites under 6,000 characters).';
        return;
      }
      setSprite({ ...s, svg: (await file.text()).trim() }, 'replaced');
    });
    const uploadBtn = h('button', { type: 'button', textContent: 'Replace with SVG file' });
    uploadBtn.addEventListener('click', () => upload.click());
    const dl = h('button', { type: 'button', class: 'ghost', textContent: 'Download SVG' });
    dl.addEventListener('click', () => download(selected, s.svg));

    const editor = h(
      'div',
      { class: 'asset-editor' },
      h('div', { class: 'char-stage asset-stage', attrs: { style: `background:${bg}` } }, preview(s, 3)),
      h('div', { class: 'tool-grid' }, num(s.width, 'Width', (n) => setSprite({ ...s, width: n }, 'resized')), num(s.height, 'Height', (n) => setSprite({ ...s, height: n }, 'resized'))),
      h('label', { class: 'tool-field' }, h('span', { textContent: 'Direction' }), faces),
      h('div', { class: 'redraw-row' }, change, redraw),
      h('div', { class: 'tool-actions asset-file' }, uploadBtn, upload, dl),
      err,
    );

    d.body.replaceChildren(
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Colours' }), colours),
      h('div', { class: 'asset-layout' }, h('section', { class: 'sb-section' }, h('h3', { textContent: `Sprites (${ids.length})` }), grid), h('section', { class: 'sb-section' }, h('h3', { textContent: `Selected: ${selected}` }), editor)),
    );

    const save = h('button', { type: 'button', class: 'primary', textContent: changes.size ? `Save ${changes.size} change${changes.size === 1 ? '' : 's'}` : 'No changes yet', disabled: changes.size === 0 });
    save.addEventListener('click', async () => {
      const result = GameSpecSchema.safeParse(draft);
      if (!result.success) {
        err.textContent = formatIssues(result.error);
        return;
      }
      d.modal.close();
      await ctx.applyVersion(result.data, `Asset changes: ${[...changes].join(', ')}`.slice(0, 160));
    });
    d.footer.replaceChildren(save);
  };

  return {
    open() {
      const game = ctx.current();
      if (!game) return;
      draft = structuredClone(game.spec);
      selected = game.spec.player.sprite;
      changes.clear();
      d.setTitle(`Asset Studio: ${game.title}`, 'Colours and sprites; changes save as a new version');
      render();
      d.modal.open();
    },
  };
}
