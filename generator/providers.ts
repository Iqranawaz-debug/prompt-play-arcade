/** Provider adapters. Server side only: these hold API keys. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatProvider {
  /** Machine id, e.g. "gemini:gemini-2.5-flash". */
  readonly name: string;
  /** Human-readable name, e.g. "Gemini 2.5 Flash". */
  readonly label: string;
  /** Returns the raw text of the model's reply. */
  complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
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
    /** The provider's own explanation, extracted from its error body when possible. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const TIMEOUT_MS = 90_000;
const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Turn a model id into a display name: "gemini-2.5-flash" -> "Gemini 2.5 Flash". */
export function modelLabel(model: string): string {
  const known: Record<string, string> = { gpt: 'GPT', gemini: 'Gemini', llama: 'Llama', mistral: 'Mistral', mixtral: 'Mixtral' };
  return model
    .split('/')
    .pop()!
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => known[w.toLowerCase()] ?? (/^\d+(\.\d+)?[bm]$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** HTTP statuses that mean "try again shortly" rather than "this request is wrong". */
export const isTransientStatus = (status?: number): boolean => status === 429 || (status !== undefined && status >= 500);

/** A used-up quota (daily/billing limit) also arrives as 429, but waiting a few seconds will not fix it. */
export const isQuotaError = (err: unknown): boolean =>
  err instanceof ProviderError && err.status === 429 && /quota|billing|exceeded your current/i.test(err.detail ?? err.message);

/** Pull the human-readable message out of a provider error body (Gemini and OpenAI-style JSON). */
export function errorDetail(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const message = typeof json.error === 'string' ? json.error : (json.error?.message ?? json.message);
    if (message) return message.trim().slice(0, 300);
  } catch {
    // not JSON: fall through to the raw text
  }
  return body.trim().replace(/\s+/g, ' ').slice(0, 300);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  label: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let res: Response;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) throw signal.reason ?? err;
    throw new ProviderError(`${label}: request failed (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!res.ok) {
    const detail = errorDetail(await res.text().catch(() => ''));
    throw new ProviderError(`${label}: HTTP ${res.status}${detail ? `: ${detail}` : ''}`, res.status, detail);
  }
  return res.json();
}

/** Native Gemini generateContent API with JSON output mode. */
export function geminiProvider(cfg: ProviderConfig): ChatProvider {
  const name = `gemini:${cfg.model}`;
  return {
    name,
    label: modelLabel(cfg.model),
    async complete(messages, signal) {
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
        signal,
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
    label: modelLabel(cfg.model),
    async complete(messages, signal) {
      const data = (await postJson(
        `${trimSlash(cfg.baseURL)}/chat/completions`,
        { Authorization: `Bearer ${cfg.apiKey}` },
        { model: cfg.model, messages, temperature: 0.9, response_format: { type: 'json_object' } },
        name,
        signal,
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
    label: `${primary.label} (fallback: ${fallback.label})`,
    async complete(messages, signal) {
      try {
        return await primary.complete(messages, signal);
      } catch (err) {
        if (signal?.aborted) throw err; // cancelled by the user: don't fall back
        console.warn(`[llm] ${primary.name} failed, using fallback ${fallback.name}:`, (err as Error).message);
        return fallback.complete(messages, signal);
      }
    },
  };
}
