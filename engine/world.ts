import type { Rect } from './motion';

/** Logical game size. All gameplay coordinates use this, whatever the canvas resolution. */
export const WORLD = { width: 960, height: 540 } as const;

/** Height of the HUD bar along the top. Gameplay never happens underneath it. */
export const HUD_H = 44;

/** The area entities and the player move in: everything below the HUD bar. */
export const FIELD: Rect = { x: 0, y: HUD_H, w: WORLD.width, h: WORLD.height - HUD_H };

/**
 * How many real pixels to render per logical pixel, so text and shapes stay sharp when the 960x540 game is
 * scaled up to fill the frame (and on high-DPI screens). Clamped to keep the canvas a reasonable size.
 */
export function renderZoom(viewW = window.innerWidth, viewH = window.innerHeight, dpr = window.devicePixelRatio || 1): number {
  const fit = Math.min(viewW / WORLD.width, viewH / WORLD.height);
  const zoom = Math.round(fit * dpr * 4) / 4; // quarter steps avoid odd canvas sizes
  return Math.min(2.5, Math.max(1, zoom));
}
