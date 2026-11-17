import type { GenerateEvent, GenerateProgress } from '../generator/generate';
import { GameSpecSchema, LevelSchema, type GameSpec } from '../spec/schema';
import type { GameOptions } from '../spec/gameOptions';
import { z } from 'zod';
import { CharacterSchema, DebugResultSchema, FramesResultSchema, SpriteResultSchema, StoryboardSchema, type Character, type DebugResult, type Storyboard } from '../spec/tools';

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

/** A failed generation, with a short title for the alert and a longer explanation. */
export class GenerateFailure extends Error {
  constructor(
    readonly title: string,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateFailure';
  }
}

export interface GenerateCallbacks {
  onStatus?: (progress: GenerateProgress) => void;
  signal?: AbortSignal;
  /** Settings for a new game (not sent when remixing). */
  options?: GameOptions;
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
  { onStatus, signal, options }: GenerateCallbacks = {},
): Promise<{ spec: GameSpec; attempts: number }> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, base, options: base ? undefined : options }),
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
    else if (event.type === 'error') throw new GenerateFailure(event.title, event.message);
    else return { spec: GameSpecSchema.parse(event.spec), attempts: event.attempts };
  }
  throw new Error('The server closed the connection before the game was ready.');
}

/** POST to one of the AI tool endpoints and validate the answer again on arrival. */
async function postTool<T>(path: string, body: unknown, schema: { parse(data: unknown): T }, failTitle: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error('Could not reach the local server. Is "npm run dev" running?');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string };
  if (!res.ok) throw new GenerateFailure(data.title ?? failTitle, data.error ?? `Server error ${res.status}`);
  return schema.parse(data);
}

const PromptReply = z.object({ prompt: z.string() });

/** Ask the model to turn a short idea into a richer description. */
export async function enhancePrompt(prompt: string, options?: GameOptions, signal?: AbortSignal): Promise<string> {
  return (await postTool('/api/enhance', { prompt, options }, PromptReply, 'Could not enhance the prompt', signal)).prompt;
}

export const fetchStoryboard = (prompt: string, options: GameOptions | undefined, signal?: AbortSignal): Promise<Storyboard> =>
  postTool('/api/storyboard', { prompt, options }, StoryboardSchema, 'Could not create a storyboard', signal);

export const fetchCharacter = (description: string, background: string, signal?: AbortSignal): Promise<Character> =>
  postTool('/api/character', { description, background }, CharacterSchema, 'Could not create the character', signal);

export const fetchDebug = (spec: GameSpec, problem: string, signal?: AbortSignal): Promise<DebugResult> =>
  postTool('/api/debug', { spec, problem }, DebugResultSchema, 'Could not debug the game', signal);

export const fetchSprite = (sprite: GameSpec['sprites'][string], change: string, background: string, signal?: AbortSignal) =>
  postTool('/api/sprite', { sprite, change, background }, SpriteResultSchema, 'Could not redraw the sprite', signal).then((r) => r.sprite);

export const fetchFrames = (sprite: GameSpec['sprites'][string], motion: string, count: number, background: string, signal?: AbortSignal) =>
  postTool('/api/frames', { sprite, motion, count, background }, FramesResultSchema, 'Could not animate the sprite', signal).then((r) => r.frames);

export const fetchLevels = (spec: GameSpec, request: string, count: number, signal?: AbortSignal) =>
  postTool('/api/levels', { spec, request, count }, z.object({ levels: z.array(LevelSchema.extend({ name: z.string() })) }), 'Could not design levels', signal).then((r) => r.levels);
