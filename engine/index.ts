import Phaser from 'phaser';
import { GameSpecSchema } from '../spec/schema';
import { SaveStateSchema, type SaveState } from '../spec/saveState';
import { GameScene } from './GameScene';
import { SoundFx } from './audio';
import type { GameStatus } from './status';
import { Controls } from './controls';
import { normalizeKeyMap } from '../spec/controls';
import { rasterizeSprites } from './textures';
import { setTextResolution } from './ui';
import { WORLD, renderZoom } from './world';

export { WORLD };

export interface RunOptions {
  /** Called when the game's phase, score or lives change. */
  onStatus?: (status: GameStatus) => void;
  /** Start with sound effects off (M still toggles). */
  muted?: boolean;
  /** Upper bound on render zoom; lower is lighter on the GPU. */
  maxZoom?: number;
  /** Remapped keys (KeyboardEvent.code per action); defaults when omitted. */
  keys?: unknown;
  /** A saved round to continue (validated; ignored if malformed). */
  resume?: unknown;
}

export interface GameHandle {
  game: Phaser.Game;
  /** The round in progress, for save states; undefined between rounds. */
  snapshot(): SaveState | undefined;
}

/** Validate a spec and start it inside `parent`. Throws if the spec is invalid. */
export async function runGame(input: unknown, parent: HTMLElement, options: RunOptions = {}): Promise<GameHandle> {
  const spec = GameSpecSchema.parse(input);
  // Render with more real pixels than logical ones so the scaled-up game stays sharp (see renderZoom).
  const zoom = Math.min(options.maxZoom ?? Infinity, renderZoom(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight));
  setTextResolution(zoom);
  const sfx = new SoundFx();
  sfx.muted = Boolean(options.muted);
  const canvases = await rasterizeSprites(spec.sprites, Math.max(2, Math.ceil(zoom)));
  const resume = options.resume === undefined ? undefined : SaveStateSchema.safeParse(options.resume).data;
  const scene = new GameScene(spec, canvases, sfx, zoom, options.onStatus, new Controls(normalizeKeyMap(options.keys)), resume);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.round(WORLD.width * zoom),
    height: Math.round(WORLD.height * zoom),
    backgroundColor: spec.theme.background,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    // The host page decides when the game gets keyboard focus; Phaser's own boot-time window.focus() would
    // otherwise pull focus into the frame at an arbitrary moment (e.g. while the user types in a dialog).
    autoFocus: false,
    audio: { noAudio: true }, // sounds come from our own Web Audio synth
    scene: [scene],
  });
  return { game, snapshot: () => scene.snapshot() };
}
