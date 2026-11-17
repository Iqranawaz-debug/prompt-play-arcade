import type { MusicStyle } from '../spec/schema';

/** A tiny procedural music loop: chords, bass and a melody over a fixed 16-step bar, synthesised live. */
interface Style {
  bpm: number;
  root: number; // MIDI note
  scale: number[]; // semitones from the root
  chords: number[]; // scale degree per bar (4-bar loop)
  bass: number[]; // 16 steps: 1 = play the chord root
  lead: number[]; // 16 steps: scale degree above the chord, -1 = rest
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  pad: boolean;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9];

export const STYLES: Record<Exclude<MusicStyle, 'none'>, Style> = {
  chill: { bpm: 84, root: 57, scale: MAJOR, chords: [0, 5, 3, 4], bass: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], lead: [4, -1, -1, 2, -1, -1, 4, -1, 5, -1, 4, -1, 2, -1, -1, -1], leadWave: 'triangle', bassWave: 'sine', pad: true },
  arcade: { bpm: 132, root: 60, scale: MAJOR, chords: [0, 4, 5, 3], bass: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], lead: [0, 2, 4, 7, 4, 2, 0, -1, 2, 4, 5, 4, 2, -1, 0, -1], leadWave: 'square', bassWave: 'triangle', pad: false },
  spooky: { bpm: 96, root: 50, scale: MINOR, chords: [0, 5, 3, 4], bass: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], lead: [0, -1, 2, -1, 3, -1, 2, -1, 0, -1, -1, 6, 5, -1, -1, -1], leadWave: 'sawtooth', bassWave: 'triangle', pad: true },
  upbeat: { bpm: 120, root: 62, scale: PENTA, chords: [0, 3, 4, 2], bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], lead: [4, 3, 2, -1, 4, -1, 2, 1, 0, -1, 2, 3, 4, -1, -1, -1], leadWave: 'square', bassWave: 'square', pad: false },
  dreamy: { bpm: 72, root: 64, scale: MAJOR, chords: [0, 3, 5, 4], bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], lead: [7, -1, -1, -1, 4, -1, -1, -1, 6, -1, -1, -1, 4, -1, 2, -1], leadWave: 'sine', bassWave: 'sine', pad: true },
};

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** MIDI note for scale degree `d` (can exceed the scale; wraps up an octave), relative to a chord degree. */
export function noteFor(style: Pick<Style, 'root' | 'scale'>, chordDegree: number, d: number): number {
  const i = chordDegree + d;
  const n = style.scale.length;
  return style.root + style.scale[((i % n) + n) % n] + 12 * Math.floor(i / n);
}

export class Music {
  private timer?: number;
  private gain?: GainNode;
  private step = 0;
  private nextTime = 0;

  constructor(private readonly output: () => { ctx: AudioContext; out: AudioNode } | undefined) {}

  get playing(): boolean {
    return this.timer !== undefined;
  }

  start(styleName: MusicStyle, volume = 0.5): void {
    this.stop();
    if (styleName === 'none') return;
    const io = this.output();
    if (!io) return;
    const { ctx, out } = io;
    const style = STYLES[styleName];
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.55 * volume;
    this.gain.connect(out);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    const stepDur = 60 / style.bpm / 4; // 16th notes
    // Look-ahead scheduler: wake often, schedule notes slightly in the future for sample-accurate timing.
    this.timer = window.setInterval(() => {
      while (this.nextTime < ctx.currentTime + 0.15) {
        this.playStep(ctx, style, this.step, this.nextTime, stepDur);
        this.nextTime += stepDur;
        this.step = (this.step + 1) % 64;
      }
    }, 30);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.gain) {
      const g = this.gain;
      try {
        g.gain.setTargetAtTime(0, g.context.currentTime, 0.05);
      } catch {
        // context closed
      }
      window.setTimeout(() => g.disconnect(), 400);
      this.gain = undefined;
    }
  }

  private playStep(ctx: AudioContext, s: Style, step: number, t: number, dur: number): void {
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const chord = s.chords[bar % s.chords.length];
    if (s.bass[i]) this.note(ctx, midiToHz(noteFor(s, chord, 0) - 12), t, dur * 1.8, s.bassWave, 0.5);
    if (s.lead[i] >= 0) this.note(ctx, midiToHz(noteFor(s, chord, s.lead[i]) + 12), t, dur * 1.6, s.leadWave, s.leadWave === 'square' || s.leadWave === 'sawtooth' ? 0.12 : 0.22);
    if (s.pad && i === 0) for (const d of [0, 2, 4]) this.note(ctx, midiToHz(noteFor(s, chord, d)), t, dur * 15, 'sine', 0.07);
  }

  private note(ctx: AudioContext, hz: number, t: number, dur: number, type: OscillatorType, level: number): void {
    if (!this.gain) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
