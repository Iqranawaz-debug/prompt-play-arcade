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

/** Where the progress bar sits for a phase: it starts at `from` and creeps toward `cap` while waiting. */
export interface ProgressRange {
  from: number;
  cap: number;
}

export function progressFor(p: GenerateProgress): ProgressRange {
  switch (p.phase) {
    case 'generating':
      return p.attempt === 1 ? { from: 0.12, cap: 0.7 } : { from: 0.55, cap: 0.8 };
    case 'validating':
      return { from: 0.85, cap: 0.9 };
    case 'retrying':
      return { from: 0.5 + 0.1 * (p.retry - 1), cap: 0.8 };
    case 'busy':
      return { from: 0.1, cap: 0.15 };
  }
}

/** Ease from `from` toward `cap` over time, so a long model call still shows movement. */
export function creep(range: ProgressRange, elapsedMs: number): number {
  return range.from + (range.cap - range.from) * (1 - Math.exp(-elapsedMs / 15000));
}

/** The orange box that exists only while a generation is running, with a live progress bar. */
export class StatusBox {
  private timer?: number;
  private started = 0;
  private phaseStarted = 0;
  private detail = '';
  private range: ProgressRange = { from: 0.08, cap: 0.6 };

  constructor(
    private readonly box: HTMLElement,
    private readonly phaseEl: HTMLElement,
    private readonly detailEl: HTMLElement,
    private readonly fillEl?: HTMLElement,
  ) {}

  start(phase: string, detail: string): void {
    this.started = Date.now();
    this.set(phase, detail, { from: 0.08, cap: 0.6 });
    this.box.hidden = false;
    this.timer = window.setInterval(() => this.render(), 500);
  }

  set(phase: string, detail: string, range?: ProgressRange): void {
    this.phaseEl.textContent = phase;
    this.detail = detail;
    if (range) {
      this.range = range;
      this.phaseStarted = Date.now();
    }
    this.render();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.box.hidden = true;
    this.phaseEl.textContent = '';
    this.detailEl.textContent = '';
    if (this.fillEl) this.fillEl.style.width = '0%';
  }

  private render(): void {
    const secs = Math.round((Date.now() - this.started) / 1000);
    this.detailEl.textContent = `${this.detail} · ${secs}s`;
    if (this.fillEl) this.fillEl.style.width = `${(creep(this.range, Date.now() - this.phaseStarted) * 100).toFixed(1)}%`;
  }
}
