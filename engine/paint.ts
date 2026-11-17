import Phaser from 'phaser';

// ---------- canvas-painted images ----------

let textureCount = 0;

/**
 * Paint a Canvas2D image (gradients, soft shadows, rounded strokes) at `resolution` real pixels per logical pixel.
 * `pad` leaves room around the shape for shadows. The texture is freed when the image is destroyed.
 */
export function paintedImage(
  scene: Phaser.Scene,
  width: number,
  height: number,
  resolution: number,
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void,
  pad = 0,
): Phaser.GameObjects.Image {
  const key = `__painted_${++textureCount}`;
  const w = width + pad * 2;
  const h = height + pad * 2;
  const texture = scene.textures.createCanvas(key, Math.ceil(w * resolution), Math.ceil(h * resolution))!;
  const ctx = texture.getContext();
  ctx.scale(resolution, resolution);
  draw(ctx, pad, pad);
  texture.refresh();
  const image = scene.add.image(0, 0, key).setDisplaySize(w, h);
  image.once(Phaser.GameObjects.Events.DESTROY, () => scene.textures.remove(key));
  return image;
}

export function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
