import { GameSpecSchema, formatIssues, type GameSpec } from '../spec/schema';
import { SYSTEM_PROMPT, remixPrompt, retryPrompt, userPrompt } from './prompt';
import type { ChatMessage, ChatProvider } from './providers';

export const MAX_RETRIES = 2;

export interface GenerateResult {
  spec: GameSpec;
  attempts: number;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/** Pull a JSON object out of a model reply that may include code fences or chatter. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object found in reply');
  return JSON.parse(fenced.slice(start, end + 1));
}

type Check = { ok: true; spec: GameSpec } | { ok: false; problems: string };

function check(reply: string): Check {
  let data: unknown;
  try {
    data = extractJson(reply);
  } catch (err) {
    return { ok: false, problems: `- (root): invalid JSON: ${(err as Error).message}` };
  }
  const result = GameSpecSchema.safeParse(data);
  return result.success ? { ok: true, spec: result.data } : { ok: false, problems: formatIssues(result.error) };
}

/** Progress reported while generating; streamed to the browser as it happens. */
export type GenerateProgress =
  | { phase: 'generating'; attempt: number }
  | { phase: 'validating'; attempt: number }
  | { phase: 'retrying'; attempt: number; retry: number; maxRetries: number; problems: number };

/** One line of the NDJSON stream that POST /api/generate sends back. */
export type GenerateEvent =
  | ({ type: 'status' } & GenerateProgress)
  | { type: 'done'; spec: GameSpec; attempts: number }
  | { type: 'error'; message: string };

export interface GenerateOptions {
  maxRetries?: number;
  onProgress?: (progress: GenerateProgress) => void;
  /** Aborts the in-flight model request (e.g. when the user cancels). */
  signal?: AbortSignal;
}

/**
 * Ask the model for a spec, validating with Zod. On failure the validation errors are sent back
 * and the model gets up to `maxRetries` more tries.
 */
export async function generateSpec(
  provider: ChatProvider,
  firstUserMessage: string,
  { maxRetries = MAX_RETRIES, onProgress, signal }: GenerateOptions = {},
): Promise<GenerateResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: firstUserMessage },
  ];
  let problems = '';
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (attempt === 1) onProgress?.({ phase: 'generating', attempt });
    const reply = await provider.complete(messages, signal);
    onProgress?.({ phase: 'validating', attempt });
    const result = check(reply);
    if (result.ok) return { spec: result.spec, attempts: attempt };
    problems = result.problems;
    console.warn(`[generate] attempt ${attempt} invalid:\n${problems}`);
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: retryPrompt(problems) });
    if (attempt <= maxRetries) {
      const count = problems.split('\n').filter((l) => l.startsWith('- ')).length;
      onProgress?.({ phase: 'retrying', attempt: attempt + 1, retry: attempt, maxRetries, problems: count });
    }
  }
  throw new GenerationError(`The model did not produce a valid game after ${maxRetries + 1} attempts:\n${problems}`, maxRetries + 1);
}

export const generateFromIdea = (provider: ChatProvider, idea: string, options?: GenerateOptions) =>
  generateSpec(provider, userPrompt(idea), options);

export const generateRemix = (provider: ChatProvider, base: GameSpec, changes: string, options?: GenerateOptions) =>
  generateSpec(provider, remixPrompt(base, changes), options);
