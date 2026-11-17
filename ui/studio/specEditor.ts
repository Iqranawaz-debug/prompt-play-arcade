import { GameSpecSchema, formatIssues, type GameSpec } from '../../spec/schema';
import { diffValues } from '../../spec/diff';
import { h } from '../modal';

/**
 * Raw JSON editor for the whole game spec, for power users. Every keystroke is validated with the same schema the AI
 * output goes through; only a valid spec can be saved. Returns the panel and a getter for the parsed result.
 */
export function specEditor(spec: GameSpec, onValidity: (valid: GameSpec | undefined) => void): HTMLElement {
  const pretty = JSON.stringify(spec, null, 2);
  const area = h('textarea', { class: 'spec-json', value: pretty, spellcheck: false, attrs: { 'aria-label': 'Game spec JSON', autocomplete: 'off' } });
  const status = h('div', { class: 'spec-status', attrs: { 'aria-live': 'polite' } });
  let timer = 0;

  const check = () => {
    let data: unknown;
    try {
      data = JSON.parse(area.value);
    } catch (e) {
      status.replaceChildren(h('p', { class: 'physics-readout warn', textContent: `Not valid JSON: ${(e as Error).message}` }));
      return onValidity(undefined);
    }
    const result = GameSpecSchema.safeParse(data);
    if (!result.success) {
      status.replaceChildren(h('p', { class: 'physics-readout warn', textContent: 'The game would not pass validation:' }), h('pre', { class: 'spec-issues', textContent: formatIssues(result.error) }));
      return onValidity(undefined);
    }
    const changes = diffValues(spec, result.data);
    status.replaceChildren(
      h('p', { class: 'physics-readout ok', textContent: changes.length ? `Valid. ${changes.length}${changes.length >= 14 ? '+' : ''} change${changes.length === 1 ? '' : 's'}:` : 'Valid. No changes yet.' }),
      ...(changes.length ? [h('ul', { class: 'spec-diff' }, ...changes.map((c) => h('li', { textContent: c })))] : []),
    );
    onValidity(changes.length ? result.data : undefined);
  };

  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(check, 250);
  });
  // Tab inserts two spaces instead of leaving the editor (Escape still closes the dialog).
  area.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input'));
  });

  const format = h('button', { type: 'button', class: 'ghost', textContent: 'Format' });
  format.addEventListener('click', () => {
    try {
      area.value = JSON.stringify(JSON.parse(area.value), null, 2);
    } catch {
      /* leave invalid text alone; the status already explains */
    }
  });
  const reset = h('button', { type: 'button', class: 'ghost', textContent: 'Reset' });
  reset.addEventListener('click', () => {
    area.value = pretty;
    check();
  });

  queueMicrotask(check);
  return h('div', { class: 'spec-editor' }, area, h('div', { class: 'tool-actions' }, format, reset), status);
}
