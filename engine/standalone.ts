import { ZodError } from 'zod';
import { formatIssues } from '../spec/schema';
import { runGame } from './index';
import type { GameStatus } from './status';

declare global {
  interface Window {
    __GAME_SPEC__?: unknown;
    /** Optional player preferences injected by the dashboard (absent in exported files). */
    __GAME_OPTIONS__?: { muted?: boolean; maxZoom?: number };
  }
}

/** Messages the sandboxed game sends to the app that embeds it. */
type FrameEvent =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'status'; status: GameStatus }
  | { type: 'shortcut'; name: 'palette' };
export type FrameMessage = FrameEvent & { source: 'game-frame' };

function post(msg: FrameEvent): void {
  if (window.parent !== window) window.parent.postMessage({ source: 'game-frame', ...msg }, '*');
}

const describe = (err: unknown) =>
  err instanceof ZodError ? `Invalid game spec:\n${formatIssues(err)}` : err instanceof Error ? err.message : String(err);

window.addEventListener('error', (e) => post({ type: 'error', message: e.message }));
// The game has keyboard focus while playing; pass the app's Ctrl/Cmd+K through to the dashboard.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    post({ type: 'shortcut', name: 'palette' });
  }
});

const parent = document.getElementById('game')!;
const prefs = window.__GAME_OPTIONS__ ?? {};
runGame(window.__GAME_SPEC__, parent, {
  muted: prefs.muted === true,
  maxZoom: typeof prefs.maxZoom === 'number' ? prefs.maxZoom : undefined,
  onStatus: (status) => post({ type: 'status', status }),
})
  .then(() => post({ type: 'ready' }))
  .catch((err: unknown) => {
    parent.textContent = describe(err);
    post({ type: 'error', message: describe(err) });
  });
