import type { GameOptions } from '../../spec/gameOptions';
import type { GameSpec } from '../../spec/schema';
import type { SavedGame } from '../db';

/** What the studio tools can do with the app, provided by main.ts. */
export interface StudioContext {
  /** The library game in the preview, if any. */
  current(): SavedGame | undefined;
  /** Save `spec` as a new version of the current game (labelled `note`), then replay it. */
  applyVersion(spec: GameSpec, note: string): Promise<void>;
  /** Put text in the prompt box (new-game mode) and focus it. */
  setPrompt(text: string): void;
  /** Start generating from the prompt box. */
  generate(): void;
  gameOptions(): GameOptions;
}
