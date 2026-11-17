import { renderCover } from './cover';
import { clearStats, listPlays, type SavedGame } from './db';
import { timeAgo } from './library';
import { createModal, h } from './modal';
import { compact, computeStats, duration } from './stats';

const tile = (label: string, value: string, extra?: HTMLElement) =>
  h('div', { class: 'kpi' }, h('span', { class: 'kpi-label', textContent: label }), h('strong', { class: 'kpi-value', textContent: value }), extra);

/** "Your stats": headline tiles, personal bests per game and recent rounds. All local to this browser. */
export function createStatsPanel(host: HTMLElement, getGames: () => SavedGame[]): { open(): Promise<void> } {
  const close = h('button', { type: 'button', class: 'close', textContent: '×', attrs: { 'aria-label': 'Close stats' } });
  const body = h('div', { class: 'drawer-body stats-body' });
  const reset = h('button', { type: 'button', class: 'ghost danger', textContent: 'Reset stats' });
  const panel = h(
    'aside',
    { class: 'drawer glass stats', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stats-title' } },
    h('header', { class: 'drawer-head' }, h('div', {}, h('h2', { id: 'stats-title', textContent: 'Your stats' }), h('p', { class: 'history-sub', textContent: 'Personal bests from finished rounds, kept in this browser.' })), close),
    body,
    h('footer', { class: 'drawer-foot' }, h('span', { class: 'muted', textContent: 'Rounds count when you win or lose.' }), reset),
  );
  host.append(panel);
  const modal = createModal(panel);
  close.addEventListener('click', () => modal.close());

  let armed: number | undefined;
  reset.addEventListener('click', async () => {
    if (armed === undefined) {
      reset.textContent = 'Click again to reset';
      armed = window.setTimeout(() => ((armed = undefined), (reset.textContent = 'Reset stats')), 3000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    reset.textContent = 'Reset stats';
    await clearStats();
    await render();
  });

  const render = async () => {
    const games = getGames();
    const byId = new Map(games.map((g) => [g.id, g]));
    const s = computeStats(await listPlays(), (id) => byId.get(id)?.title);
    if (s.rounds === 0) {
      body.replaceChildren(h('div', { class: 'stats-empty' }, h('strong', { textContent: 'No rounds yet' }), h('span', { textContent: 'Win or lose a round of any game and your stats start here.' })));
      reset.hidden = true;
      return;
    }
    reset.hidden = false;

    const meter = h('span', { class: 'meter', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(s.winRate * 100)), 'aria-label': 'Win rate' } }, h('span', { class: 'meter-fill', attrs: { style: `width:${(s.winRate * 100).toFixed(1)}%` } }));
    const kpis = h(
      'section',
      { class: 'kpi-row', attrs: { 'aria-label': 'Totals' } },
      tile('Rounds played', compact(s.rounds), h('span', { class: 'kpi-sub', textContent: `${s.gamesPlayed} game${s.gamesPlayed === 1 ? '' : 's'}` })),
      tile('Wins', compact(s.wins), h('span', { class: 'kpi-sub' }, meter, `${Math.round(s.winRate * 100)}% win rate`)),
      tile('Total playtime', duration(s.playtimeMs)),
      tile('Best score', s.best ? compact(s.best.score) : '–', s.best ? h('span', { class: 'kpi-sub', textContent: s.best.title, title: s.best.title }) : undefined),
    );

    const table = h(
      'table',
      { class: 'bests' },
      h('caption', { textContent: 'Personal bests' }),
      h('thead', {}, h('tr', {}, ...['Game', 'Best', 'Rounds', 'Wins', 'Time'].map((t, i) => h('th', { textContent: t, attrs: { scope: 'col', ...(i ? { class: 'num' } : {}) } })))),
      h(
        'tbody',
        {},
        ...s.perGame.map((g) => {
          const game = byId.get(g.gameId);
          return h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' } }, h('span', { class: 'bests-game' }, game ? renderCover(game.spec) : h('span', { class: 'cover-missing' }), h('span', { textContent: g.title + (game ? '' : ' (deleted)') }))),
            h('td', { class: 'num strong', textContent: compact(g.best) }),
            h('td', { class: 'num', textContent: String(g.rounds) }),
            h('td', { class: 'num', textContent: String(g.wins) }),
            h('td', { class: 'num', textContent: duration(g.playtimeMs) }),
          );
        }),
      ),
    );

    const recent = h(
      'section',
      { class: 'recent', attrs: { 'aria-labelledby': 'recent-title' } },
      h('h3', { id: 'recent-title', textContent: 'Recent rounds' }),
      h(
        'ol',
        {},
        ...s.recent.map((p) =>
          h(
            'li',
            {},
            h('span', { class: `result ${p.result}`, textContent: p.result === 'won' ? '✓ Won' : '✕ Lost' }),
            h('span', { class: 'recent-title', textContent: byId.get(p.gameId)?.title ?? p.title }),
            h('span', { class: 'num', textContent: `${compact(p.score)} pts` }),
            h('span', { class: 'muted', textContent: `${duration(p.durationMs)} · ${timeAgo(p.endedAt)}` }),
          ),
        ),
      ),
    );
    body.replaceChildren(kpis, table, recent);
  };

  return {
    async open() {
      await render();
      modal.open();
    },
  };
}
