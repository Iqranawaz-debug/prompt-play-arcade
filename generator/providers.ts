/** Provider adapters. Server side only: these hold API keys. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatProvider {
  readonly name: string;
  /** Returns the raw text of the model's reply. */
  complete(messages: ChatMessage[]): Promise<string>;
}

export interface ProviderConfig {
  kind: 'gemini' | 'openai';
  baseURL: string;
  apiKey: string;
  model: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const TIMEOUT_MS = 90_000;
const trimSlash = (url: string) => url.replace(/\/+$/, '');

async function postJson(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ProviderError(`${label}: request failed (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new ProviderError(`${label}: HTTP ${res.status} ${detail}`, res.status);
  }
  return res.json();
}

/** Native Gemini generateContent API with JSON output mode. */
export function geminiProvider(cfg: ProviderConfig): ChatProvider {
  const name = `gemini:${cfg.model}`;
  return {
    name,
    async complete(messages) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const data = (await postJson(
        `${trimSlash(cfg.baseURL)}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        { 'x-goog-api-key': cfg.apiKey },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
        },
        name,
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new ProviderError(`${name}: empty response`);
      return text;
    },
  };
}

/** Any OpenAI-compatible /chat/completions endpoint (Groq, Mistral, OpenRouter, local servers...). */
export function openAiCompatibleProvider(cfg: ProviderConfig): ChatProvider {
  const name = `openai:${cfg.model}`;
  return {
    name,
    async complete(messages) {
      const data = (await postJson(
        `${trimSlash(cfg.baseURL)}/chat/completions`,
        { Authorization: `Bearer ${cfg.apiKey}` },
        { model: cfg.model, messages, temperature: 0.9, response_format: { type: 'json_object' } },
        name,
      )) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw new ProviderError(`${name}: empty response`);
      return text;
    },
  };
}

export function createProvider(cfg: ProviderConfig): ChatProvider {
  return cfg.kind === 'gemini' ? geminiProvider(cfg) : openAiCompatibleProvider(cfg);
}

/** Use `primary`; if it fails at the transport/API level, try `fallback`. */
export function withFallback(primary: ChatProvider, fallback?: ChatProvider): ChatProvider {
  if (!fallback) return primary;
  return {
    name: `${primary.name} -> ${fallback.name}`,
    async complete(messages) {
      try {
        return await primary.complete(messages);
      } catch (err) {
        console.warn(`[llm] ${primary.name} failed, using fallback ${fallback.name}:`, (err as Error).message);
        return fallback.complete(messages);
      }
    },
  };
}
