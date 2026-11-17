import { ZodError } from 'zod';
import { formatIssues } from '../spec/schema';
import { runGame } from './index';

declare global {
  interface Window {
    __GAME_SPEC__?: unknown;
  }
}

/** Messages the sandboxed game sends to the app that embeds it. */
type FrameEvent = { type: 'ready' } | { type: 'error'; message: string };
export type FrameMessage = FrameEvent & { source: 'game-frame' };

function post(msg: FrameEvent): void {
  if (window.parent !== window) window.parent.postMessage({ source: 'game-frame', ...msg }, '*');
}

const describe = (err: unknown) =>
  err instanceof ZodError ? `Invalid game spec:\n${formatIssues(err)}` : err instanceof Error ? err.message : String(err);

window.addEventListener('error', (e) => post({ type: 'error', message: e.message }));

const parent = document.getElementById('game')!;
runGame(window.__GAME_SPEC__, parent)
  .then(() => post({ type: 'ready' }))
  .catch((err: unknown) => {
    parent.textContent = describe(err);
    post({ type: 'error', message: describe(err) });
  });
