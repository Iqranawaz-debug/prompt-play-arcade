import type { SavedGame } from './db';
import type { Genre } from './genre';

export type LibraryFilter = 'all' | 'favorites' | 'recent' | Genre;
export type LibrarySort = 'newest' | 'oldest' | 'played' | 'popular' | 'az';

export const SORTS: { id: LibrarySort; name: string }[] = [
  { id: 'newest', name: 'Newest' },
  { id: 'oldest', name: 'Oldest' },
  { id: 'played', name: 'Recently played' },
  { id: 'popular', name: 'Most played' },
  { id: 'az', name: 'A–Z' },
];

export interface LibraryQuery {
  search: string;
  filter: LibraryFilter;
  sort: LibrarySort;
}

const haystack = (g: SavedGame) => `${g.title} ${g.prompt} ${g.spec.description} ${g.genre ?? ''}`.toLowerCase();

/** Search, filter and sort the library. Pure, so it is unit-tested. */
export function queryGames(games: SavedGame[], q: LibraryQuery): SavedGame[] {
  const words = q.search.toLowerCase().split(/\s+/).filter(Boolean);
  let out = games.filter((g) => words.every((w) => haystack(g).includes(w)));
  if (q.filter === 'favorites') out = out.filter((g) => g.favorite);
  else if (q.filter === 'recent') out = out.filter((g) => g.lastPlayedAt);
  else if (q.filter !== 'all') out = out.filter((g) => g.genre === q.filter);

  // "Recently played" as a filter implies that order unless another sort was chosen explicitly.
  const sort = q.filter === 'recent' && q.sort === 'newest' ? 'played' : q.sort;
  const by: Record<LibrarySort, (a: SavedGame, b: SavedGame) => number> = {
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    played: (a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || b.createdAt - a.createdAt,
    popular: (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || b.createdAt - a.createdAt,
    az: (a, b) => a.title.localeCompare(b.title),
  };
  return [...out].sort(by[sort]);
}

/** How many games each filter chip would show (ignoring the chip itself). */
export function filterCounts(games: SavedGame[], search: string): Record<string, number> {
  const base = queryGames(games, { search, filter: 'all', sort: 'newest' });
  const counts: Record<string, number> = { all: base.length, favorites: 0, recent: 0 };
  for (const g of base) {
    if (g.favorite) counts.favorites++;
    if (g.lastPlayedAt) counts.recent++;
    if (g.genre) counts[g.genre] = (counts[g.genre] ?? 0) + 1;
  }
  return counts;
}
