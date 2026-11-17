import type { FrameMessage } from '../engine/standalone';
import type { GameSpec } from '../spec/schema';
import { buildGameHtml, loadEngineSource } from './gameHtml';

export interface PlayerCallbacks {
  onReady(): void;
  onError(message: string): void;
}

/** Hosts games in a sandboxed iframe: scripts only, opaque origin, no access to this app. */
export class GamePlayer {
  private frame?: HTMLIFrameElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: PlayerCallbacks,
  ) {
    window.addEventListener('message', (e: MessageEvent<FrameMessage>) => {
      // Only trust messages from the frame we created. Its origin is "null" because of the sandbox.
      if (!this.frame || e.source !== this.frame.contentWindow || e.data?.source !== 'game-frame') return;
      if (e.data.type === 'ready') this.callbacks.onReady();
      else if (e.data.type === 'error') this.callbacks.onError(String(e.data.message));
    });
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
  }

  stop(): void {
    this.frame?.remove();
    this.frame = undefined;
  }
}
