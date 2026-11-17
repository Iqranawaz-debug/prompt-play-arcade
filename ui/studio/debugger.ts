import { diffValues } from '../../spec/diff';
import { environmentHints, lintSpec, type LintFinding } from '../../spec/lint';
import { fetchDebug } from '../api';
import { h } from '../modal';
import { notify } from '../notifications';
import type { StudioContext } from './context';
import { createToolDialog, field, textarea } from './dialog';

const COMMON = [
  "My character isn't moving when I press the arrow keys",
  'The game is too hard, I lose right away',
  "I can't hear any sound",
  'Nothing ever reaches me, I can\'t score',
];

const findingList = (items: LintFinding[]) =>
  h('ul', { class: 'debug-findings' }, ...items.map((f) => h('li', {}, h('strong', { textContent: f.issue }), h('span', { textContent: f.fix }))));

/** AI Game Debugger: describe a problem; automatic checks + the model diagnose it against the game's spec. */
export function createDebugger(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  const problem = textarea('', 3, 1200);
  problem.placeholder = "e.g. My character isn't moving when I press the arrow keys";

  const showForm = () => {
    const game = ctx.current();
    if (!game) return;
    const checks = lintSpec(game.spec);
    const chips = h('div', { class: 'option-chips' }, ...COMMON.map((c) => {
      const b = h('button', { type: 'button', textContent: c });
      b.addEventListener('click', () => {
        problem.value = c;
        problem.focus();
      });
      return b;
    }));
    d.body.replaceChildren(
      field('What is wrong?', problem, true),
      chips,
      h('section', { class: 'tool-card' }, h('h4', { textContent: `Automatic checks (${checks.length})` }), checks.length ? findingList(checks) : h('p', { class: 'tool-muted', textContent: 'No common problems found in this game.' })),
    );
    const diagnose = h('button', { type: 'button', class: 'primary', textContent: 'Diagnose' });
    diagnose.addEventListener('click', () => {
      if (problem.value.trim().length < 3) return problem.focus();
      void run();
    });
    d.footer.replaceChildren(diagnose);
  };

  const run = async () => {
    const game = ctx.current();
    if (!game) return;
    const text = problem.value.trim();
    const hints = environmentHints(text);
    const signal = d.busy('Analysing the game and your description…');
    try {
      const r = await fetchDebug(game.spec, text, signal);
      const changes = r.changed && r.spec ? diffValues(game.spec, r.spec) : [];
      d.body.replaceChildren(
        h('p', { class: 'debug-diagnosis', textContent: r.diagnosis }),
        ...(hints.length ? [h('section', { class: 'tool-card' }, h('h4', { textContent: 'Check first' }), findingList(hints))] : []),
        h('section', { class: 'tool-card' }, h('h4', { textContent: 'Likely causes' }), findingList(r.causes)),
        r.changed && changes.length
          ? h('section', { class: 'tool-card' }, h('h4', { textContent: 'Proposed changes' }), h('ul', { class: 'debug-diff' }, ...changes.map((c) => h('li', { textContent: c }))))
          : h('p', { class: 'tool-muted', textContent: 'No changes to the game are needed: the fix is outside it (see above).' }),
      );
      const back = h('button', { type: 'button', class: 'ghost', textContent: 'Describe another problem' });
      back.addEventListener('click', showForm);
      const buttons: HTMLElement[] = [back];
      if (r.changed && r.spec && changes.length) {
        const apply = h('button', { type: 'button', class: 'primary', textContent: 'Apply fix and replay' });
        const fixed = r.spec;
        apply.addEventListener('click', async () => {
          d.modal.close();
          await ctx.applyVersion(fixed, `Debug fix: ${text}`);
        });
        buttons.push(apply);
      }
      d.footer.replaceChildren(...buttons);
      notify('info', 'Diagnosis ready', r.changed ? 'A fix is ready to review.' : 'No game changes needed.');
    } catch (err) {
      if (signal.aborted) return;
      d.error('Could not debug the game', (err as Error).message);
      const back = h('button', { type: 'button', textContent: 'Back' });
      back.addEventListener('click', showForm);
      d.footer.replaceChildren(back);
    }
  };

  return {
    open(prefill = '') {
      const game = ctx.current();
      if (!game) return;
      problem.value = prefill;
      d.setTitle(`Debug "${game.title}"`, 'Describe what goes wrong; the AI checks the game and proposes a fix');
      showForm();
      d.modal.open();
    },
  };
}
