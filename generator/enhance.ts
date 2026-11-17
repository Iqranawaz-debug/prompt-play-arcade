import { z } from 'zod';
import { optionsBrief, type GameOptions } from '../spec/gameOptions';
import { extractJson } from './generate';
import type { ChatMessage, ChatProvider } from './providers';

const ENHANCE_SYSTEM = `You help people describe small 2D arcade games for a fixed game engine.
Turn the user's rough idea into a vivid game description of 2 to 4 sentences (at most 600 characters).
Mention: the player character and how it moves, what it collects for points, the obstacles or enemies and how they move,
the goal (reach a score or survive a time), and the setting and mood. Keep the user's idea and tone; add, don't replace.
Only use mechanics the engine supports: a player moving freely, left-right or up-down; things that fall, drift, zigzag,
chase, flee, wander, bounce or stay still; touching things to gain points or lose lives; a score target or a survival timer.
No puzzles, dialogue trees, inventories, levels or shooting.
Reply with JSON only: {"prompt": "..."}`;

const Reply = z.object({ prompt: z.string().trim().min(20).max(800) });

export class EnhanceError extends Error {}

/** Rewrite a short idea into a richer description (one retry if the reply is malformed). */
export async function enhanceIdea(provider: ChatProvider, idea: string, options?: GameOptions, signal?: AbortSignal): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ENHANCE_SYSTEM },
    { role: 'user', content: `Idea:\n"""${idea}"""${options ? `\n\n${optionsBrief(options)}` : ''}` },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await provider.complete(messages, signal);
    try {
      return Reply.parse(extractJson(reply)).prompt;
    } catch {
      messages.push({ role: 'assistant', content: reply }, { role: 'user', content: 'Reply with JSON only, exactly: {"prompt": "<2-4 sentences>"}' });
    }
  }
  throw new EnhanceError('The model did not return an enhanced prompt. Try again.');
}
