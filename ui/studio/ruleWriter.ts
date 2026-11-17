import { fetchRules } from '../api';
import { h } from '../modal';
import { notify } from '../notifications';
import type { LogicApi } from './logic';

/** AI rule writer panel for the Logic Builder: describe behaviour in words, get validated rules to edit. */
export function aiRulePanel(api: LogicApi): HTMLElement {
  const full = (api.spec().rules?.length ?? 0) >= 20;
  const request = h('textarea', {
    rows: 2,
    maxLength: 600,
    placeholder: 'e.g. every 30 seconds a boss wave of 3 comets arrives, and collecting 10 parcels gives an extra life',
    attrs: { 'aria-label': 'Describe the rules' },
  });
  const go = h('button', { type: 'button', class: 'primary', textContent: 'Write rules with AI', disabled: full });
  const status = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
  let controller: AbortController | undefined;

  go.addEventListener('click', async () => {
    if (request.value.trim().length < 3) return request.focus();
    controller?.abort();
    controller = new AbortController();
    go.disabled = true;
    go.textContent = 'Writing…';
    status.textContent = '';
    try {
      const rules = await fetchRules(api.spec(), request.value.trim(), controller.signal);
      api.addRules(rules); // re-renders the builder (and this panel)
      notify('success', `${rules.length} rule${rules.length > 1 ? 's' : ''} written`, rules.map((r) => r.name).join(', '));
    } catch (e) {
      if (controller.signal.aborted) return;
      status.textContent = (e as Error).message;
      go.disabled = false;
      go.textContent = 'Write rules with AI';
    }
  });

  return h(
    'section',
    { class: 'sb-section' },
    h('h3', { textContent: 'AI rule writer' }),
    full
      ? h('p', { class: 'physics-readout', textContent: 'This game has the maximum of 20 rules.' })
      : h('div', { class: 'gen-panel' }, request, h('div', { class: 'tool-actions' }, go), h('p', { class: 'physics-readout', textContent: 'New rules are checked against this game and open in the editor, so you can tweak them before saving.' })),
    status,
  );
}
