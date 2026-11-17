import { GameSpecSchema, formatIssues, type GameSpec } from '../../spec/schema';
import { RuleSchema, describeRule, type Rule, type RuleInput } from '../../spec/rules';
import { h } from '../modal';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';
import { defaultAction, defaultTrigger, ruleBlocks } from './ruleBlocks';

const MAX_RULES = 20;

/** Extra panels (the AI rule writer) add rules through this. */
export interface LogicApi {
  spec(): GameSpec;
  addRules(rules: Rule[]): void;
}

/** Ready-made rules built from the game's own entities. */
export function ruleTemplates(spec: GameSpec): { label: string; rule: RuleInput }[] {
  const hazard = spec.entities.find((e) => e.onCollide.lives < 0) ?? spec.entities[0];
  const reward = spec.entities.find((e) => e.onCollide.score > 0) ?? spec.entities[0];
  const target = spec.win.type === 'score' ? Math.max(2, Math.round(spec.win.target / 2)) : 20;
  return [
    { label: 'Speed up over time', rule: { name: 'Rising tension', when: { on: 'every', seconds: 20 }, then: [{ do: 'speed', target: hazard.id, factor: 1.15 }, { do: 'message', text: 'Faster!' }] } },
    { label: 'Bonus life halfway', rule: { name: 'Halfway bonus', when: { on: 'score', atLeast: target }, then: [{ do: 'lives', amount: 1 }, { do: 'sound', name: 'heal' }, { do: 'message', text: 'Extra life!' }] } },
    { label: 'Hazard wave', rule: { name: 'Wave', when: { on: 'time', seconds: 30 }, then: [{ do: 'spawn', entity: hazard.id, count: 3 }, { do: 'message', text: 'Wave incoming!' }] } },
    { label: 'Last-life mercy', rule: { name: 'Mercy', when: { on: 'lives', atMost: 1 }, then: [{ do: 'clear', entity: hazard.id }, { do: 'message', text: 'Catch your breath…' }] } },
    { label: 'Combo reward', rule: { name: 'Combo', when: { on: 'collect', entity: reward.id, count: 5 }, then: [{ do: 'score', amount: 5 }, { do: 'sound', name: 'big' }, { do: 'message', text: 'Combo +5!' }] } },
    { label: 'More rewards when struggling', rule: { name: 'Helping hand', when: { on: 'every', seconds: 15 }, if: [{ stat: 'lives', op: '<=', value: 1 }], then: [{ do: 'spawnRate', entity: reward.id, factor: 1.25 }] } },
  ];
}

/** Visual Logic Builder: game rules as When / If / Then blocks, with templates and a plain-English preview. */
export function createLogicBuilder(host: HTMLElement, ctx: StudioContext, extraPanel?: (api: LogicApi) => HTMLElement) {
  const d = createToolDialog(host);
  let draft: GameSpec;
  let rules: Rule[] = [];
  let selected = 0;
  let original = '';

  const names = () => Object.fromEntries(draft.entities.map((e) => [e.id, e.name]));
  const entities = () => draft.entities.map((e) => ({ id: e.id, name: e.name }));
  const add = (input: RuleInput) => {
    if (rules.length >= MAX_RULES) return;
    rules.push(RuleSchema.parse(structuredClone(input)));
    selected = rules.length - 1;
    render();
  };

  const render = () => {
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
    const sentence = h('p', { class: 'rule-sentence', attrs: { 'aria-live': 'polite' } });
    const list = h('ol', { class: 'rule-list', attrs: { 'aria-label': 'Rules' } });
    let save: HTMLButtonElement | undefined;

    /** Validate the edited rule and refresh the sentence, list labels and Save button (no re-render). */
    const refresh = () => {
      const rule = rules[selected];
      if (rule) {
        const ok = RuleSchema.safeParse(rule);
        sentence.textContent = ok.success ? describeRule(ok.data, names()) : '';
        err.textContent = ok.success ? '' : formatIssues(ok.error);
        const label = list.children[selected]?.querySelector('.rule-text');
        if (label && ok.success) label.textContent = describeRule(ok.data, names());
      }
      if (save) {
        const changed = JSON.stringify(rules) !== original;
        save.disabled = !changed;
        save.textContent = changed ? 'Save rules' : 'No changes yet';
      }
    };

    rules.forEach((r, i) => {
      const pick = h('button', { type: 'button', class: 'rule-pick', attrs: { 'aria-current': String(i === selected) } }, h('strong', { textContent: r.name }), h('span', { class: 'rule-text', textContent: RuleSchema.safeParse(r).success ? describeRule(r, names()) : 'Needs fixing' }));
      pick.addEventListener('click', () => ((selected = i), render()));
      const toggle = h('button', { type: 'button', class: 'switch', attrs: { role: 'switch', 'aria-checked': String(r.enabled), 'aria-label': `Rule "${r.name}" enabled` } }, h('span', { class: 'knob' }));
      toggle.addEventListener('click', () => ((r.enabled = !r.enabled), render()));
      const move = (dir: -1 | 1, label: string) => {
        const b = h('button', { type: 'button', class: 'icon-only ghost', textContent: dir < 0 ? '↑' : '↓', disabled: i + dir < 0 || i + dir >= rules.length, attrs: { 'aria-label': `${label} "${r.name}"` } });
        b.addEventListener('click', () => {
          [rules[i], rules[i + dir]] = [rules[i + dir], rules[i]];
          selected = i + dir;
          render();
        });
        return b;
      };
      const del = h('button', { type: 'button', class: 'icon-only ghost', textContent: '×', attrs: { 'aria-label': `Delete rule "${r.name}"` } });
      del.addEventListener('click', () => {
        rules.splice(i, 1);
        selected = Math.max(0, Math.min(selected, rules.length - 1));
        render();
      });
      list.append(h('li', { class: `rule-item${r.enabled ? '' : ' off'}` }, pick, toggle, move(-1, 'Move up'), move(1, 'Move down'), del));
    });

    const blank = h('button', { type: 'button', textContent: '+ New rule', disabled: rules.length >= MAX_RULES });
    blank.addEventListener('click', () => add({ name: `Rule ${rules.length + 1}`, when: defaultTrigger('every', draft.entities[0].id), then: [defaultAction('message', draft.entities[0].id)] }));
    const templates = h(
      'div',
      { class: 'template-row', attrs: { role: 'group', 'aria-label': 'Rule templates' } },
      ...ruleTemplates(draft).map((t) => {
        const b = h('button', { type: 'button', class: 'chip-btn', textContent: t.label, disabled: rules.length >= MAX_RULES });
        b.addEventListener('click', () => add(t.rule));
        return b;
      }),
    );

    const rule = rules[selected];
    let editor: HTMLElement = h('p', { class: 'physics-readout', textContent: 'No rules yet. Start from a template or a blank rule; rules make games change as you play.' });
    if (rule) {
      const name = h('input', { type: 'text', value: rule.name, maxLength: 40, attrs: { 'aria-label': 'Rule name' } });
      name.addEventListener('input', () => {
        rule.name = name.value;
        const strong = list.children[selected]?.querySelector('strong');
        if (strong) strong.textContent = name.value;
        refresh();
      });
      editor = h('div', { class: 'rule-editor' }, name, ruleBlocks(rule, { entities: entities(), changed: refresh, rebuild: render }), sentence, err);
    }

    d.body.replaceChildren(
      h('div', { class: 'logic-layout' }, h('section', { class: 'sb-section' }, h('h3', { textContent: `Rules (${rules.length}/${MAX_RULES})` }), list, h('div', { class: 'tool-actions' }, blank)), h('section', { class: 'sb-section' }, h('h3', { textContent: rule ? `Edit: ${rule.name}` : 'Edit' }), editor)),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Templates' }), templates),
      extraPanel ? extraPanel(api) : '',
    );

    save = h('button', { type: 'button', class: 'primary' });
    save.addEventListener('click', async () => {
      const next = structuredClone(draft);
      next.rules = rules.length ? rules : undefined;
      const result = GameSpecSchema.safeParse(next);
      if (!result.success) {
        err.textContent = formatIssues(result.error);
        if (!rule) d.body.append(err);
        return;
      }
      d.modal.close();
      await ctx.applyVersion(result.data, `Logic: ${rules.length} rule${rules.length === 1 ? '' : 's'}`);
    });
    d.footer.replaceChildren(save);
    refresh();
  };

  const api: LogicApi = {
    spec: () => ({ ...draft, rules }),
    addRules(list) {
      for (const r of list) if (rules.length < MAX_RULES) rules.push(r);
      selected = rules.length - 1;
      render();
    },
  };

  return {
    open() {
      const game = ctx.current();
      if (!game) return;
      draft = structuredClone(game.spec);
      rules = structuredClone(draft.rules ?? []);
      original = JSON.stringify(rules);
      selected = 0;
      d.setTitle(`Logic Builder: ${game.title}`, 'When something happens, do something; saves as a new version');
      render();
      d.modal.open();
    },
  };
}
