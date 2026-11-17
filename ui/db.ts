import Dexie, { type EntityTable } from 'dexie';
import type { SaveState } from '../spec/saveState';
import type { Mod } from '../spec/mods';
import { GameSpecSchema, type GameSpec } from '../spec/schema';
import type { GameOptions } from '../spec/gameOptions';
import { cometCourier } from '../spec/examples/cometCourier';
import { lanternHop } from '../spec/examples/lanternHop';
import { philosopherFishing } from '../spec/examples/philosopherFishing';
import { guessGenre, type Genre } from './genre';

/** One saved state of a game. Remixes add versions; restoring makes an older one current again. */
export interface GameVersion {
  n: number;
  spec: GameSpec;
  /** What changed, e.g. "Original" or the remix request. */
  note: string;
  createdAt: number;
}

export interface SavedGame {
  id: string;
  title: string;
  prompt: string;
  /** The current version's spec. */
  spec: GameSpec;
  /** Id of the game this one was remixed from (older remixes were saved as separate games). */
  remixOf?: string;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  lastPlayedAt?: number;
  playCount?: number;
  genre?: Genre;
  /** Settings chosen when it was generated. */
  options?: GameOptions;
  versions?: GameVersion[];
  /** Which version is current (defaults to the newest). */
  currentVersion?: number;
}

/** The version number that is current for a game. */
export const currentVersionOf = (g: SavedGame): number => g.currentVersion ?? Math.max(1, ...(g.versions ?? []).map((v) => v.n));

/** One finished round, for personal stats. */
export interface PlayRecord {
  id?: number;
  gameId: string;
  title: string;
  result: 'won' | 'lost';
  score: number;
  durationMs: number;
  endedAt: number;
}

/** A saved round in progress, tied to the game version it was played on. */
export interface SaveRecord {
  id?: number;
  gameId: string;
  version: number;
  createdAt: number;
  state: SaveState;
}

const db = new Dexie('game-generator') as Dexie & {
  games: EntityTable<SavedGame, 'id'>;
  plays: EntityTable<PlayRecord, 'id'>;
  saves: EntityTable<SaveRecord, 'id'>;
  mods: EntityTable<Mod & { savedAt: number }, 'id'>;
};
db.version(1).stores({ games: 'id, updatedAt' });
db.version(2)
  .stores({ games: 'id, updatedAt, createdAt, lastPlayedAt', plays: '++id, gameId, endedAt' })
  .upgrade((tx) =>
    tx
      .table('games')
      .toCollection()
      .modify((g: SavedGame) => {
        g.versions ??= [{ n: 1, spec: g.spec, note: g.remixOf ? 'Remix' : 'Original', createdAt: g.createdAt }];
        g.genre ??= guessGenre(g.spec);
      }),
  );
db.version(3).stores({ saves: '++id, gameId, createdAt' });
db.version(4).stores({ mods: 'id, savedAt' });

/** Mods the player made or imported (built-in mods live in code). */
export async function listMods(): Promise<Mod[]> {
  return (await db.mods.orderBy('savedAt').reverse().toArray()).map(({ savedAt: _, ...m }) => m);
}

export async function putMod(mod: Mod): Promise<void> {
  await db.mods.put({ ...mod, savedAt: Date.now() });
}

export async function deleteMod(id: string): Promise<void> {
  await db.mods.delete(id);
}

/** Saves per game are capped; the oldest go first. */
export const MAX_SAVES = 10;

export async function addSave(gameId: string, version: number, state: SaveState): Promise<void> {
  await db.transaction('rw', db.saves, async () => {
    await db.saves.add({ gameId, version, createdAt: Date.now(), state });
    const all = await db.saves.where('gameId').equals(gameId).sortBy('createdAt');
    await db.saves.bulkDelete(all.slice(0, Math.max(0, all.length - MAX_SAVES)).map((s) => s.id!));
  });
}

export async function listSaves(gameId: string): Promise<SaveRecord[]> {
  return (await db.saves.where('gameId').equals(gameId).sortBy('createdAt')).reverse();
}

export async function deleteSave(id: number): Promise<void> {
  await db.saves.delete(id);
}

export function listGames(): Promise<SavedGame[]> {
  return db.games.orderBy('updatedAt').reverse().toArray();
}

export function getGame(id: string): Promise<SavedGame | undefined> {
  return db.games.get(id);
}

export async function addGame(prompt: string, spec: GameSpec, extra: { remixOf?: string; options?: GameOptions } = {}): Promise<SavedGame> {
  const now = Date.now();
  const game: SavedGame = {
    id: crypto.randomUUID(),
    title: spec.title,
    prompt,
    spec,
    remixOf: extra.remixOf,
    createdAt: now,
    updatedAt: now,
    genre: extra.options?.genre ?? guessGenre(spec),
    options: extra.options,
    versions: [{ n: 1, spec, note: 'Original', createdAt: now }],
  };
  await db.games.add(game);
  return game;
}

export async function deleteGame(id: string): Promise<void> {
  await db.transaction('rw', db.games, db.plays, db.saves, async () => {
    await db.games.delete(id);
    await db.plays.where('gameId').equals(id).delete();
    await db.saves.where('gameId').equals(id).delete();
  });
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  await db.games.update(id, { favorite });
}

/** Called when a game is launched. */
export async function markPlayed(id: string): Promise<void> {
  const game = await db.games.get(id);
  if (game) await db.games.update(id, { lastPlayedAt: Date.now(), playCount: (game.playCount ?? 0) + 1 });
}

/** Save a new version (e.g. a remix) and make it current. */
export async function addVersion(id: string, spec: GameSpec, note: string): Promise<SavedGame | undefined> {
  const game = await db.games.get(id);
  if (!game) return undefined;
  const versions = game.versions ?? [{ n: 1, spec: game.spec, note: 'Original', createdAt: game.createdAt }];
  const n = Math.max(...versions.map((v) => v.n)) + 1;
  const next: Partial<SavedGame> = { spec, title: spec.title, updatedAt: Date.now(), currentVersion: n, versions: [...versions, { n, spec, note, createdAt: Date.now() }] };
  await db.games.update(id, next);
  return { ...game, ...next } as SavedGame;
}

/** Make an older version current again (history is kept, nothing is lost). */
export async function restoreVersion(id: string, n: number): Promise<SavedGame | undefined> {
  const game = await db.games.get(id);
  const version = game?.versions?.find((v) => v.n === n);
  if (!game || !version) return undefined;
  const next: Partial<SavedGame> = { spec: version.spec, title: version.spec.title, updatedAt: Date.now(), currentVersion: n };
  await db.games.update(id, next);
  return { ...game, ...next } as SavedGame;
}

export async function recordPlay(record: Omit<PlayRecord, 'id'>): Promise<void> {
  await db.plays.add(record);
}

export function listPlays(): Promise<PlayRecord[]> {
  return db.plays.orderBy('endedAt').reverse().toArray();
}

export async function clearStats(): Promise<void> {
  await db.plays.clear();
}

const PLATFORMER_SEEN = 'gg.seed.platformer';

/** Put the hand-written examples in an empty library so there is something to play offline. */
export async function seedIfEmpty(): Promise<void> {
  if ((await db.games.count()) === 0) {
    await addGame('A cozy fishing game where the fish are tiny philosophers', GameSpecSchema.parse(philosopherFishing));
    await addGame('Deliver parcels in space while dodging comets', GameSpecSchema.parse(cometCourier));
  }
  // Existing libraries get the platformer sample once, when platformers arrive.
  try {
    if (localStorage.getItem(PLATFORMER_SEEN)) return;
    localStorage.setItem(PLATFORMER_SEEN, '1');
  } catch {
    return;
  }
  await addGame('A lantern spirit hops across mossy ledges collecting fireflies', GameSpecSchema.parse(lanternHop));
}
