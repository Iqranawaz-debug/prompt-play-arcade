import { formatIssues, GameSpecSchema, type GameSpec } from '../../spec/schema';
import { BUILTIN_MODS, ModSchema, applyMod, describeOp, type Mod } from '../../spec/mods';
import { diffValues } from '../../spec/diff';
import { fetchMod } from '../api';
import { deleteMod, listMods, putMod } from '../db';
import { downloadText } from '../download';
import { h } from '../modal';
import { notify } from '../notifications';
import type { StudioContext } from './context';
import { createToolDialog } from './dialog';
import { opRows } from './modBuilder';
import { specEditor } from './specEditor';

type Tab = 'library' | 'create' | 'json';
const TABS: { id: Tab; name: string }[] = [
  { id: 'library', name: 'Mod library' },
  { id: 'create', name: 'Create a mod' },
  { id: 'json', name: 'Edit game JSON' },
];
const blankMod = (): Mod => ({ v: 1, id: `my-mod-${Date.now().toString(36).slice(-5)}`, name: 'My mod', description: '', ops: [{ op: 'playerSpeed', factor: 1.25 }] });

/** What a mod would do to this game: a validated result, the changes, and notes, or the problems. */
function preview(spec: GameSpec, mod: Mod): { spec?: GameSpec; changes: string[]; notes: string[]; problems?: string } {
  const { spec: out, notes } = applyMod(spec, mod);
  const result = GameSpecSchema.safeParse(out);
  if (!result.success) return { changes: [], notes, problems: formatIssues(result.error) };
  return { spec: result.data, changes: diffValues(spec, result.data), notes };
}

function previewBox(p: ReturnType<typeof preview>): HTMLElement {
  if (p.problems) return h('div', { class: 'mod-preview' }, h('p', { class: 'physics-readout warn', textContent: "This mod doesn't fit this game:" }), h('pre', { class: 'spec-issues', textContent: p.problems }));
  return h(
    'div',
    { class: 'mod-preview' },
    h('p', { class: 'physics-readout', textContent: p.changes.length ? `What changes in this game (${p.changes.length}${p.changes.length >= 14 ? '+' : ''}):` : 'No changes for this game.' }),
    h('ul', { class: 'spec-diff' }, ...p.changes.map((c) => h('li', { textContent: c }))),
    ...p.notes.map((n) => h('p', { class: 'physics-readout', textContent: n })),
  );
}

/** Game Modding: apply shareable mods, build or import your own, write one with AI, or edit the game's JSON. */
export function createModding(host: HTMLElement, ctx: StudioContext) {
  const d = createToolDialog(host);
  let spec: GameSpec;
  let tab: Tab = 'library';
  let mine: Mod[] = [];
  let selected = BUILTIN_MODS[0].id;
  let draft: Mod = blankMod();
  let jsonResult: GameSpec | undefined;

  const all = () => [...mine, ...BUILTIN_MODS];
  const apply = async (mod: Mod) => {
    const p = preview(spec, mod);
    if (!p.spec) return;
    d.modal.close();
    await ctx.applyVersion(p.spec, `Mod: ${mod.name}`);
  };

  const importFile = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    let data: unknown;
    try {
      if (file.size > 50_000) throw new Error('That file is too large for a mod.');
      data = JSON.parse(await file.text());
    } catch (e) {
      return notify('error', 'Could not import mod', e instanceof SyntaxError ? 'The file is not valid JSON.' : (e as Error).message);
    }
    const result = ModSchema.safeParse(data);
    if (!result.success) return notify('error', 'Not a valid mod', formatIssues(result.error).slice(0, 300));
    const mod = result.data;
    if (BUILTIN_MODS.some((m) => m.id === mod.id)) mod.id = `${mod.id}-copy`.slice(0, 40);
    await putMod(mod);
    mine = await listMods();
    selected = mod.id;
    tab = 'library';
    notify('success', 'Mod imported', `"${mod.name}" is in your mod library.`);
    render();
  });

  const libraryTab = () => {
    const mod = all().find((m) => m.id === selected) ?? all()[0];
    selected = mod.id;
    const own = mine.some((m) => m.id === mod.id);
    const cards = h(
      'div',
      { class: 'mod-grid', attrs: { role: 'listbox', 'aria-label': 'Mods' } },
      ...all().map((m) => {
        const b = h('button', { type: 'button', class: `mod-card${m.id === selected ? ' on' : ''}`, attrs: { role: 'option', 'aria-selected': String(m.id === selected) } }, h('strong', { textContent: m.name }), h('span', { textContent: m.description || describeOp(m.ops[0]) }), h('em', { textContent: mine.some((x) => x.id === m.id) ? 'Yours' : 'Built in' }));
        b.addEventListener('click', () => ((selected = m.id), render()));
        return b;
      }),
    );
    const p = preview(spec, mod);
    const applyBtn = h('button', { type: 'button', class: 'primary', textContent: `Apply "${mod.name}"`, disabled: !p.spec || p.changes.length === 0 });
    applyBtn.addEventListener('click', () => apply(mod));
    const exp = h('button', { type: 'button', class: 'ghost', textContent: 'Export' });
    exp.addEventListener('click', () => downloadText(`${mod.id}.mod.json`, JSON.stringify(mod, null, 2), 'application/json'));
    const edit = h('button', { type: 'button', class: 'ghost', textContent: own ? 'Edit' : 'Copy & edit' });
    edit.addEventListener('click', () => {
      draft = structuredClone(own ? mod : { ...mod, id: `${mod.id}-mine`.slice(0, 40), name: `${mod.name} (mine)`.slice(0, 40), author: undefined });
      tab = 'create';
      render();
    });
    const actions = h('div', { class: 'tool-actions' }, exp, edit);
    if (own) {
      const del = h('button', { type: 'button', class: 'ghost', textContent: 'Delete' });
      del.addEventListener('click', async () => {
        await deleteMod(mod.id);
        mine = await listMods();
        render();
      });
      actions.append(del);
    }
    const importBtn = h('button', { type: 'button', textContent: 'Import mod file…' });
    importBtn.addEventListener('click', () => importFile.click());
    d.footer.replaceChildren(importBtn, importFile, applyBtn);
    return h(
      'div',
      { class: 'asset-layout' },
      h('section', { class: 'sb-section' }, h('h3', { textContent: `Mods (${all().length})` }), cards),
      h('section', { class: 'sb-section' }, h('h3', { textContent: mod.name }), h('p', { class: 'mod-desc', textContent: mod.description }), h('ul', { class: 'mod-ops' }, ...mod.ops.map((o) => h('li', { textContent: describeOp(o) }))), mod.author ? h('p', { class: 'physics-readout', textContent: `By ${mod.author}` }) : '', actions, previewBox(p)),
    );
  };

  const createTab = () => {
    const err = h('p', { class: 'tool-error', attrs: { role: 'alert' } });
    const previewSlot = h('div');
    const save = h('button', { type: 'button', textContent: 'Save to my mods' });
    const applyBtn = h('button', { type: 'button', class: 'primary', textContent: 'Apply to this game' });
    const refresh = () => {
      const ok = ModSchema.safeParse(draft);
      err.textContent = ok.success ? '' : formatIssues(ok.error);
      save.disabled = !ok.success;
      const p = ok.success ? preview(spec, ok.data) : undefined;
      applyBtn.disabled = !p?.spec || p.changes.length === 0;
      previewSlot.replaceChildren(p ? previewBox(p) : '');
    };
    const text = (label: string, key: 'name' | 'description', max: number) => {
      const el = h('input', { type: 'text', value: draft[key], maxLength: max, attrs: { 'aria-label': label } });
      el.addEventListener('input', () => ((draft[key] = el.value), refresh()));
      return h('label', { class: 'tool-field' }, h('span', { textContent: label }), el);
    };

    const idea = h('input', { type: 'text', maxLength: 600, placeholder: 'e.g. a slippery ice world where hazards slowly speed up', attrs: { 'aria-label': 'Describe a mod' } });
    const ai = h('button', { type: 'button', class: 'primary', textContent: 'Write with AI' });
    ai.addEventListener('click', async () => {
      if (idea.value.trim().length < 3) return idea.focus();
      ai.disabled = true;
      ai.textContent = 'Writing…';
      try {
        draft = await fetchMod(idea.value.trim());
        notify('success', 'Mod written', `"${draft.name}": review it, then save or apply.`);
        render();
      } catch (e) {
        err.textContent = (e as Error).message;
        ai.disabled = false;
        ai.textContent = 'Write with AI';
      }
    });

    save.addEventListener('click', async () => {
      const ok = ModSchema.safeParse(draft);
      if (!ok.success) return;
      if (BUILTIN_MODS.some((m) => m.id === ok.data.id)) ok.data.id = `${ok.data.id}-mine`.slice(0, 40);
      await putMod(ok.data);
      mine = await listMods();
      selected = ok.data.id;
      tab = 'library';
      notify('success', 'Mod saved', `"${ok.data.name}" is in your mod library; export it to share.`);
      render();
    });
    applyBtn.addEventListener('click', () => {
      const ok = ModSchema.safeParse(draft);
      if (ok.success) void apply(ok.data);
    });
    d.footer.replaceChildren(save, applyBtn);
    queueMicrotask(refresh);
    return h(
      'div',
      { class: 'mod-create' },
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Start from an idea' }), h('div', { class: 'redraw-row' }, idea, ai)),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Mod' }), h('div', { class: 'tool-grid' }, text('Name', 'name', 40), text('Description', 'description', 160)), opRows(draft.ops, refresh, render), err),
      h('section', { class: 'sb-section' }, h('h3', { textContent: 'Preview on this game' }), previewSlot),
    );
  };

  const jsonTab = () => {
    const save = h('button', { type: 'button', class: 'primary', textContent: 'Save as new version', disabled: true });
    save.addEventListener('click', async () => {
      if (!jsonResult) return;
      d.modal.close();
      await ctx.applyVersion(jsonResult, 'Edited JSON');
    });
    d.footer.replaceChildren(save);
    jsonResult = undefined;
    return h(
      'section',
      { class: 'sb-section' },
      h('p', { class: 'physics-readout', textContent: 'Every field of the game, as JSON. Changes are checked as you type; only a valid game can be saved.' }),
      specEditor(spec, (valid) => {
        jsonResult = valid;
        save.disabled = !valid;
      }),
    );
  };

  const render = () => {
    const tabs = h(
      'div',
      { class: 'segmented mod-tabs', attrs: { role: 'tablist', 'aria-label': 'Modding' } },
      ...TABS.map((t) => {
        const b = h('button', { type: 'button', textContent: t.name, attrs: { role: 'tab', 'aria-selected': String(t.id === tab), 'aria-checked': String(t.id === tab) } });
        b.addEventListener('click', () => ((tab = t.id), render()));
        return b;
      }),
    );
    d.body.replaceChildren(tabs, tab === 'library' ? libraryTab() : tab === 'create' ? createTab() : jsonTab());
  };

  return {
    async open(start: Tab = 'library') {
      const game = ctx.current();
      if (!game) return;
      spec = game.spec;
      mine = await listMods();
      tab = start;
      draft = blankMod();
      d.setTitle(`Game Modding: ${game.title}`, 'Mods change any game; every change saves as a new version');
      render();
      d.modal.open();
    },
  };
}
