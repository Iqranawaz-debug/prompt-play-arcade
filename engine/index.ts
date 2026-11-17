import Phaser from 'phaser';
import { GameSpecSchema } from '../spec/schema';
import { GameScene } from './GameScene';
import { SoundFx } from './audio';
import { rasterizeSprites } from './textures';
import { setTextResolution } from './ui';
import { WORLD, renderZoom } from './world';

export { WORLD };

/** Validate a spec and start it inside `parent`. Throws if the spec is invalid. */
export async function runGame(input: unknown, parent: HTMLElement): Promise<Phaser.Game> {
  const spec = GameSpecSchema.parse(input);
  // Render with more real pixels than logical ones so the scaled-up game stays sharp (see renderZoom).
  const zoom = renderZoom(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight);
  setTextResolution(zoom);
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
    scene: [new GameScene(spec, canvases, new SoundFx(), zoom)],
  });
}
