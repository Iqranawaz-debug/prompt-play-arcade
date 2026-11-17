import { describe, expect, it } from 'vitest';
import { philosopherFishing } from '../spec/examples/philosopherFishing';
import { GameSpecSchema } from '../spec/schema';
import { decodeSpec, encodeSpec, shareUrl, sharedFromHash } from './share';

const spec = GameSpecSchema.parse(philosopherFishing);

describe('share links', () => {
  it('round-trips a game through a compact URL-safe string', async () => {
    const encoded = await encodeSpec(spec);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(JSON.stringify(spec).length);
    expect(await decodeSpec(encoded)).toEqual(spec);
  });

  it('builds and recognises #play= links', async () => {
    const url = await shareUrl(spec, 'http://localhost:5173/');
    expect(url.startsWith('http://localhost:5173/#play=')).toBe(true);
    expect(sharedFromHash(new URL(url).hash)).toBe(await encodeSpec(spec));
    expect(sharedFromHash('#something-else')).toBeUndefined();
  });

  it('rejects damaged links and anything that is not a valid game', async () => {
    await expect(decodeSpec('not-really-base64!!')).rejects.toThrow('damaged');
    const bad = await encodeSpec({ ...spec, version: 2 } as unknown as typeof spec);
    await expect(decodeSpec(bad)).rejects.toThrow('valid game');
    await expect(decodeSpec('a'.repeat(200_001))).rejects.toThrow('too large');
  });
});
