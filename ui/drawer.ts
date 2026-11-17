import { createModal, h, type Modal } from './modal';
import { DEFAULTS, THEMES, getSettings, onSettings, updateSettings, type Settings } from './settings';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function toggle(key: BoolKey, label: string, hint: string): HTMLElement {
  const sw = h('button', { type: 'button', class: 'switch', attrs: { role: 'switch', 'aria-label': label } }, h('span', { class: 'knob' }));
  sw.addEventListener('click', () => updateSettings({ [key]: !getSettings()[key] } as Partial<Settings>));
  onSettings((s) => sw.setAttribute('aria-checked', String(s[key])));
  return h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('strong', { textContent: label }), h('span', { textContent: hint })), sw);
}

function segmented<K extends 'motion' | 'previewQuality'>(key: K, label: string, options: { value: Settings[K]; label: string }[]): HTMLElement {
  const group = h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': label } });
  for (const opt of options) {
    const b = h('button', { type: 'button', textContent: opt.label, attrs: { role: 'radio' } });
    b.addEventListener('click', () => updateSettings({ [key]: opt.value } as Partial<Settings>));
    onSettings((s) => b.setAttribute('aria-checked', String(s[key] === opt.value)));
    group.append(b);
  }
  return h('div', { class: 'setting-row stacked' }, h('div', { class: 'setting-text' }, h('strong', { textContent: label })), group);
}

function themePicker(): HTMLElement {
  const grid = h('div', { class: 'theme-grid', attrs: { role: 'radiogroup', 'aria-label': 'Theme' } });
  for (const t of THEMES) {
    const b = h(
      'button',
      { type: 'button', class: 'theme-option', attrs: { role: 'radio' } },
      h('span', { class: 'theme-swatch', attrs: { style: `--sw-a:${t.swatch[0]};--sw-b:${t.swatch[1]}` } }),
      h('span', { textContent: t.name }),
    );
    b.addEventListener('click', () => updateSettings({ theme: t.id }));
    onSettings((s) => b.setAttribute('aria-checked', String(s.theme === t.id)));
    grid.append(b);
  }
  return grid;
}

const section = (title: string, ...rows: HTMLElement[]) => h('section', { class: 'drawer-section' }, h('h3', { textContent: title }), ...rows);

/** The customization drawer (Settings). */
export function createSettingsDrawer(host: HTMLElement): Modal {
  const close = h('button', { type: 'button', class: 'close', textContent: '×', attrs: { 'aria-label': 'Close settings' } });
  const reset = h('button', { type: 'button', class: 'ghost', textContent: 'Reset to defaults' });
  reset.addEventListener('click', () => updateSettings({ ...DEFAULTS }));

  const panel = h(
    'aside',
    { class: 'drawer glass', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawer-title' } },
    h('header', { class: 'drawer-head' }, h('h2', { id: 'drawer-title', textContent: 'Customize' }), close),
    h(
      'div',
      { class: 'drawer-body' },
      section('Theme', themePicker()),
      section('Sound', toggle('gameSound', 'Game sound effects', 'Start games with sound on. M still toggles it in game.')),
      section(
        'Animation',
        segmented('motion', 'Motion', [
          { value: 'system', label: 'System' },
          { value: 'full', label: 'Full' },
          { value: 'reduced', label: 'Reduced' },
        ]),
        toggle('ambient', 'Ambient background', 'Drifting glow and starfield behind the app.'),
        toggle('ambient3d', '3D ambient objects', 'Floating glass shapes behind the panels.'),
        toggle('controller3d', '3D controller', 'The floating controller in the empty preview.'),
        toggle('effects', 'Interactive effects', 'Cursor spotlight, holographic sheen and animated borders.'),
      ),
      section(
        'Preview',
        toggle('previewHints', 'Controls hint', 'Show the key hints under the game.'),
        toggle('previewGlow', 'Ambient glow', 'Tint the area behind the game with its colours.'),
        segmented('previewQuality', 'Render quality', [
          { value: 'sharp', label: 'Sharp' },
          { value: 'balanced', label: 'Balanced' },
        ]),
      ),
    ),
    h('footer', { class: 'drawer-foot' }, h('span', { class: 'muted', textContent: 'Saved in this browser only.' }), reset),
  );
  host.append(panel);
  const modal = createModal(panel);
  close.addEventListener('click', () => modal.close());
  return modal;
}
