import { describe, expect, it } from 'vitest';
import { hexToRgb, inkOn, luminance, rgba, shade } from './colors';

describe('colour helpers', () => {
  it('parses and formats colours', () => {
    expect(hexToRgb('#ffb454')).toEqual([255, 180, 84]);
    expect(rgba('#ffb454', 0.5)).toBe('rgba(255, 180, 84, 0.5)');
  });

  it('picks readable text for a button colour', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
    expect(inkOn('#ffd6a5')).toBe('#1a1206'); // light peach -> dark text
    expect(inkOn('#3f6fd8')).toBe('#ffffff'); // deep blue -> white text
  });

  it('lightens and darkens', () => {
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#808080', -0.5)).toBe('#404040');
  });
});
