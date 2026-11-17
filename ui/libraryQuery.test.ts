import { describe, expect, it } from 'vitest';
import { cometCourier } from '../spec/examples/cometCourier';
import { philosopherFishing } from '../spec/examples/philosopherFishing';
import { GameSpecSchema } from '../spec/schema';
import type { SavedGame } from './db';
import { guessGenre } from './genre';
import { filterCounts, queryGames } from './libraryQuery';

const fishing = GameSpecSchema.parse(philosopherFishing);
const comet = GameSpecSchema.parse(cometCourier);
const game = (id: string, spec: typeof fishing, extra: Partial<SavedGame>): SavedGame => ({
  id, title: spec.title, prompt: `prompt ${id}`, spec, createdAt: 0, updatedAt: 0, genre: guessGenre(spec), ...extra,
});
const games = [
  game('a', fishing, { createdAt: 1, favorite: true, lastPlayedAt: 50, playCount: 2 }),
  game('b', comet, { createdAt: 2, playCount: 5 }),
  game('c', fishing, { createdAt: 3, title: 'Abyss Anglers', lastPlayedAt: 90, playCount: 1 }),
];
const ids = (list: SavedGame[]) => list.map((g) => g.id).join('');

describe('queryGames', () => {
  it('sorts newest, oldest, most played and A-Z', () => {
    expect(ids(queryGames(games, { search: '', filter: 'all', sort: 'newest' }))).toBe('cba');
    expect(ids(queryGames(games, { search: '', filter: 'all', sort: 'oldest' }))).toBe('abc');
    expect(ids(queryGames(games, { search: '', filter: 'all', sort: 'popular' }))).toBe('bac');
    expect(queryGames(games, { search: '', filter: 'all', sort: 'az' }).map((g) => g.title)).toEqual(['Abyss Anglers', 'Comet Courier', 'Deep Thoughts Fishing']);
  });

  it('filters favorites, recently played (most recent first) and genre', () => {
    expect(ids(queryGames(games, { search: '', filter: 'favorites', sort: 'newest' }))).toBe('a');
    expect(ids(queryGames(games, { search: '', filter: 'recent', sort: 'newest' }))).toBe('ca');
    expect(ids(queryGames(games, { search: '', filter: 'survival', sort: 'newest' }))).toBe('b');
  });

  it('searches title, prompt and description with every word', () => {
    expect(ids(queryGames(games, { search: 'comets parcels', filter: 'all', sort: 'newest' }))).toBe('b');
    expect(ids(queryGames(games, { search: 'ABYSS', filter: 'all', sort: 'newest' }))).toBe('c');
    expect(queryGames(games, { search: 'nothing-matches', filter: 'all', sort: 'newest' })).toHaveLength(0);
  });

  it('counts per filter chip', () => {
    const counts = filterCounts(games, '');
    expect(counts.all).toBe(3);
    expect(counts.favorites).toBe(1);
    expect(counts.recent).toBe(2);
    expect(counts.survival).toBe(1);
  });
});

describe('guessGenre', () => {
  it('reads the genre from the rules', () => {
    expect(guessGenre(comet)).toBe('survival');
    expect(guessGenre(fishing)).toBe('collector');
  });
});
