import { createModal, h, type Modal } from './modal';
import { DEFAULTS, THEMES, getSettings, onSettings, updateSettings, type Settings } from './settings';
import { ACTIONS, DEFAULT_KEYS, keyLabel, rebind, type Action } from '../spec/controls';

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

/** Click a key slot, press the new key (Escape cancels). Taking a key from another action removes it there. */
function controlsEditor(): HTMLElement {
  const list = h('div', { class: 'controls-list' });
  let capturing: (() => void) | undefined;

  const slot = (action: Action, index: 0 | 1, label: string) => {
    const code = getSettings().keys[action][index];
    const b = h('button', { type: 'button', class: `keyslot${code ? '' : ' empty'}`, textContent: code ? keyLabel(code) : 'Add', attrs: { 'aria-label': `${label}: ${index === 0 ? 'primary' : 'secondary'} key ${code ? keyLabel(code) : 'not set'}. Click to change.` } });
    b.addEventListener('click', () => {
      capturing?.();
      b.textContent = 'Press a key…';
      b.classList.add('listening');
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation(); // don't let Escape close the drawer, or the key reach anything else
        stop();
        if (e.key !== 'Escape') updateSettings({ keys: rebind(getSettings().keys, action, index, e.code) });
        else render();
      };
      const stop = () => {
        window.removeEventListener('keydown', onKey, true);
        capturing = undefined;
      };
      window.addEventListener('keydown', onKey, true);
      capturing = () => {
        stop();
        render();
      };
    });
    return b;
  };

  const render = () =>
    list.replaceChildren(...ACTIONS.map((a) => h('div', { class: 'setting-row control-row' }, h('div', { class: 'setting-text' }, h('strong', { textContent: a.name })), h('div', { class: 'keyslots' }, slot(a.id, 0, a.name), slot(a.id, 1, a.name)))));
  onSettings(render);

  const pad = h('p', { class: 'pad-status', attrs: { role: 'status' } });
  const showPad = () => {
    const p = (navigator.getGamepads?.() ?? []).find((g) => g?.connected);
    pad.textContent = p ? `Gamepad connected: ${p.id.slice(0, 48)}` : 'No gamepad detected. Press a button on a connected controller.';
    pad.classList.toggle('on', Boolean(p));
  };
  window.addEventListener('gamepadconnected', showPad);
  window.addEventListener('gamepaddisconnected', showPad);
  showPad();

  const reset = h('button', { type: 'button', class: 'ghost', textContent: 'Reset controls' });
  reset.addEventListener('click', () => updateSettings({ keys: structuredClone(DEFAULT_KEYS) }));
  return h(
    'div',
    {},
    list,
    h('p', { class: 'setting-text' }, h('span', { textContent: 'Gamepad: left stick or D-pad moves, A or Start begins, Y toggles sound. Changes apply on the next play or restart.' })),
    pad,
    reset,
  );
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
      section('Sound', toggle('gameSound', 'Game sound effects', 'Start games with sound on. The sound key still toggles it in game.')),
      section('Controls', controlsEditor()),
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
