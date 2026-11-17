import { describe, expect, it } from 'vitest';
import { SaveStateSchema, describeSave, type SaveState } from './saveState';

const save: SaveState = {
  v: 1,
  levelIndex: 1,
  carried: 10,
  score: 4,
  lives: 2,
  elapsedMs: 37_400,
  player: { pos: { x: 100, y: 200 }, vel: { x: 0, y: -300 }, flip: true },
  entities: [{ id: 'beetle', pos: { x: 1, y: 2 }, vel: { x: 70, y: 0 }, entered: true, mover: { dir: { x: 1, y: 0 }, ageMs: 900, phase: 1, turnInMs: 1000, leaving: false } }],
};

describe('save states', () => {
  it('accepts a snapshot and rejects tampered ones', () => {
    expect(SaveStateSchema.safeParse(save).success).toBe(true);
    expect(SaveStateSchema.safeParse({ ...save, lives: 0 }).success).toBe(false);
    expect(SaveStateSchema.safeParse({ ...save, elapsedMs: Infinity }).success).toBe(false);
    expect(SaveStateSchema.safeParse({ ...save, entities: Array(201).fill(save.entities[0]) }).success).toBe(false);
  });

  it('describes a save in one line', () => {
    expect(describeSave(save, 'Fireflies', 3)).toBe('Level 2 · 14 fireflies · 2 lives · 0:37');
    expect(describeSave({ ...save, lives: 1 }, 'Points', 1)).toBe('14 points · 1 life · 0:37');
  });
});
