import type { Behavior, SpawnSpec } from '../spec/schema';

export interface Vec {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** An axis-aligned area, e.g. the playfield below the HUD. */
export interface Rect extends Size {
  x: number;
  y: number;
}

export interface MoverState {
  dir: Vec;
  ageMs: number;
  phase: number;
  turnInMs: number;
  leaving: boolean;
}

type Rng = () => number;

/** After this long, roaming entities stop roaming and leave the screen. */
export const LIFETIME_MS = 15000;
/** Behaviors that stay inside the play area (bouncing off walls) until they leave. */
export const CONTAINED: ReadonlySet<Behavior> = new Set(['bounce', 'wander', 'chase', 'flee']);

const norm = (v: Vec): Vec => {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
};

const rotate = (v: Vec, a: number): Vec => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});

/** Where a new entity appears (just outside the given edge of the field) and which way it heads. */
export function placeSpawn(
  edge: SpawnSpec['edge'],
  size: Size,
  field: Rect,
  player: Vec,
  rng: Rng = Math.random,
): { pos: Vec; dir: Vec } {
  const resolved = edge === 'sides' ? (rng() < 0.5 ? 'left' : 'right') : edge;
  const margin = 40;
  const randX = () => field.x + margin + rng() * (field.w - margin * 2);
  const randY = () => field.y + margin + rng() * (field.h - margin * 2);
  switch (resolved) {
    case 'top':
      return { pos: { x: randX(), y: field.y - size.h / 2 }, dir: { x: 0, y: 1 } };
    case 'bottom':
      return { pos: { x: randX(), y: field.y + field.h + size.h / 2 }, dir: { x: 0, y: -1 } };
    case 'left':
      return { pos: { x: field.x - size.w / 2, y: randY() }, dir: { x: 1, y: 0 } };
    case 'right':
      return { pos: { x: field.x + field.w + size.w / 2, y: randY() }, dir: { x: -1, y: 0 } };
    case 'anywhere': {
      // Avoid spawning right on top of the player.
      let pos = { x: randX(), y: randY() };
      for (let i = 0; i < 8 && Math.hypot(pos.x - player.x, pos.y - player.y) < 150; i++) {
        pos = { x: randX(), y: randY() };
      }
      return { pos, dir: rotate({ x: 1, y: 0 }, rng() * Math.PI * 2) };
    }
  }
}

export function newMover(dir: Vec, behavior: Behavior, rng: Rng = Math.random): MoverState {
  const spread = behavior === 'bounce' || behavior === 'wander' ? (rng() - 0.5) * 1.2 : 0;
  return { dir: rotate(dir, spread), ageMs: 0, phase: rng() * Math.PI * 2, turnInMs: 1000, leaving: false };
}

/** Advance a mover by dtMs and return its velocity in px/s. Mutates `state`. */
export function steer(
  behavior: Behavior,
  state: MoverState,
  pos: Vec,
  player: Vec,
  speed: number,
  dtMs: number,
  rng: Rng = Math.random,
): Vec {
  state.ageMs += dtMs;
  if (CONTAINED.has(behavior) && state.ageMs > LIFETIME_MS) state.leaving = true;
  if (state.leaving) return { x: state.dir.x * speed, y: state.dir.y * speed };

  switch (behavior) {
    case 'static':
      return { x: 0, y: 0 };
    case 'straight':
    case 'bounce':
      return { x: state.dir.x * speed, y: state.dir.y * speed };
    case 'zigzag': {
      const wave = Math.sin(state.ageMs / 250 + state.phase) * speed * 0.8;
      return { x: state.dir.x * speed - state.dir.y * wave, y: state.dir.y * speed + state.dir.x * wave };
    }
    case 'chase':
      state.dir = norm({ x: player.x - pos.x, y: player.y - pos.y });
      return { x: state.dir.x * speed, y: state.dir.y * speed };
    case 'flee': {
      const away = { x: pos.x - player.x, y: pos.y - player.y };
      state.dir = norm(away);
      const urgency = Math.hypot(away.x, away.y) < 220 ? 1 : 0.25;
      return { x: state.dir.x * speed * urgency, y: state.dir.y * speed * urgency };
    }
    case 'wander':
      state.turnInMs -= dtMs;
      if (state.turnInMs <= 0) {
        state.dir = rotate(state.dir, (rng() - 0.5) * Math.PI);
        state.turnInMs = 800 + rng() * 1200;
      }
      return { x: state.dir.x * speed, y: state.dir.y * speed };
  }
}

/** Reflect a velocity (and the mover's heading) off the field walls it is pressing against. */
export function bounceOffWalls(state: MoverState, vel: Vec, pos: Vec, half: Size, field: Rect): Vec {
  const out = { ...vel };
  if ((pos.x < field.x + half.w && vel.x < 0) || (pos.x > field.x + field.w - half.w && vel.x > 0)) {
    out.x = -vel.x;
    state.dir.x = -state.dir.x;
  }
  if ((pos.y < field.y + half.h && vel.y < 0) || (pos.y > field.y + field.h - half.h && vel.y > 0)) {
    out.y = -vel.y;
    state.dir.y = -state.dir.y;
  }
  return out;
}

export const isInside = (pos: Vec, half: Size, field: Rect): boolean =>
  pos.x >= field.x + half.w &&
  pos.x <= field.x + field.w - half.w &&
  pos.y >= field.y + half.h &&
  pos.y <= field.y + field.h - half.h;

export const isFarOutside = (pos: Vec, half: Size, field: Rect, margin = 80): boolean =>
  pos.x < field.x - half.w - margin ||
  pos.x > field.x + field.w + half.w + margin ||
  pos.y < field.y - half.h - margin ||
  pos.y > field.y + field.h + half.h + margin;
