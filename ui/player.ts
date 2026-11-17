import type { FrameMessage } from '../engine/standalone';
import { isGameStatus, type GameStatus } from '../engine/status';
import type { GameSpec } from '../spec/schema';
import { buildGameHtml, loadEngineSource } from './gameHtml';

export interface PlayerCallbacks {
  onReady(): void;
  onError(message: string): void;
  /** Live phase/score/lives from the running game; undefined when no game is loaded. */
  onStatus?(status: GameStatus | undefined): void;
}

/** Hosts games in a sandboxed iframe: scripts only, opaque origin, no access to this app. */
export class GamePlayer {
  private frame?: HTMLIFrameElement;
  private spec?: GameSpec;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: PlayerCallbacks,
  ) {
    window.addEventListener('message', (e: MessageEvent<FrameMessage>) => {
      // Only trust messages from the frame we created. Its origin is "null" because of the sandbox.
      if (!this.frame || e.source !== this.frame.contentWindow || e.data?.source !== 'game-frame') return;
      if (e.data.type === 'ready') this.callbacks.onReady();
      else if (e.data.type === 'error') this.callbacks.onError(String(e.data.message));
      else if (e.data.type === 'status' && isGameStatus(e.data.status)) this.callbacks.onStatus?.(e.data.status);
    });
  }

  get loaded(): boolean {
    return this.spec !== undefined;
  }

  async play(spec: GameSpec): Promise<void> {
    const html = buildGameHtml(spec, await loadEngineSource());
    this.stop();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.title = spec.title;
    frame.srcdoc = html;
    frame.addEventListener('load', () => frame.focus());
    this.host.replaceChildren(frame);
    this.frame = frame;
    this.spec = spec;
  }

  /** Start the current game from scratch by rebuilding its frame. */
  async restart(): Promise<void> {
    if (this.spec) await this.play(this.spec);
  }

  stop(): void {
    this.frame?.remove();
    this.frame = undefined;
    this.spec = undefined;
    this.callbacks.onStatus?.(undefined);
  }

  get isFullscreen(): boolean {
    return document.fullscreenElement === this.host;
  }

  async toggleFullscreen(): Promise<void> {
    if (this.isFullscreen) await document.exitFullscreen();
    else await this.host.requestFullscreen();
    this.frame?.focus();
  }
}
