import Phaser from 'phaser';
import { GameSpecSchema } from '../spec/schema';
import { GameScene } from './GameScene';
import { SoundFx } from './audio';
import { rasterizeSprites } from './textures';

export const WORLD = { width: 800, height: 600 } as const;

/** Validate a spec and start it inside `parent`. Throws if the spec is invalid. */
export async function runGame(input: unknown, parent: HTMLElement): Promise<Phaser.Game> {
  const spec = GameSpecSchema.parse(input);
  const canvases = await rasterizeSprites(spec.sprites);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD.width,
    height: WORLD.height,
    backgroundColor: spec.theme.background,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    audio: { noAudio: true }, // sounds come from our own Web Audio synth
    scene: [new GameScene(spec, canvases, new SoundFx())],
  });
}
