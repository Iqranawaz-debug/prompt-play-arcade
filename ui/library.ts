import type { SavedGame } from './db';

export interface LibraryActions {
  play(game: SavedGame): void;
  remix(game: SavedGame): void;
  exportHtml(game: SavedGame): void;
  remove(game: SavedGame): void;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

/** Delete needs a second click within 3s, so a stray click never loses a game. */
function deleteButton(onConfirm: () => void): HTMLButtonElement {
  let armed: number | undefined;
  const b = button('Delete', () => {
    if (armed !== undefined) {
      window.clearTimeout(armed);
      onConfirm();
      return;
    }
    b.textContent = 'Confirm?';
    b.classList.add('armed');
    armed = window.setTimeout(() => {
      armed = undefined;
      b.textContent = 'Delete';
      b.classList.remove('armed');
    }, 3000);
  }, 'danger');
  return b;
}

export function renderLibrary(list: HTMLElement, games: SavedGame[], activeId: string | undefined, actions: LibraryActions): void {
  if (games.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No games yet. Describe one above.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(
    ...games.map((game) => {
      const active = game.id === activeId;
      const li = document.createElement('li');
      li.className = active ? 'game active' : 'game';
      if (active) li.setAttribute('aria-current', 'true');
      li.style.setProperty('--swatch', game.spec.theme.background);

      const info = document.createElement('div');
      info.className = 'info';
      const titleRow = document.createElement('div');
      titleRow.className = 'title-row';
      const title = document.createElement('strong');
      title.textContent = game.title;
      title.title = game.title;
      titleRow.append(title);
      if (active) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Now playing';
        titleRow.append(badge);
      }
      const prompt = document.createElement('span');
      prompt.textContent = game.prompt;
      prompt.title = game.prompt;
      info.append(titleRow, prompt);

      const buttons = document.createElement('div');
      buttons.className = 'actions';
      buttons.append(
        button('Play', () => actions.play(game), 'primary'),
        button('Remix', () => actions.remix(game)),
        button('Export', () => actions.exportHtml(game)),
        deleteButton(() => actions.remove(game)),
      );
      li.append(info, buttons);
      return li;
    }),
  );
}
