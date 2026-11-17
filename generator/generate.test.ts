import { describe, expect, it } from 'vitest';
import { cometCourier } from '../spec/examples/cometCourier';
import { GameSpecSchema } from '../spec/schema';
import { GenerationError, extractJson, generateSpec } from './generate';
import { SYSTEM_PROMPT } from './prompt';
import type { ChatMessage, ChatProvider } from './providers';

/** Provider that replays canned replies and records what it was sent. */
function fakeProvider(replies: string[]) {
  const calls: ChatMessage[][] = [];
  const provider: ChatProvider = {
    name: 'fake',
    label: 'Fake',
    async complete(messages) {
      calls.push(structuredClone(messages));
      const next = replies.shift();
      if (next === undefined) throw new Error('no more replies');
      return next;
    },
  };
  return { provider, calls };
}

const valid = JSON.stringify(cometCourier);
const broken = JSON.stringify({ ...cometCourier, player: { ...cometCourier.player, sprite: 'missing' } });

describe('extractJson', () => {
  it('handles code fences and surrounding chatter', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```\nEnjoy')).toEqual({ a: 1 });
    expect(extractJson('here: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
  });
});

describe('generateSpec', () => {
  it('returns a validated spec on the first try', async () => {
    const { provider, calls } = fakeProvider([valid]);
    const result = await generateSpec(provider, 'space courier');
    expect(result.attempts).toBe(1);
    expect(result.spec.title).toBe('Comet Courier');
    expect(calls[0][0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
  });

  it('sends the Zod error back and retries', async () => {
    const { provider, calls } = fakeProvider([broken, 'not json at all', valid]);
    const result = await generateSpec(provider, 'space courier');
    expect(result.attempts).toBe(3);
    const firstRetry = calls[1].at(-1)!;
    expect(firstRetry.role).toBe('user');
    expect(firstRetry.content).toContain('player.sprite: unknown sprite "missing"');
    expect(calls[1].at(-2)).toEqual({ role: 'assistant', content: broken });
    expect(calls[2].at(-1)!.content).toContain('invalid JSON');
  });

  it('gives up after 2 retries', async () => {
    const { provider, calls } = fakeProvider([broken, broken, broken, valid]);
    await expect(generateSpec(provider, 'x')).rejects.toBeInstanceOf(GenerationError);
    expect(calls).toHaveLength(3);
  });
});

describe('system prompt', () => {
  it('embeds the schema and two valid examples', () => {
    expect(SYSTEM_PROMPT).toContain('"$schema"');
    const examples = SYSTEM_PROMPT.split(/Example \d:\n/).slice(1);
    expect(examples).toHaveLength(2);
    for (const ex of examples) expect(GameSpecSchema.safeParse(JSON.parse(ex)).success).toBe(true);
  });
});

describe('generateRemix', () => {
  it('sends the base spec and the requested changes', async () => {
    const { generateRemix } = await import('./generate');
    const { provider, calls } = fakeProvider([valid]);
    const base = GameSpecSchema.parse(cometCourier);
    await generateRemix(provider, base, 'make the comets pink');
    const msg = calls[0][1].content;
    expect(msg).toContain(JSON.stringify(base));
    expect(msg).toContain('make the comets pink');
  });
});

describe('progress and cancellation', () => {
  it('reports generating, validating and retrying phases', async () => {
    const { provider } = fakeProvider([broken, valid]);
    const events: unknown[] = [];
    await generateSpec(provider, 'x', { onProgress: (p) => events.push(p) });
    expect(events).toEqual([
      { phase: 'generating', attempt: 1 },
      { phase: 'validating', attempt: 1 },
      { phase: 'retrying', attempt: 2, retry: 1, maxRetries: 2, problems: 1 },
      { phase: 'validating', attempt: 2 },
    ]);
  });

  it('passes the abort signal to the provider', async () => {
    let seen: AbortSignal | undefined;
    const provider: ChatProvider = {
      name: 'fake',
      label: 'Fake',
      complete: async (_m, signal) => {
        seen = signal;
        return valid;
      },
    };
    const controller = new AbortController();
    await generateSpec(provider, 'x', { signal: controller.signal });
    expect(seen).toBe(controller.signal);
  });
});
