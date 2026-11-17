import type { z } from 'zod';
import { formatIssues } from '../spec/schema';
import { completeWithBackoff, extractJson } from './generate';
import type { ChatMessage, ChatProvider } from './providers';

export class AskError extends Error {}

export interface AskOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Extra tries after an invalid reply; each one sends the validation errors back. */
  maxRetries?: number;
  signal?: AbortSignal;
}

/**
 * Ask the model for one JSON object and validate it with Zod. Invalid replies are sent back with the exact
 * problems (the same loop that makes game generation reliable). Busy-model back-off applies to every call.
 */
export async function askJson<T>(provider: ChatProvider, { system, user, schema, maxRetries = 2, signal }: AskOptions<T>): Promise<T> {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let problems = '';
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const reply = await completeWithBackoff(provider, messages, attempt, { signal });
    let data: unknown;
    try {
      data = extractJson(reply);
    } catch (err) {
      problems = `- (root): invalid JSON: ${(err as Error).message}`;
      messages.push({ role: 'assistant', content: reply }, { role: 'user', content: `That was not valid JSON:\n${problems}\nReply with the corrected JSON object only.` });
      continue;
    }
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    problems = formatIssues(result.error);
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: `That JSON did not pass validation:\n${problems}\nFix every problem and reply with the complete corrected JSON object only.` });
  }
  throw new AskError(`The model did not return a valid answer after ${maxRetries + 1} attempts:\n${problems}`);
}
