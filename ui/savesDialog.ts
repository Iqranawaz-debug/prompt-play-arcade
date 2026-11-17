import { describeSave, type SaveState } from '../spec/saveState';
import { levelsOf } from '../spec/schema';
import { addSave, currentVersionOf, deleteSave, listSaves, type SavedGame } from './db';
import { h } from './modal';
import { notify } from './notifications';
import { createToolDialog } from './studio/dialog';

export interface SavesDeps {
  current(): SavedGame | undefined;
  /** True while a round is being played (only then is there something to save). */
  playing(): boolean;
  snapshot(): Promise<SaveState | undefined>;
  resume(game: SavedGame, state: SaveState): Promise<void>;
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Save states: snapshot the round in progress, list saves for the current game, load or delete them. */
export function createSavesDialog(host: HTMLElement, deps: SavesDeps) {
  const d = createToolDialog(host, false);

  /** Save the running round. Usable without opening the dialog (palette command). */
  async function saveNow(): Promise<boolean> {
    const game = deps.current();
    if (!game || !deps.playing()) {
      notify('info', 'Nothing to save', 'Start a round first; saves capture a game in progress.');
      return false;
    }
    const state = await deps.snapshot();
    if (!state) {
      notify('error', 'Could not save', 'The game did not answer. Try again while it is running.');
      return false;
    }
    await addSave(game.id, currentVersionOf(game), state);
    notify('success', 'Game saved', `"${game.title}": ${describeSave(state, game.spec.score.label, levelsOf(game.spec).length)}`);
    return true;
  }

  async function render(): Promise<void> {
    const game = deps.current();
    if (!game) return;
    const version = currentVersionOf(game);
    const saves = await listSaves(game.id);
    const levelCount = levelsOf(game.spec).length;

    const list = saves.length
      ? h(
          'ul',
          { class: 'save-list' },
          ...saves.map((s) => {
            const stale = s.version !== version;
            const load = h('button', { type: 'button', class: 'primary', textContent: 'Load', disabled: stale, attrs: { 'aria-label': `Load save from ${when(s.createdAt)}` } });
            load.addEventListener('click', async () => {
              d.modal.close({ restoreFocus: false });
              await deps.resume(game, s.state);
            });
            const del = h('button', { type: 'button', class: 'ghost', textContent: 'Delete', attrs: { 'aria-label': `Delete save from ${when(s.createdAt)}` } });
            del.addEventListener('click', async () => {
              await deleteSave(s.id!);
              await render();
            });
            return h(
              'li',
              { class: `save-row${stale ? ' stale' : ''}` },
              h('div', { class: 'setting-text' }, h('strong', { textContent: describeSave(s.state, game.spec.score.label, levelCount) }), h('span', { textContent: stale ? `${when(s.createdAt)} · made on version ${s.version}; the game has changed since` : when(s.createdAt) })),
              h('div', { class: 'tool-actions' }, load, del),
            );
          }),
        )
      : h('p', { class: 'physics-readout', textContent: 'No saves yet. While playing, press "Save now" to keep your progress.' });

    d.body.replaceChildren(h('section', { class: 'sb-section' }, h('h3', { textContent: `Saves (${saves.length})` }), list));
    const save = h('button', { type: 'button', class: 'primary', textContent: 'Save now', disabled: !deps.playing() });
    save.title = deps.playing() ? '' : 'Start a round to save it';
    save.addEventListener('click', async () => {
      save.disabled = true;
      if (await saveNow()) await render();
      else save.disabled = false;
    });
    d.footer.replaceChildren(save);
  }

  return {
    saveNow,
    async open() {
      const game = deps.current();
      if (!game) return;
      d.setTitle(`Saves: ${game.title}`, 'Pick up a round exactly where you left it');
      await render();
      d.modal.open();
    },
  };
}
