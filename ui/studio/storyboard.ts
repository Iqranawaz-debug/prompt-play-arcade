import { StoryboardSchema, storyboardToPrompt, type Storyboard } from '../../spec/tools';
import { formatIssues } from '../../spec/schema';
import { fetchStoryboard } from '../api';
import { h } from '../modal';
import { notify } from '../notifications';
import type { StudioContext } from './context';
import { createToolDialog, field, input, textarea } from './dialog';

const ROLES = ['player', 'reward', 'hazard', 'neutral'] as const;
const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);

/** AI Storyboard Generator: plan story, characters, levels, objectives, obstacles and win/lose, edit, then generate. */
export function createStoryboard(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  let idea = '';

  const editor = (sb: Storyboard) => {
    const title = input(sb.title);
    const logline = input(sb.logline, 200);
    const story = textarea(sb.story, 3);
    const objectives = textarea(sb.objectives.join('\n'), 3, 700);
    const obstacles = textarea(sb.obstacles.join('\n'), 3, 900);
    const win = textarea(sb.win, 2, 220);
    const lose = textarea(sb.lose, 2, 220);

    const charList = h('div', { class: 'sb-list' });
    const addChar = (c: Storyboard['characters'][number]) => {
      const role = h('select', {}, ...ROLES.map((r) => new Option(r[0].toUpperCase() + r.slice(1), r, false, r === c.role)));
      const row = h(
        'div',
        { class: 'tool-card sb-row' },
        h('div', { class: 'sb-row-head' }, input(c.name, 40), role, h('button', { type: 'button', class: 'ghost danger', textContent: 'Remove', attrs: { 'aria-label': `Remove ${c.name}` } })),
        field('Look', textarea(c.look, 2, 220)),
        field('Behavior', textarea(c.behavior, 2, 220)),
      );
      row.querySelector('button')!.addEventListener('click', () => row.remove());
      charList.append(row);
    };
    sb.characters.forEach(addChar);
    const addCharBtn = h('button', { type: 'button', class: 'ghost', textContent: '+ Add character' });
    addCharBtn.addEventListener('click', () => addChar({ name: 'New character', role: 'reward', look: '', behavior: '' }));

    const levelList = h('div', { class: 'sb-list' });
    sb.levels.forEach((l, i) =>
      levelList.append(
        h('div', { class: 'tool-card sb-row' }, h('h4', { textContent: `Level ${i + 1}` }), field('Name', input(l.name, 40)), field('Setting', textarea(l.setting, 2, 220)), field('Challenge', textarea(l.challenge, 2, 220))),
      ),
    );

    d.body.replaceChildren(
      h('p', { class: 'tool-muted', textContent: 'Edit anything, then generate. Levels play as stages of rising difficulty within one game.' }),
      h('div', { class: 'tool-grid' }, field('Title', title), field('Logline', logline)),
      field('Story', story, true),
      h('div', { class: 'sb-section' }, h('h3', { textContent: 'Characters' }), charList, addCharBtn),
      h('div', { class: 'sb-section' }, h('h3', { textContent: 'Levels' }), levelList),
      h('div', { class: 'tool-grid' }, field('Objectives (one per line)', objectives), field('Obstacles (one per line)', obstacles), field('Winning condition', win), field('Losing condition', lose)),
      h('p', { class: 'tool-error', attrs: { role: 'alert' } }),
    );

    const read = (): Storyboard =>
      ({
        title: title.value,
        logline: logline.value,
        story: story.value,
        characters: [...charList.children].map((row) => {
          const [nameEl, lookEl, behaviorEl] = row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
          return { name: nameEl.value, role: row.querySelector('select')!.value as Storyboard['characters'][number]['role'], look: lookEl.value, behavior: behaviorEl.value };
        }),
        levels: [...levelList.children].map((row) => {
          const [n, s, c] = row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
          return { name: n.value, setting: s.value, challenge: c.value };
        }),
        objectives: lines(objectives.value),
        obstacles: lines(obstacles.value),
        win: win.value,
        lose: lose.value,
      }) satisfies Storyboard;

    const generate = h('button', { type: 'button', class: 'primary', textContent: 'Generate game' });
    const toPrompt = h('button', { type: 'button', textContent: 'Copy to prompt' });
    const again = h('button', { type: 'button', class: 'ghost', textContent: 'Redraft' });
    const validated = () => {
      const result = StoryboardSchema.safeParse(read());
      const err = d.body.querySelector('.tool-error')!;
      err.textContent = result.success ? '' : `Please fix:\n${formatIssues(result.error)}`;
      return result.success ? result.data : undefined;
    };
    generate.addEventListener('click', () => {
      const sb = validated();
      if (!sb) return;
      ctx.setPrompt(storyboardToPrompt(sb));
      d.modal.close();
      ctx.generate();
    });
    toPrompt.addEventListener('click', () => {
      const sb = validated();
      if (!sb) return;
      ctx.setPrompt(storyboardToPrompt(sb));
      d.modal.close();
    });
    again.addEventListener('click', () => void draft());
    d.footer.replaceChildren(again, toPrompt, generate);
  };

  const draft = async () => {
    const signal = d.busy('Drafting the story, characters and levels…');
    try {
      const sb = await fetchStoryboard(idea, ctx.gameOptions(), signal);
      d.setTitle(`Storyboard: ${sb.title}`, sb.logline);
      editor(sb);
      notify('success', 'Storyboard ready', `"${sb.title}": review it, then generate.`);
    } catch (err) {
      if (!signal.aborted) d.error('Could not create a storyboard', (err as Error).message);
    }
  };

  return {
    open(prompt: string) {
      idea = prompt;
      d.setTitle('Storyboard', 'Plan the game before generating it');
      d.modal.open();
      void draft();
    },
  };
}
