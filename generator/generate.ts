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

/**
 * Ask the model for a spec, validating with Zod. On failure the validation errors are sent back
 * and the model gets up to `maxRetries` more tries.
 */
export async function generateSpec(
  provider: ChatProvider,
  firstUserMessage: string,
  maxRetries = MAX_RETRIES,
): Promise<GenerateResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: firstUserMessage },
  ];
  let problems = '';
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const reply = await provider.complete(messages);
    const result = check(reply);
    if (result.ok) return { spec: result.spec, attempts: attempt };
    problems = result.problems;
    console.warn(`[generate] attempt ${attempt} invalid:\n${problems}`);
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: retryPrompt(problems) });
  }
  throw new GenerationError(`The model did not produce a valid game after ${maxRetries + 1} attempts:\n${problems}`, maxRetries + 1);
}

export const generateFromIdea = (provider: ChatProvider, idea: string) => generateSpec(provider, userPrompt(idea));

export const generateRemix = (provider: ChatProvider, base: GameSpec, changes: string) =>
  generateSpec(provider, remixPrompt(base, changes));
