import type { GameSpec } from '../spec/schema';
import { GENRES, type Genre } from '../spec/gameOptions';

export { GENRES, type Genre };

export const genreName = (id: Genre | undefined): string => GENRES.find((g) => g.id === id)?.name ?? 'Arcade';

/** Best guess at a genre for games made before genres were chosen (or by remix). */
export function guessGenre(spec: GameSpec): Genre {
  if (spec.player.controls === 'platformer') return 'platformer';
  if (spec.win.type === 'survive') return 'survival';
  if (spec.entities.some((e) => e.behavior === 'chase' && e.onCollide.lives < 0)) return 'chase';
  const rewards = spec.entities.filter((e) => e.onCollide.score > 0);
  if (rewards.length >= 2) return 'collector';
  if (rewards.some((e) => e.behavior === 'wander' || e.behavior === 'static')) return 'adventure';
  return 'arcade';
}
