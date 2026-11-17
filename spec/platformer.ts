import type { GameSpec } from './schema';
import { PLATFORMER_PHYSICS, STARTER_MAP } from './level';

/**
 * Turn any game into a platformer: platformer controls, gravity and jump, a starter ledge map (unless the game already
 * has one), and rewards that sit on the ledges. Hazards keep their behaviour, except ground-bound wanderers, which patrol.
 */
export function makePlatformer(spec: GameSpec): GameSpec {
  const next = structuredClone(spec);
  next.player.controls = 'platformer';
  next.physics = { ...PLATFORMER_PHYSICS, ...(spec.physics?.gravity ? spec.physics : {}) };
  next.level ??= { tileSize: 40, map: [...STARTER_MAP] };
  const rewards = new Set(next.entities.filter((e) => e.onCollide.score > 0 && e.onCollide.lives >= 0).map((e) => e.id));
  for (const e of next.entities) {
    if (rewards.has(e.id)) {
      e.behavior = 'static';
      e.speed = 0;
    } else if (e.onCollide.lives < 0 && (e.behavior === 'wander' || e.behavior === 'bounce')) {
      e.behavior = 'patrol';
      e.speed = Math.min(e.speed, 110);
    }
  }
  for (const s of next.spawns) {
    const e = next.entities.find((x) => x.id === s.entity);
    if (e && (rewards.has(e.id) || e.behavior === 'patrol')) s.edge = 'platforms';
  }
  return next;
}
