import Phaser from 'phaser';
import { GameSpecSchema } from '../spec/schema';
import { GameScene } from './GameScene';
import { SoundFx } from './audio';
import type { GameStatus } from './status';
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
}

/** Validate a spec and start it inside `parent`. Throws if the spec is invalid. */
export async function runGame(input: unknown, parent: HTMLElement, options: RunOptions = {}): Promise<Phaser.Game> {
  const spec = GameSpecSchema.parse(input);
  // Render with more real pixels than logical ones so the scaled-up game stays sharp (see renderZoom).
  const zoom = Math.min(options.maxZoom ?? Infinity, renderZoom(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight));
  setTextResolution(zoom);
  const sfx = new SoundFx();
  sfx.muted = Boolean(options.muted);
  const canvases = await rasterizeSprites(spec.sprites, Math.max(2, Math.ceil(zoom)));
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.round(WORLD.width * zoom),
    height: Math.round(WORLD.height * zoom),
    backgroundColor: spec.theme.background,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    audio: { noAudio: true }, // sounds come from our own Web Audio synth
    scene: [new GameScene(spec, canvases, sfx, zoom, options.onStatus)],
  });
}
