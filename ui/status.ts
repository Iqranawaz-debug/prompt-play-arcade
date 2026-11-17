import type { GenerateProgress } from '../generator/generate';

/** Live status text for a generation phase, e.g. "Retrying 1/2…". */
export function describeProgress(p: GenerateProgress, model: string): { phase: string; detail: string } {
  switch (p.phase) {
    case 'generating':
      return { phase: 'Generating…', detail: `Asking ${model}` };
    case 'validating':
      return { phase: 'Validating…', detail: `Checking attempt ${p.attempt}` };
    case 'retrying':
      return {
        phase: `Retrying ${p.retry}/${p.maxRetries}…`,
        detail: `Fixing ${p.problems} problem${p.problems === 1 ? '' : 's'}`,
      };
    case 'busy':
      return {
        phase: `Model busy, retrying in ${Math.round(p.delayMs / 1000)}s…`,
        detail: `${p.status ? `HTTP ${p.status}, ` : ''}wait ${p.wait}/${p.maxWaits}`,
      };
  }
}

/** The orange box that exists only while a generation is running. */
export class StatusBox {
  private timer?: number;
  private started = 0;
  private detail = '';

  constructor(
    private readonly box: HTMLElement,
    private readonly phaseEl: HTMLElement,
    private readonly detailEl: HTMLElement,
  ) {}

  start(phase: string, detail: string): void {
    this.started = Date.now();
    this.set(phase, detail);
    this.box.hidden = false;
    this.timer = window.setInterval(() => this.render(), 1000);
  }

  set(phase: string, detail: string): void {
    this.phaseEl.textContent = phase;
    this.detail = detail;
    this.render();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.box.hidden = true;
    this.phaseEl.textContent = '';
    this.detailEl.textContent = '';
  }

  private render(): void {
    const secs = Math.round((Date.now() - this.started) / 1000);
    this.detailEl.textContent = `${this.detail} · ${secs}s`;
  }
}
