import type { EntitySpec } from '../spec/schema';

export type SoundName = 'pickup' | 'big' | 'hurt' | 'heal' | 'pop' | 'start' | 'win' | 'lose';

interface Note {
  /** Start frequency (Hz), optional glide target, start offset and duration (s). */
  f: number;
  to?: number;
  t: number;
  d: number;
  type: OscillatorType;
  v?: number;
}

const seq = (freqs: number[], step: number, d: number, type: OscillatorType): Note[] =>
  freqs.map((f, i) => ({ f, t: i * step, d, type }));

/** Every sound is synthesised from oscillators: no audio files, nothing to download. */
const SOUNDS: Record<SoundName, Note[]> = {
  pickup: [
    { f: 660, to: 990, t: 0, d: 0.08, type: 'square' },
    { f: 990, to: 1320, t: 0.06, d: 0.1, type: 'square' },
  ],
  big: seq([523, 659, 784, 1047], 0.06, 0.12, 'square'),
  hurt: [{ f: 260, to: 70, t: 0, d: 0.3, type: 'sawtooth', v: 0.8 }],
  heal: seq([392, 523, 659], 0.08, 0.18, 'sine'),
  pop: [{ f: 420, to: 640, t: 0, d: 0.06, type: 'triangle' }],
  start: seq([523, 784], 0.1, 0.18, 'triangle'),
  win: seq([523, 659, 784, 1047, 784, 1047], 0.11, 0.18, 'square'),
  lose: seq([392, 330, 262, 196], 0.16, 0.25, 'triangle'),
};

/** Pick the sound for a collision: explicit `sfx` wins, otherwise derive it from the effect. */
export function collisionSound(onCollide: EntitySpec['onCollide']): SoundName | undefined {
  if (onCollide.sfx === 'none') return undefined;
  if (onCollide.sfx !== 'auto') return onCollide.sfx;
  if (onCollide.lives < 0) return 'hurt';
  if (onCollide.lives > 0) return 'heal';
  if (onCollide.score >= 3) return 'big';
  if (onCollide.score > 0) return 'pickup';
  return 'pop';
}

export class SoundFx {
  private ctx?: AudioContext;
  private master?: GainNode;
  muted = false;

  /** Must be called from (or after) a user gesture, per browser autoplay rules. */
  unlock(): void {
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    // Muting silences everything routed through master, including music.
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.18, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /** The audio graph for other voices (music); undefined until unlock() ran. */
  output(): { ctx: AudioContext; out: GainNode } | undefined {
    return this.ctx && this.master ? { ctx: this.ctx, out: this.master } : undefined;
  }

  play(name: SoundName | undefined): void {
    const { ctx, master } = this;
    if (!name || this.muted || !ctx || !master) return;
    const now = ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const start = now + n.t;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.f, start);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.d);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(n.v ?? 0.6, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + n.d + 0.02);
    }
  }
}
