import type { SavedGame } from './db';
import { renderCover } from './cover';
import { ICONS, iconButton, setButtonLabel } from './icons';

export interface LibraryActions {
  play(game: SavedGame): void;
  remix(game: SavedGame): void;
  exportHtml(game: SavedGame): void;
  remove(game: SavedGame): void;
}

/** Delete needs a second click within 3s, so a stray click never loses a game. */
function deleteButton(onConfirm: () => void): HTMLButtonElement {
  let armed: number | undefined;
  const b = iconButton(ICONS.trash, 'Delete', 'danger icon-only', () => {
    if (armed !== undefined) {
      window.clearTimeout(armed);
      onConfirm();
      return;
    }
    setButtonLabel(b, 'Confirm?');
    b.setAttribute('aria-label', 'Click again to delete');
    b.classList.add('armed');
    armed = window.setTimeout(() => {
      armed = undefined;
      setButtonLabel(b, 'Delete');
      b.setAttribute('aria-label', 'Delete game');
      b.classList.remove('armed');
    }, 3000);
  });
  b.title = 'Delete';
  b.setAttribute('aria-label', 'Delete game');
  return b;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(then: number, now = Date.now()): string {
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function card(game: SavedGame, active: boolean, actions: LibraryActions): HTMLLIElement {
  const li = el('li', active ? 'game active' : 'game');
  if (active) li.setAttribute('aria-current', 'true');
  const thumb = renderCover(game.spec);

  const body = el('div', 'game-body info');
  const titleRow = el('div', 'title-row');
  const title = el('strong', '', game.title);
  title.title = game.title;
  titleRow.append(title);
  const prompt = el('p', 'prompt', game.prompt);
  prompt.title = game.prompt;
  const meta = el('div', 'meta');
  if (active) meta.append(el('span', 'badge', 'Now playing'));
  meta.append(el('span', '', timeAgo(game.createdAt)));
  if (game.remixOf) meta.append(el('span', 'tag', 'Remix'));
  body.append(titleRow, prompt, meta);

  const buttons = el('div', 'actions');
  buttons.append(
    iconButton(ICONS.play, active ? 'Replay' : 'Play', 'primary', () => actions.play(game)),
    iconButton(ICONS.remix, 'Remix', 'ghost', () => actions.remix(game)),
    iconButton(ICONS.download, 'Export', 'ghost', () => actions.exportHtml(game)),
    el('span', 'spacer'),
    deleteButton(() => actions.remove(game)),
  );

  li.append(thumb, body, buttons);
  return li;
}

export function renderLibrary(list: HTMLElement, games: SavedGame[], activeId: string | undefined, actions: LibraryActions): void {
  if (games.length === 0) {
    list.replaceChildren(el('li', 'empty', 'No games yet. Describe one above to get started.'));
    return;
  }
  list.replaceChildren(...games.map((game) => card(game, game.id === activeId, actions)));
}
