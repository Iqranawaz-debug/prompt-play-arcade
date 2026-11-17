import { describe, expect, it } from 'vitest';
import { GameSpecSchema } from '../spec/schema';
import { philosopherFishing } from '../spec/examples/philosopherFishing';
import { buildGameHtml } from './gameHtml';

const spec = GameSpecSchema.parse(philosopherFishing);

describe('buildGameHtml', () => {
  it('embeds the spec and engine with a no-network CSP', () => {
    const html = buildGameHtml(spec, 'console.log("engine")');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('console.log("engine")');
    expect(html).toContain('<title>Deep Thoughts Fishing</title>');
    const json = html.match(/window\.__GAME_SPEC__=(.*);<\/script>/)![1];
    expect(JSON.parse(json)).toEqual(spec);
  });

  it('cannot be broken out of by spec text or engine source', () => {
    const evil = structuredClone(spec);
    evil.title = '</title><script>alert(1)</script>';
    evil.entities[0].quotes = ['</script><script>alert(2)</script>'];
    const html = buildGameHtml(evil, 'var s = "</script><script>alert(3)";');
    // Only `</script` can end a script element; just our two closing tags may exist.
    expect(html.match(/<\/script/gi)).toHaveLength(2);
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;/title&gt;');
  });
});

describe('play options', () => {
  it('injects player options safely (no script break-out via key names)', () => {
    const html = buildGameHtml(spec, '', { muted: true, keys: { up: ['</script><script>x'], down: [], left: [], right: [], start: [], sound: [] } as never });
    expect(html.match(/<\/script/gi)).toHaveLength(2);
    expect(html).toContain('"muted":true');
  });
});
