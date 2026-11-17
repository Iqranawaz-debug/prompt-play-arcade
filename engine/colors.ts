/** Pure colour and palette helpers (no Phaser, so they are unit-testable). */

/** Shared palette with the dashboard (ui/styles/tokens.css), so the game chrome feels like the same product. */
export const CHROME = {
  text: '#e9edf4',
  text2: '#a4aec0',
  text3: '#6f7a8f',
  surfaceTop: 'rgba(24, 32, 51, 0.96)',
  surfaceBottom: 'rgba(13, 18, 28, 0.96)',
  hudTop: 'rgba(10, 13, 19, 0.82)',
  hudBottom: 'rgba(10, 13, 19, 0.6)',
} as const;

export const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif';

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (hex: string, alpha: number): string => `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`;

/** Relative luminance (WCAG), 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour to put on top of `hex`. */
export const inkOn = (hex: string): string => (luminance(hex) > 0.35 ? '#1a1206' : '#ffffff');

/** Lighten (amount > 0) or darken (amount < 0) a colour by mixing with white or black. */
export function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mixed = hexToRgb(hex).map((c) => Math.round(c + (target - c) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
