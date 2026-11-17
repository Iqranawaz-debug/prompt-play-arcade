import { renderCover } from './cover';
import { currentVersionOf, type SavedGame } from './db';
import { timeAgo } from './library';
import { createModal, h, type Modal } from './modal';

export interface HistoryPanel {
  open(game: SavedGame): void;
  readonly modal: Modal;
}

/** Side panel listing a game's versions, newest first, with Restore on older ones. */
export function createHistoryPanel(host: HTMLElement, onRestore: (game: SavedGame, n: number) => Promise<void>): HistoryPanel {
  const title = h('h2', { id: 'history-title', textContent: 'Version history' });
  const subtitle = h('p', { class: 'history-sub' });
  const close = h('button', { type: 'button', class: 'close', textContent: '×', attrs: { 'aria-label': 'Close version history' } });
  const list = h('ol', { class: 'history-list' });
  const panel = h(
    'aside',
    { class: 'drawer glass history', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'history-title' } },
    h('header', { class: 'drawer-head' }, h('div', {}, title, subtitle), close),
    h('div', { class: 'drawer-body' }, list),
    h('footer', { class: 'drawer-foot' }, h('span', { class: 'muted', textContent: 'Remixes add versions. Restoring never deletes anything.' })),
  );
  host.append(panel);
  const modal = createModal(panel);
  close.addEventListener('click', () => modal.close());

  const render = (game: SavedGame) => {
    const versions = [...(game.versions ?? [])].sort((a, b) => b.n - a.n);
    const current = currentVersionOf(game);
    subtitle.textContent = `${game.title} · ${versions.length} version${versions.length === 1 ? '' : 's'}`;
    list.replaceChildren(
      ...versions.map((v) => {
        const isCurrent = v.n === current;
        const action = isCurrent
          ? h('span', { class: 'badge', textContent: 'Current' })
          : h('button', { type: 'button', class: 'primary', textContent: 'Restore', attrs: { 'aria-label': `Restore version ${v.n}` } });
        if (action instanceof HTMLButtonElement) {
          action.addEventListener('click', async () => {
            action.disabled = true;
            await onRestore(game, v.n);
            modal.close();
          });
        }
        return h(
          'li',
          { class: `history-item${isCurrent ? ' current' : ''}` },
          renderCover(v.spec),
          h(
            'div',
            { class: 'history-text' },
            h('strong', { textContent: `Version ${v.n}${v.spec.title !== game.title ? ` · ${v.spec.title}` : ''}` }),
            h('span', { class: 'history-note', textContent: v.note, title: v.note }),
            h('time', { textContent: timeAgo(v.createdAt) }),
          ),
          action,
        );
      }),
    );
  };

  return {
    modal,
    open(game) {
      render(game);
      modal.open();
    },
  };
}
