import { ZodError } from 'zod';
import { formatIssues } from '../spec/schema';
import { runGame } from './index';
import type { GameStatus } from './status';
import type { SaveState } from '../spec/saveState';
import type { GameHandle } from './index';

declare global {
  interface Window {
    __GAME_SPEC__?: unknown;
    /** Optional player preferences injected by the dashboard (absent in exported files). */
    __GAME_OPTIONS__?: { muted?: boolean; maxZoom?: number; keys?: unknown; resume?: unknown };
  }
}

/** Messages the sandboxed game sends to the app that embeds it. */
type FrameEvent =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'status'; status: GameStatus }
  | { type: 'shortcut'; name: 'palette' }
  | { type: 'snapshot'; id: number; state: SaveState | null };
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

let handle: GameHandle | undefined;
// The dashboard asks for a snapshot when the player saves; only the embedding page may ask.
window.addEventListener('message', (e: MessageEvent<{ source?: string; type?: string; id?: unknown }>) => {
  if (e.source !== window.parent || e.data?.source !== 'game-host' || e.data.type !== 'snapshot-request' || typeof e.data.id !== 'number') return;
  post({ type: 'snapshot', id: e.data.id, state: handle?.snapshot() ?? null });
});

const parent = document.getElementById('game')!;
const prefs = window.__GAME_OPTIONS__ ?? {};
runGame(window.__GAME_SPEC__, parent, {
  muted: prefs.muted === true,
  maxZoom: typeof prefs.maxZoom === 'number' ? prefs.maxZoom : undefined,
  keys: prefs.keys,
  resume: prefs.resume,
  onStatus: (status) => post({ type: 'status', status }),
})
  .then((h) => {
    handle = h;
    post({ type: 'ready' });
  })
  .catch((err: unknown) => {
    parent.textContent = describe(err);
    post({ type: 'error', message: describe(err) });
  });
