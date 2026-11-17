import type Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';
import { texKey } from './textures';

type SpriteDef = GameSpec['sprites'][string];
type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

export interface Pose {
  dx: number;
  dy: number;
  rotation: number;
  sx: number;
  sy: number;
}

const REST: Pose = { dx: 0, dy: 0, rotation: 0, sx: 1, sy: 1 };
/** Below this speed (px/s) a sprite counts as standing still. */
const MOVING = 20;

/** The offset/rotation/scale a sprite's motion gives it at time `t` (seconds). Pure, so it is unit-testable. */
export function pose(anim: SpriteDef['anim'], t: number, vx: number, vy: number): Pose {
  if (!anim) return REST;
  const k = t * anim.speed;
  const moving = Math.hypot(vx, vy) > MOVING;
  const p = { ...REST };
  if (moving) {
    if (anim.move === 'tilt') p.rotation = Math.max(-0.22, Math.min(0.22, vx / 900));
    if (anim.move === 'squash') {
      const w = Math.sin(k * 16) * 0.09;
      p.sx = 1 + w;
      p.sy = 1 - w;
    }
    if (anim.move === 'bob') p.dy = -Math.abs(Math.sin(k * 10)) * 4;
    return p;
  }
  switch (anim.idle) {
    case 'bob':
      p.dy = Math.sin(k * 4) * 3;
      break;
    case 'pulse':
      p.sx = p.sy = 1 + Math.sin(k * 5) * 0.08;
      break;
    case 'spin':
      p.rotation = k * 2.5;
      break;
    case 'sway':
      p.rotation = Math.sin(k * 3) * 0.14;
      break;
    case 'wobble': {
      const w = Math.sin(k * 6) * 0.06;
      p.sx = 1 + w;
      p.sy = 1 - w;
      break;
    }
  }
  return p;
}

/** Which drawing to show at time `t` (0 = the main svg, 1.. = extra frames). */
export const frameAt = (def: SpriteDef, t: number): number => {
  const count = 1 + (def.frames?.length ?? 0);
  return count === 1 ? 0 : Math.floor(t * (def.fps ?? 6) * (def.anim?.speed ?? 1)) % count;
};

export const isAnimated = (def: SpriteDef): boolean =>
  Boolean(def.frames?.length) || (!!def.anim && (def.anim.idle !== 'none' || def.anim.move !== 'none'));

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
