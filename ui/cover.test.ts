import { describe, expect, it } from 'vitest';
import { cometCourier } from '../spec/examples/cometCourier';
import { philosopherFishing } from '../spec/examples/philosopherFishing';
import { GameSpecSchema } from '../spec/schema';
import { coverSprites, spriteUrl } from './cover';

describe('coverSprites', () => {
  it('features the rocket for Comet Courier and a fish for Deep Thoughts Fishing', () => {
    const comet = GameSpecSchema.parse(cometCourier);
    expect(coverSprites(comet).hero).toBe(comet.sprites.rocket);
    expect(coverSprites(comet).sidekick).toBe(comet.sprites.parcel);
    const fishing = GameSpecSchema.parse(philosopherFishing);
    expect(coverSprites(fishing).hero).toBe(fishing.sprites.socrates);
    expect(coverSprites(fishing).sidekick).toBe(fishing.sprites.hook);
  });

  it('builds an image data URL with the SVG namespace', () => {
    const url = spriteUrl({ svg: '<svg viewBox="0 0 1 1"></svg>', width: 8, height: 8, faces: 'none' });
    expect(decodeURIComponent(url)).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});
