import { z } from 'zod';
import { GameSpecSchema, type GameSpec } from '../spec/schema';
import { optionsBrief, type GameOptions } from '../spec/gameOptions';
import { cometCourier } from '../spec/examples/cometCourier';
import { philosopherFishing } from '../spec/examples/philosopherFishing';

export const jsonSchema = JSON.stringify(z.toJSONSchema(GameSpecSchema, { io: 'input', unrepresentable: 'any' }));

/** How to draw sprites; shared by game generation, the character creator and the asset studio. */
export const SPRITE_RULES = `Sprites (inline SVG, shown at only 24-64 px, so they must read instantly):
- Include xmlns="http://www.w3.org/2000/svg" and a viewBox with the same aspect ratio as width/height.
  Keep every shape inside the viewBox. No <text>, <script>, event handlers, images or external hrefs. Under 2000 characters.
- Before drawing, decide the ONE feature that makes the thing recognisable (a hedgehog's spikes, a beetle's legs and
  shell line, a mushroom's cap and stem, a fish's tail fin) and make it big and obvious. Exaggerate like a sticker.
- Use 4-12 simple primitives (circle, ellipse, rect with rx, polygon, short paths). Draw spikes, legs and petals as
  separate polygons or thick round-capped strokes (stroke-width 2-4), never as one thin zig-zag.
- Paint back to front: glow/shadow, then legs/spikes/tail, then body, then details, then eyes LAST. Anything drawn
  later covers what came before, so never draw a body over the eyes.
- Contrast: every sprite's main colour must stand out clearly from theme.background (bright, saturated colours on dark
  backgrounds, deep colours on light ones). Give the body a darker outline stroke (stroke-width 1.5-2.5) so it never
  blends in. Avoid greys and browns that are close to the background's brightness.
- Living creatures get eyes: a white circle with a dark pupil.
- Machines, vehicles and objects are drawn as the real thing, not as a face: show its 2-3 signature parts from one
  consistent viewpoint (top-down for floor, table and arena games; side-on otherwise). E.g. a robot vacuum seen from
  above = round body, darker bumper ring around the front, small sensor turret, two side brushes sticking out; a car =
  body, windows, wheels. Add small eyes only if the idea calls the object cute or alive, and never let them replace
  the signature parts.
- Make the player the most distinctive sprite (40-64 px).
  Rewards should look appealing (bright, warm), hazards should look dangerous (spikes, angry eyes, red or purple).
- "Glowing" things: put a larger circle or ellipse behind them in a light colour with fill-opacity 0.25-0.4.`;

export const SYSTEM_PROMPT = `You design small, fun 2D arcade games for a fixed game engine.
You never write code. You reply with ONE JSON object that matches the JSON Schema below, and nothing else.

How the engine works:
- The screen is 800x600 pixels. The player sprite moves with arrow keys/WASD or by dragging.
- Entities spawn from screen edges on timers (spawns[]) and move by "behavior".
- When the player touches an entity, onCollide applies: score change, lives change, optional destroy, and one of its quotes pops up.
- The game is lost when lives reach 0 (or the optional time limit runs out). It is won by reaching a score target or surviving N seconds.

Rules:
- "version" is always 1. Ids are lowercase snake_case. Colours are "#rrggbb".
- Every sprite referenced by player/entities must exist in "sprites"; every spawn.entity must exist in "entities".
- Give entities personality through names and short quotes that fit the user's idea.
- Set "faces" to "left" or "right" for sprites drawn facing a direction (fish, cars), otherwise "none".

${SPRITE_RULES}

Balance (the validator enforces the first two):
- A chasing hazard (behavior "chase" with negative lives) must have speed at most 75% of player.speed.
- With a score win and a time limit, the target must be at most 60% of the points that can spawn in that time.
- Rewards should spawn more often than hazards. Hazards start after a short startDelayMs so the player can settle in.
  Use 2-6 entities.

JSON Schema:
${jsonSchema}

Example 1:
${JSON.stringify(philosopherFishing)}

Example 2:
${JSON.stringify(cometCourier)}`;

export function userPrompt(idea: string, options?: GameOptions): string {
  const settings = options ? `\n\n${optionsBrief(options)}` : '';
  return `Design a game for this idea:\n"""${idea}"""${settings}\nReply with the JSON object only.`;
}

export function remixPrompt(base: GameSpec, changes: string): string {
  return (
    `Here is an existing game:\n${JSON.stringify(base)}\n\n` +
    `Remix it with these changes:\n"""${changes}"""\n` +
    'Keep everything the changes do not touch. Reply with the complete new JSON object only.'
  );
}

export function retryPrompt(problems: string): string {
  return `That JSON did not pass validation:\n${problems}\nFix every problem and reply with the complete corrected JSON object only.`;
}
