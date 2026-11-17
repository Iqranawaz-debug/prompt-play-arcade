import { GameSpecSchema, type GameSpec } from '../spec/schema';

/**
 * Share links carry the whole game in the URL fragment (#play=...), compressed. The fragment is never sent to any
 * server, so sharing needs no hosting: the link opens in any running copy of this app.
 */
const PREFIX = '#play=';
/** Generous cap so a pasted link can't make us decompress something huge. */
const MAX_ENCODED = 200_000;

const toBase64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeSpec(spec: GameSpec): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(spec));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Decode and validate a shared spec. Throws a readable error for anything that is not a valid game. */
export async function decodeSpec(encoded: string): Promise<GameSpec> {
  if (encoded.length > MAX_ENCODED) throw new Error('This share link is too large to be a game.');
  let data: unknown;
  try {
    const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('This share link is damaged or incomplete.');
  }
  const result = GameSpecSchema.safeParse(data);
  if (!result.success) throw new Error('This share link does not contain a valid game.');
  return result.data;
}

export async function shareUrl(spec: GameSpec, base = `${location.origin}${location.pathname}`): Promise<string> {
  return `${base}${PREFIX}${await encodeSpec(spec)}`;
}

/** The encoded game in a URL hash, if it is a share link. */
export function sharedFromHash(hash = location.hash): string | undefined {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : undefined;
}
