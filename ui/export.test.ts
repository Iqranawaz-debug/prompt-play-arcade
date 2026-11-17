import { describe, expect, it } from 'vitest';
import { fileNameFor } from './export';

describe('fileNameFor', () => {
  it('makes a safe .html file name from the title', () => {
    expect(fileNameFor('Deep Thoughts: Fishing!')).toBe('deep-thoughts-fishing.html');
    expect(fileNameFor('***')).toBe('game.html');
  });
});

describe('describeProgress', () => {
  it('words each phase for the status box', async () => {
    const { describeProgress } = await import('./status');
    expect(describeProgress({ phase: 'generating', attempt: 1 }, 'Gemini 2.5 Flash').phase).toBe('Generating…');
    expect(describeProgress({ phase: 'validating', attempt: 2 }, 'X').phase).toBe('Validating…');
    const retry = describeProgress({ phase: 'retrying', attempt: 2, retry: 1, maxRetries: 2, problems: 3 }, 'X');
    expect(retry).toEqual({ phase: 'Retrying 1/2…', detail: 'Fixing 3 problems' });
  });
});

describe('timeAgo', () => {
  it('formats recent times compactly', async () => {
    const { timeAgo } = await import('./library');
    const now = Date.UTC(2026, 10, 17, 12);
    expect(timeAgo(now - 20_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});

describe('generation progress', () => {
  it('moves forward through the phases and creeps while waiting', async () => {
    const { progressFor, creep } = await import('./status');
    const gen = progressFor({ phase: 'generating', attempt: 1 });
    const val = progressFor({ phase: 'validating', attempt: 1 });
    expect(gen.from).toBeLessThan(val.from);
    expect(creep(gen, 0)).toBe(gen.from);
    expect(creep(gen, 30_000)).toBeGreaterThan(gen.from);
    expect(creep(gen, 1e9)).toBeCloseTo(gen.cap);
  });
});
