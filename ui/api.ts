import type { GenerateEvent, GenerateProgress } from '../generator/generate';
import { GameSpecSchema, type GameSpec } from '../spec/schema';

export interface Health {
  ok: boolean;
  provider: string | null;
  label: string | null;
}

export async function fetchHealth(): Promise<Health | undefined> {
  try {
    const res = await fetch('/api/health');
    return res.ok ? ((await res.json()) as Health) : undefined;
  } catch {
    return undefined;
  }
}

export interface GenerateCallbacks {
  onStatus?: (progress: GenerateProgress) => void;
  signal?: AbortSignal;
}

/** Read an NDJSON response body one event at a time. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<GenerateEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as GenerateEvent;
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as GenerateEvent;
}

/**
 * Ask the local proxy to generate a spec, or to remix `base` when given. Progress arrives as a stream;
 * aborting `signal` cancels the request on the server too. The result is re-validated on arrival.
 */
export async function generateGame(
  prompt: string,
  base?: GameSpec,
  { onStatus, signal }: GenerateCallbacks = {},
): Promise<{ spec: GameSpec; attempts: number }> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, base }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error('Could not reach the local server. Is "npm run dev" running?');
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Server error ${res.status}`);
  }
  for await (const event of readEvents(res.body)) {
    if (event.type === 'status') onStatus?.(event);
    else if (event.type === 'error') throw new Error(event.message);
    else return { spec: GameSpecSchema.parse(event.spec), attempts: event.attempts };
  }
  throw new Error('The server closed the connection before the game was ready.');
}
