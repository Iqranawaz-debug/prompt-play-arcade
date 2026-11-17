import { levelsOf, type GameSpec } from '../spec/schema';
import { DEFAULT_TILE, maxCols, maxRows, parseLevel } from '../spec/level';
import { jumpReach } from '../spec/reach';
import { optionsBrief, type GameOptions } from '../spec/gameOptions';
import { lintSpec } from '../spec/lint';
import { z } from 'zod';
import { RuleSchema, type Rule } from '../spec/rules';
import { ModSchema, type Mod } from '../spec/mods';
import { CharacterSchema, DebugResultSchema, FramesResultSchema, levelsResultSchema, rulesResultSchema, type DesignedLevel, SpriteResultSchema, StoryboardSchema, type Character, type DebugResult, type Storyboard } from '../spec/tools';
import { askJson } from './ask';
import { SPRITE_RULES, jsonSchema } from './prompt';
import type { ChatProvider } from './providers';

/** What the engine can and cannot do; keeps every tool's suggestions buildable. */
const ENGINE_FACTS = `The engine makes 2D arcade games on a 960 x 540 screen. The player moves freely, left-right, up-down,
or as a platformer (run and jump with gravity). Optional tile maps add walls and ledges, and a game can have up to 8
levels played in order. Entities spawn from screen edges, anywhere, or on top of ledges, and move: straight, zigzag,
chase, flee, wander, bounce, patrol (walks ledges) or static. Touching an entity changes score and/or lives. A level is
won by reaching a score or surviving a time; the game is lost when lives run out or time runs out. There is no
shooting, no inventory and no dialogue.`;

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

// ---------- Animation frames (Animation Studio) ----------
export async function animateSprite(
  provider: ChatProvider,
  sprite: GameSpec['sprites'][string],
  motion: string,
  count: number,
  background: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const result = await askJson(provider, {
    schema: FramesResultSchema,
    signal,
    system: `You animate one sprite for a 2D game by drawing extra frames. The game cycles the original drawing and your
frames in order, so each frame must be the SAME character: same viewBox, colours, size and position, changing only
what the motion needs (legs, wings, arms, tail, flame, eyes). Small changes read best at sprite size.
The game background is ${background}.
${SPRITE_RULES}
Reply with JSON only: {"frames":["<svg ...>...</svg>", ...]} with exactly ${count} frame(s).`,
    user: `Original sprite:\n${JSON.stringify({ svg: sprite.svg, width: sprite.width, height: sprite.height })}\n\nMotion to animate:\n"""${motion}"""`,
  });
  return result.frames.slice(0, count);
}

// ---------- Level design (AI Level Designer) ----------
export async function designLevels(
  provider: ChatProvider,
  spec: GameSpec,
  request: string,
  count: number,
  signal?: AbortSignal,
): Promise<DesignedLevel[]> {
  const platformer = spec.player.controls === 'platformer';
  const existing = levelsOf(spec);
  const cols = maxCols(DEFAULT_TILE);
  const rows = maxRows(DEFAULT_TILE);
  const reach = platformer && spec.physics ? jumpReach(parseLevel({ tileSize: DEFAULT_TILE, map: [''] }), { platformer, speed: spec.player.speed, jump: spec.physics.jump, gravity: spec.physics.gravity }) : undefined;
  const rules = platformer
    ? `This is a PLATFORMER. The bottom row should be solid ground ("#" x ${cols}). The player can jump at most ${reach?.up} rows
up and about ${reach?.across} columns across, so every ledge must be reachable by a chain of jumps from the start.
Ledges are horizontal runs of "#" 2-8 long, at least 2 rows apart vertically. Leave the top 2 rows mostly empty.`
    : `This is a TOP-DOWN game: "#" tiles are walls seen from above. Every empty tile must be reachable from the start (no
sealed rooms); keep corridors at least 2 tiles wide, and keep the outer edge mostly open so entities can enter.`;
  const result = await askJson(provider, {
    schema: levelsResultSchema(spec, count),
    signal,
    system: `You design tile-map levels for an existing 2D game.
${ENGINE_FACTS}
Each level: {"name", "tileSize": 40, "map": [...]} where map is up to ${rows} strings (rows, top to bottom) of up to ${cols}
characters: "#" = wall/ledge, "." = empty, and optionally one "P" = player start. Short rows are padded with empty.
${rules}
Make the levels fit the game's theme and get gradually harder (more hazards' room to roam, trickier jumps, tighter paths).
Give each level a short evocative name.
Reply with JSON only: {"levels":[{"name","tileSize","map"}]} with exactly ${count} level(s).`,
    user: `The game:\n${JSON.stringify({ title: spec.title, description: spec.description, player: spec.player, physics: spec.physics, entities: spec.entities.map((e) => ({ name: e.name, behavior: e.behavior })) })}\n\n` +
      (existing.length ? `Its current levels (new ones are added after these):\n${JSON.stringify(existing)}\n\n` : '') +
      `Request:\n"""${request}"""`,
  });
  return result.levels.slice(0, count);
}

// ---------- Rule writing (Logic Builder) ----------
export async function writeRules(provider: ChatProvider, spec: GameSpec, request: string, signal?: AbortSignal): Promise<Rule[]> {
  const result = await askJson(provider, {
    schema: rulesResultSchema(spec),
    signal,
    system: `You add game logic rules to an existing 2D game. ${ENGINE_FACTS}
A rule is {"name", "when", "if": [conditions], "then": [actions]} and the engine runs it while the game plays.
JSON Schema of one rule:
${JSON.stringify(z.toJSONSchema(RuleSchema, { io: 'input' }))}
Use only these entity ids: ${spec.entities.map((e) => `"${e.id}" (${e.name})`).join(', ')}.
Prefer 1-3 small rules that do exactly what the player asked. Keep messages short and fun.
Reply with JSON only: {"rules":[...]}`,
    user: `The game:\n${JSON.stringify({ title: spec.title, win: spec.win, lose: spec.lose, player: { lives: spec.player.lives, speed: spec.player.speed }, entities: spec.entities.map((e) => ({ id: e.id, name: e.name, behavior: e.behavior, onCollide: e.onCollide })), rules: spec.rules ?? [] })}\n\nRequest:\n"""${request}"""`,
  });
  return result.rules;
}

// ---------- Mod writing (Game Modding) ----------
export async function writeMod(provider: ChatProvider, request: string, signal?: AbortSignal): Promise<Mod> {
  return askJson(provider, {
    schema: ModSchema,
    signal,
    system: `You design mods for a 2D game maker. A mod is a reusable list of operations that works on ANY game made with it.
${ENGINE_FACTS}
Operations scale speeds, spawn rates, sprite sizes, lives, time limits and score targets, recolour the theme, change
music or gravity, remove hazards, or add rules. Inside rules, refer to the game's main hazard as "@hazard" and its main
reward as "@reward" (never other entity ids). Use 1-6 operations that capture the request; set v to 1, a short
lowercase-dash id, a catchy name and a one-sentence description.
JSON Schema:
${JSON.stringify(z.toJSONSchema(ModSchema, { io: 'input' }))}
Reply with JSON only.`,
    user: `Mod idea:\n"""${request}"""`,
  });
}
