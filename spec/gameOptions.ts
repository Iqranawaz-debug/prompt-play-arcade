import { z } from 'zod';

/**
 * Choices made before generating a game. Shared by the UI (form), the server (validation) and the prompt.
 * Genres are limited to what the engine can deliver: it makes arcade-style games (move, collect, dodge, chase, survive).
 */
export const GENRES = [
  { id: 'arcade', name: 'Arcade', hint: 'Fast reflex scoring' },
  { id: 'collector', name: 'Collector', hint: 'Gather many kinds of items' },
  { id: 'survival', name: 'Survival', hint: 'Last until the clock runs out' },
  { id: 'chase', name: 'Chase', hint: 'Outrun things that hunt you' },
  { id: 'adventure', name: 'Adventure', hint: 'Explore a calm world and discover things' },
] as const;

export const DIFFICULTIES = [
  { id: 'easy', name: 'Easy' },
  { id: 'normal', name: 'Normal' },
  { id: 'hard', name: 'Hard' },
] as const;

export const DURATIONS = [
  { id: 'short', name: 'Short', seconds: 45 },
  { id: 'medium', name: 'Medium', seconds: 90 },
  { id: 'long', name: 'Long', seconds: 180 },
] as const;

export const STYLES = [
  { id: 'cute', name: 'Cute', brief: 'soft rounded shapes, friendly faces, pastel colours' },
  { id: 'retro', name: 'Retro', brief: 'chunky 8-bit inspired shapes, bold limited palette' },
  { id: 'neon', name: 'Neon', brief: 'glowing neon outlines on a very dark background' },
  { id: 'minimal', name: 'Minimal', brief: 'simple geometric shapes, two or three colours, lots of contrast' },
  { id: 'spooky', name: 'Spooky', brief: 'playful night-time spooky look, purples and greens' },
] as const;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as unknown as [T[number]['id'], ...T[number]['id'][]];

export const GameOptionsSchema = z.object({
  genre: z.enum(ids(GENRES)),
  difficulty: z.enum(ids(DIFFICULTIES)),
  duration: z.enum(ids(DURATIONS)),
  style: z.enum(ids(STYLES)),
  sound: z.boolean(),
});
export type GameOptions = z.infer<typeof GameOptionsSchema>;
export type Genre = GameOptions['genre'];

export const DEFAULT_OPTIONS: GameOptions = { genre: 'arcade', difficulty: 'normal', duration: 'medium', style: 'cute', sound: true };

const DIFFICULTY_BRIEF: Record<GameOptions['difficulty'], string> = {
  easy: 'Easy: generous lives (4-5), slow hazards, frequent rewards, a low score target.',
  normal: 'Normal: 3 lives, balanced hazards and rewards.',
  hard: 'Hard: 1-2 lives, faster and more frequent hazards, a demanding but reachable target.',
};

const GENRE_BRIEF: Record<Genre, string> = {
  arcade: 'Arcade: quick scoring with a mix of rewards and hazards.',
  collector: 'Collector: at least two different kinds of rewards worth different points.',
  survival: 'Survival: use a "survive" win condition; hazards ramp up over time.',
  chase: 'Chase: include at least one hazard with the "chase" behavior that the player must outrun.',
  adventure: 'Adventure: a calm world to explore with wandering or static discoveries and few hazards.',
};

/** Extra lines for the model describing the player's chosen settings. */
export function optionsBrief(o: GameOptions): string {
  const duration = DURATIONS.find((d) => d.id === o.duration)!;
  const style = STYLES.find((s) => s.id === o.style)!;
  return [
    'Player settings (follow them):',
    `- Genre ${GENRE_BRIEF[o.genre]}`,
    `- Difficulty ${DIFFICULTY_BRIEF[o.difficulty]}`,
    `- Duration: a round should last about ${duration.seconds} seconds (use a time limit or survive time near that).`,
    `- Visual style: ${style.brief}.`,
    o.sound ? '- Sound: choose fitting "sfx" for collisions.' : '- Sound: the player wants a quiet game; set every onCollide "sfx" to "none".',
  ].join('\n');
}
