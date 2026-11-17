import Dexie, { type EntityTable } from 'dexie';
import { GameSpecSchema, type GameSpec } from '../spec/schema';
import { cometCourier } from '../spec/examples/cometCourier';
import { philosopherFishing } from '../spec/examples/philosopherFishing';

export interface SavedGame {
  id: string;
  title: string;
  prompt: string;
  spec: GameSpec;
  createdAt: number;
  updatedAt: number;
}

const db = new Dexie('game-generator') as Dexie & { games: EntityTable<SavedGame, 'id'> };
db.version(1).stores({ games: 'id, updatedAt' });

export function listGames(): Promise<SavedGame[]> {
  return db.games.orderBy('updatedAt').reverse().toArray();
}

export function getGame(id: string): Promise<SavedGame | undefined> {
  return db.games.get(id);
}

export async function addGame(prompt: string, spec: GameSpec): Promise<SavedGame> {
  const now = Date.now();
  const game: SavedGame = { id: crypto.randomUUID(), title: spec.title, prompt, spec, createdAt: now, updatedAt: now };
  await db.games.add(game);
  return game;
}

export function deleteGame(id: string): Promise<void> {
  return db.games.delete(id);
}

/** Put the two hand-written examples in an empty library so there is something to play offline. */
export async function seedIfEmpty(): Promise<void> {
  if ((await db.games.count()) > 0) return;
  await addGame('A cozy fishing game where the fish are tiny philosophers', GameSpecSchema.parse(philosopherFishing));
  await addGame('Deliver parcels in space while dodging comets', GameSpecSchema.parse(cometCourier));
}
