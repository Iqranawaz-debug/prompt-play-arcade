import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerFromEnv } from './config';
import { ProviderError, errorDetail, geminiProvider, modelLabel, openAiCompatibleProvider, withFallback, type ChatProvider } from './providers';

const msgs = [
  { role: 'system' as const, content: 'sys' },
  { role: 'user' as const, content: 'hi' },
  { role: 'assistant' as const, content: '{}' },
];

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('geminiProvider', () => {
  it('sends system instruction, model roles and JSON mode', async () => {
    const fetch = mockFetch({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] });
    const p = geminiProvider({ kind: 'gemini', baseURL: 'https://g.example/v1beta/', apiKey: 'k', model: 'gem' });
    expect(await p.complete(msgs)).toBe('{"ok":1}');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://g.example/v1beta/models/gem:generateContent');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(init!.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model']);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });
});

describe('openAiCompatibleProvider', () => {
  it('calls /chat/completions with a bearer token', async () => {
    const fetch = mockFetch({ choices: [{ message: { content: '{}' } }] });
    const p = openAiCompatibleProvider({ kind: 'openai', baseURL: 'https://o.example/v1', apiKey: 'k', model: 'm' });
    await p.complete(msgs);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://o.example/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(init!.body as string).messages).toHaveLength(3);
  });

  it('raises ProviderError on HTTP errors', async () => {
    mockFetch({ error: 'nope' }, 429);
    const p = openAiCompatibleProvider({ kind: 'openai', baseURL: 'https://o.example/v1', apiKey: 'k', model: 'm' });
    await expect(p.complete(msgs)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('withFallback / providerFromEnv', () => {
  it('uses the fallback when the primary fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad: ChatProvider = { name: 'bad', label: 'Bad', complete: async () => Promise.reject(new ProviderError('down')) };
    const good: ChatProvider = { name: 'good', label: 'Good', complete: async () => 'ok' };
    expect(await withFallback(bad, good).complete(msgs)).toBe('ok');
  });

  it('defaults to Gemini and supports an OpenAI-compatible fallback', () => {
    expect(providerFromEnv({})).toBeUndefined();
    expect(providerFromEnv({ LLM_API_KEY: 'a' })!.name).toBe('gemini:gemini-2.5-flash');
    expect(providerFromEnv({ LLM_API_KEY: 'a', FALLBACK_API_KEY: 'b' })!.name).toBe(
      'gemini:gemini-2.5-flash -> openai:llama-3.3-70b-versatile',
    );
    expect(providerFromEnv({ FALLBACK_API_KEY: 'b', FALLBACK_MODEL: 'mistral-small-latest' })!.name).toBe(
      'openai:mistral-small-latest',
    );
  });
});

describe('modelLabel', () => {
  it('turns model ids into display names', () => {
    expect(modelLabel('gemini-2.5-flash')).toBe('Gemini 2.5 Flash');
    expect(modelLabel('llama-3.3-70b-versatile')).toBe('Llama 3.3 70B Versatile');
    expect(modelLabel('mistral-small-latest')).toBe('Mistral Small Latest');
    expect(modelLabel('openai/gpt-4o-mini')).toBe('GPT 4o Mini');
  });

  it('labels a fallback chain readably', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(providerFromEnv({ LLM_API_KEY: 'a', FALLBACK_API_KEY: 'b' })!.label).toBe(
      'Gemini 2.5 Flash (fallback: Llama 3.3 70B Versatile)',
    );
  });
});

describe('errorDetail', () => {
  it('extracts the message from Gemini and OpenAI-style error bodies', () => {
    const gemini = JSON.stringify({ error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } });
    expect(errorDetail(gemini)).toBe('This model is currently experiencing high demand.');
    expect(errorDetail(JSON.stringify({ error: 'rate limited' }))).toBe('rate limited');
    expect(errorDetail('<html>  Bad   Gateway </html>')).toBe('<html> Bad Gateway </html>');
  });
});
