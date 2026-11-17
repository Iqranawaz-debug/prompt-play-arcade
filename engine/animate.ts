import type Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';
import { frameAt, isAnimated, pose } from './pose';
import { texKey } from './textures';

export { frameAt, isAnimated, pose };

type SpriteDef = GameSpec['sprites'][string];
type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

interface Skin {
  img: Phaser.GameObjects.Image;
  id: string;
  def: SpriteDef;
  frame: number;
  base: { x: number; y: number };
}

/**
 * Draws animated sprites. The physics object stays still and invisible (so hitboxes never wobble); a "skin"
 * image follows it each frame with the motion and frame applied, mirroring its flip and alpha.
 */
export class Animator {
  private readonly skins = new Map<Body, Skin>();

  constructor(private readonly scene: Phaser.Scene) {}

  attach(body: Body, id: string, def: SpriteDef): void {
    if (!isAnimated(def)) return;
    const img = this.scene.add.image(body.x, body.y, texKey(id)).setDisplaySize(def.width, def.height).setDepth(body.depth);
    body.setVisible(false);
    this.skins.set(body, { img, id, def, frame: 0, base: { x: img.scaleX, y: img.scaleY } });
    body.once('destroy', () => {
      img.destroy();
      this.skins.delete(body);
    });
  }

  update(timeMs: number): void {
    const t = timeMs / 1000;
    for (const [body, s] of this.skins) {
      const frame = frameAt(s.def, t);
      if (frame !== s.frame) {
        s.img.setTexture(texKey(s.id, frame));
        s.frame = frame;
      }
      const v = body.body.velocity;
      const p = pose(s.def.anim, t, v.x, v.y);
      s.img
        .setPosition(body.x + p.dx, body.y + p.dy)
        .setRotation(body.flipX ? -p.rotation : p.rotation)
        .setScale(s.base.x * p.sx, s.base.y * p.sy)
        .setFlipX(body.flipX)
        .setAlpha(body.alpha);
    }
  }
}
