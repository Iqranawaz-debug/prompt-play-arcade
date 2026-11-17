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
