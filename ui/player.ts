import type { FrameMessage } from '../engine/standalone';
import { isGameStatus, type GameStatus } from '../engine/status';
import type { GameSpec } from '../spec/schema';
import { buildGameHtml, loadEngineSource, type PlayOptions } from './gameHtml';

export interface PlayerCallbacks {
  onReady(): void;
  onError(message: string): void;
  /** Live phase/score/lives from the running game; undefined when no game is loaded. */
  onStatus?(status: GameStatus | undefined): void;
  /** An app shortcut pressed while the game had focus. */
  onShortcut?(name: 'palette'): void;
}

/** Hosts games in a sandboxed iframe: scripts only, opaque origin, no access to this app. */
export class GamePlayer {
  private frame?: HTMLIFrameElement;
  private spec?: GameSpec;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: PlayerCallbacks,
    /** Read on every play, so settings changes apply to the next game or restart. */
    private readonly playOptions: () => PlayOptions = () => ({}),
  ) {
    window.addEventListener('message', (e: MessageEvent<FrameMessage>) => {
      // Only trust messages from the frame we created. Its origin is "null" because of the sandbox.
      if (!this.frame || e.source !== this.frame.contentWindow || e.data?.source !== 'game-frame') return;
      if (e.data.type === 'ready') this.callbacks.onReady();
      else if (e.data.type === 'error') this.callbacks.onError(String(e.data.message));
      else if (e.data.type === 'status' && isGameStatus(e.data.status)) this.callbacks.onStatus?.(e.data.status);
      else if (e.data.type === 'shortcut' && e.data.name === 'palette') this.callbacks.onShortcut?.('palette');
    });
  }

  get loaded(): boolean {
    return this.spec !== undefined;
  }

  async play(spec: GameSpec): Promise<void> {
    const html = buildGameHtml(spec, await loadEngineSource(), this.playOptions());
    this.stop();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('allow', 'gamepad'); // controllers work inside the sandboxed game
    frame.title = spec.title;
    frame.srcdoc = html;
    // Give the game keyboard focus when it loads, unless the user moved on while it was loading
    // (clicked into a text field or opened a dialog) — then their focus is left alone.
    let movedOn = false;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.closest('[role="dialog"]')) movedOn = true;
    };
    document.addEventListener('focusin', onFocusIn);
    frame.addEventListener(
      'load',
      () => {
        document.removeEventListener('focusin', onFocusIn);
        if (!movedOn && !document.documentElement.classList.contains('modal-open')) frame.focus();
      },
      { once: true },
    );
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
