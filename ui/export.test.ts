import { describe, expect, it } from 'vitest';
import { fileNameFor } from './export';

describe('fileNameFor', () => {
  it('makes a safe .html file name from the title', () => {
    expect(fileNameFor('Deep Thoughts: Fishing!')).toBe('deep-thoughts-fishing.html');
    expect(fileNameFor('***')).toBe('game.html');
  });
});
