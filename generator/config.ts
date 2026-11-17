import { createProvider, withFallback, type ChatProvider, type ProviderConfig } from './providers';

type Env = Record<string, string | undefined>;

const DEFAULTS = {
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  openai: { baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
} as const;

function readConfig(env: Env, prefix: 'LLM' | 'FALLBACK', defaultKind: 'gemini' | 'openai'): ProviderConfig | undefined {
  const apiKey = env[`${prefix}_API_KEY`]?.trim();
  if (!apiKey) return undefined;
  const raw = env[`${prefix}_PROVIDER`]?.trim().toLowerCase() || defaultKind;
  if (raw !== 'gemini' && raw !== 'openai') throw new Error(`${prefix}_PROVIDER must be "gemini" or "openai", got "${raw}"`);
  return {
    kind: raw,
    apiKey,
    baseURL: env[`${prefix}_BASE_URL`]?.trim() || DEFAULTS[raw].baseURL,
    model: env[`${prefix}_MODEL`]?.trim() || DEFAULTS[raw].model,
  };
}

/** Build the provider chain from environment variables. Returns undefined if no key is set. */
export function providerFromEnv(env: Env): ChatProvider | undefined {
  const primary = readConfig(env, 'LLM', 'gemini');
  const fallback = readConfig(env, 'FALLBACK', 'openai');
  if (!primary && !fallback) return undefined;
  if (!primary) return createProvider(fallback!);
  return withFallback(createProvider(primary), fallback && createProvider(fallback));
}
