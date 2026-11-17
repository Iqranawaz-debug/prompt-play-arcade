import type { GameSpec } from '../spec/schema';
import { optionsBrief, type GameOptions } from '../spec/gameOptions';
import { lintSpec } from '../spec/lint';
import { CharacterSchema, DebugResultSchema, SpriteResultSchema, StoryboardSchema, type Character, type DebugResult, type Storyboard } from '../spec/tools';
import { askJson } from './ask';
import { SPRITE_RULES, jsonSchema } from './prompt';
import type { ChatProvider } from './providers';

/** What the engine can and cannot do; keeps every tool's suggestions buildable. */
const ENGINE_FACTS = `The engine makes 2D arcade games on a 960 x 540 screen. The player moves freely, left-right or up-down
(arrow keys/WASD or dragging). Entities spawn from screen edges and move: straight, zigzag, chase, flee, wander,
bounce or static. Touching an entity changes score and/or lives. A round is won by reaching a score or surviving
a time; it is lost when lives run out or time runs out. There is no gravity, no jumping, no walls, no shooting,
no inventory and no dialogue.`;

// ---------- Storyboard ----------
export function makeStoryboard(provider: ChatProvider, idea: string, options?: GameOptions, signal?: AbortSignal): Promise<Storyboard> {
  return askJson(provider, {
    schema: StoryboardSchema,
    signal,
    system: `You are a game designer. Turn the player's idea into a short storyboard for a game this engine can build.
${ENGINE_FACTS}
Exactly one character has role "player". Include at least one "reward" (something to collect) and, unless the idea is very calm, one or more "hazard" characters to avoid.
"levels" are 1-4 stages of rising difficulty within one game. Keep every field short and concrete.
Reply with JSON only: {"title","logline","story","characters":[{"name","role","look","behavior"}],"levels":[{"name","setting","challenge"}],"objectives":[],"obstacles":[],"win","lose"}`,
    user: `Idea:\n"""${idea}"""${options ? `\n\n${optionsBrief(options)}` : ''}`,
  });
}

// ---------- Character ----------
export function makeCharacter(provider: ChatProvider, description: string, background: string, signal?: AbortSignal): Promise<Character> {
  return askJson(provider, {
    schema: CharacterSchema,
    signal,
    system: `You create a playable character for an arcade game engine from a description of its appearance, personality,
abilities and movement.
${ENGINE_FACTS}
Map abilities onto what exists: "speed" (40-700 px/s; 220 is normal, 320+ is fast), "lives" (1-9; tough characters get
more), and "controls" ("free", or "horizontal"/"vertical" for characters that only move along one axis).
The game background is ${background}; draw the sprite so it stands out against it.
${SPRITE_RULES}
Reply with JSON only: {"name","sprite":{"svg","width","height","faces"},"personality","quotes":[],"speed","lives","controls","abilities"}`,
    user: `Character description:\n"""${description}"""`,
  });
}

// ---------- Debugger ----------
export function debugGame(provider: ChatProvider, spec: GameSpec, problem: string, signal?: AbortSignal): Promise<DebugResult> {
  const findings = lintSpec(spec)
    .map((f) => `- ${f.issue} Fix: ${f.fix}`)
    .join('\n');
  return askJson(provider, {
    schema: DebugResultSchema,
    signal,
    maxRetries: 2,
    system: `You debug games for a fixed arcade engine. Games are JSON specs (never code); fixing a game means changing its spec.
${ENGINE_FACTS}
How players control games: arrow keys or WASD, or drag. They click the game or press Space on the start card first;
the game only receives keys while it has focus. M toggles sound.
Explain the most likely causes of the player's problem in plain words, then propose fixes. If the spec should change,
set "changed": true and return the COMPLETE fixed spec in "spec" (valid against the schema; change only what the fix
needs and keep everything else identical). If the cause is outside the spec (e.g. focus), set "changed": false.
JSON Schema of a game spec:
${jsonSchema}
Reply with JSON only: {"diagnosis","causes":[{"issue","fix"}],"changed","spec"?}`,
    user: `Problem reported by the player:\n"""${problem}"""\n\nAutomatic checks found:\n${findings || '- nothing unusual'}\n\nThe game spec:\n${JSON.stringify(spec)}`,
  });
}

// ---------- Sprite redraw (Asset Studio) ----------
export async function redrawSprite(
  provider: ChatProvider,
  sprite: GameSpec['sprites'][string],
  change: string,
  background: string,
  signal?: AbortSignal,
): Promise<GameSpec['sprites'][string]> {
  const result = await askJson(provider, {
    schema: SpriteResultSchema,
    signal,
    system: `You redraw one sprite for an arcade game. Keep its role and size unless asked; apply the requested change.
The game background is ${background}.
${SPRITE_RULES}
Reply with JSON only: {"sprite":{"svg","width","height","faces"}}`,
    user: `Current sprite:\n${JSON.stringify(sprite)}\n\nChange requested:\n"""${change}"""`,
  });
  return result.sprite;
}
