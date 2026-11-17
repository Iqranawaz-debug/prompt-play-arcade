import { levelsOf } from '../../spec/schema';
import { fetchLevels } from '../api';
import { h } from '../modal';
import { notify } from '../notifications';
import type { LevelEditorApi } from './levelEditor';

const MAX_LEVELS = 8;

/** AI Level Designer panel for the Level Editor: describe levels, get validated maps appended to the list. */
export function aiLevelPanel(api: LevelEditorApi): HTMLElement {
  const room = MAX_LEVELS - levelsOf(api.spec()).length;
  const request = h('textarea', {
    rows: 2,
    maxLength: 600,
    placeholder: 'e.g. three levels that climb a stormy mountain, each with fewer ledges than the last',
    attrs: { 'aria-label': 'Describe the levels' },
  });
  const count = h('select', { attrs: { 'aria-label': 'How many levels' } }, ...[1, 2, 3, 4].filter((n) => n <= Math.max(1, room)).map((n) => new Option(`${n} level${n > 1 ? 's' : ''}`, String(n), false, n === Math.min(2, room))));
  const go = h('button', { type: 'button', class: 'primary', textContent: 'Design with AI', disabled: room <= 0 });
  const status = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
  let controller: AbortController | undefined;

  go.addEventListener('click', async () => {
    if (request.value.trim().length < 3) return request.focus();
    controller?.abort();
    controller = new AbortController();
    go.disabled = true;
    go.textContent = 'Designing…';
    status.textContent = '';
    try {
      const levels = await fetchLevels(api.spec(), request.value.trim(), Number(count.value), controller.signal);
      api.addLevels(levels); // re-renders the editor (and this panel)
      notify('success', `${levels.length} level${levels.length > 1 ? 's' : ''} designed`, levels.map((l) => l.name).join(', '));
    } catch (e) {
      if (controller.signal.aborted) return;
      status.textContent = (e as Error).message;
      go.disabled = false;
      go.textContent = 'Design with AI';
    }
  });

  return h(
    'section',
    { class: 'sb-section' },
    h('h3', { textContent: 'AI Level Designer' }),
    room > 0
      ? h('div', { class: 'gen-panel' }, request, h('div', { class: 'redraw-row' }, count, go), h('p', { class: 'physics-readout', textContent: "Designed levels are checked against this game's movement and jump before they are added." }))
      : h('p', { class: 'physics-readout', textContent: 'This game already has 8 levels; delete one to design more.' }),
    status,
  );
}
