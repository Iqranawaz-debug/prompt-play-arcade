import Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';

type SpriteDef = GameSpec['sprites'][string];

/** Texture key for a sprite, or for one of its extra animation frames (1-based). */
export const texKey = (spriteId: string, frame = 0): string => (frame ? `spr_${spriteId}#${frame}` : `spr_${spriteId}`);
const frameId = (spriteId: string, frame: number) => (frame ? `${spriteId}#${frame}` : spriteId);

function svgDataUrl(svg: string): string {
  const withNs = svg.includes('xmlns=') ? svg : svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG failed to load'));
    img.src = src;
  });
}

async function rasterize(def: SpriteDef, resolution: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = def.width * resolution;
  canvas.height = def.height * resolution;
  const ctx = canvas.getContext('2d')!;
  try {
    ctx.drawImage(await loadImage(svgDataUrl(def.svg)), 0, 0, canvas.width, canvas.height);
  } catch {
    // A broken SVG should not break the game: draw a visible placeholder instead.
    ctx.fillStyle = '#ff00aa';
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/**
 * Turn every SVG string in the spec into a canvas, keyed by sprite id. `resolution` is the multiple of the
 * display size to rasterise at, so sprites stay crisp when the game is rendered zoomed in.
 */
export async function rasterizeSprites(sprites: GameSpec['sprites'], resolution = 2): Promise<Map<string, HTMLCanvasElement>> {
  const jobs = Object.entries(sprites).flatMap(([id, def]) =>
    [def.svg, ...(def.frames ?? [])].map(async (svg, i) => [frameId(id, i), await rasterize({ ...def, svg }, resolution)] as const),
  );
  const entries = await Promise.all(jobs);
  return new Map(entries);
}

export function registerTextures(scene: Phaser.Scene, canvases: Map<string, HTMLCanvasElement>): void {
  for (const [id, canvas] of canvases) {
    const key = `spr_${id}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
}

/** Scale a physics image to the sprite's display size with a slightly forgiving hitbox. */
export function sizeSprite(img: Phaser.Types.Physics.Arcade.ImageWithDynamicBody, def: SpriteDef): void {
  img.setDisplaySize(def.width, def.height);
  img.body.setSize(img.width * 0.8, img.height * 0.8, true);
}
