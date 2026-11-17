import Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';
import { CHROME, FONT, inkOn, rgba, shade } from './colors';
import { paintedImage, roundedPath } from './paint';
import type { Controls } from './controls';
import { keyLabel } from '../spec/controls';
import { FIELD, HUD_H, WORLD } from './world';

export { FONT };
const PAD = 16;

type Theme = GameSpec['theme'];
type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** Real pixels per logical pixel; text and painted chrome are rasterised at this resolution so they stay sharp. */
let resolution = 1;
export function setTextResolution(value: number): void {
  resolution = value;
}

/** Every text in the game goes through here, so all of it shares the font and the sharp resolution. */
export function textStyle(size: number, color: string, extra: TextStyle = {}): TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, resolution, ...extra };
}

const toColor = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const label = (scene: Phaser.Scene, text: string, color: string = CHROME.text3) =>
  scene.add.text(0, 0, text.toUpperCase(), textStyle(11, color, { fontStyle: '700', letterSpacing: 1.2 }));

// ---------------------------------------------------------------- HUD

export interface HudState {
  score: number;
  target?: number;
  lives: number;
  maxLives: number;
  timer?: { label: string; seconds: number; urgent: boolean };
}

const CHIP_H = 30;
const CHIP_Y = (HUD_H - CHIP_H) / 2;
const MID = HUD_H / 2;

/** Top bar with three chips: score (left), timer (centre), lives (right). Gameplay happens below it (see FIELD). */
export class Hud {
  private readonly chips: Phaser.GameObjects.Graphics;
  private readonly scoreLabel: Phaser.GameObjects.Text;
  private readonly scoreValue: Phaser.GameObjects.Text;
  private readonly scoreTarget: Phaser.GameObjects.Text;
  private readonly timerLabel: Phaser.GameObjects.Text;
  private readonly timerValue: Phaser.GameObjects.Text;
  private readonly heartsFull: Phaser.GameObjects.Text;
  private readonly heartsEmpty: Phaser.GameObjects.Text;
  private lastKey = '';

  constructor(
    scene: Phaser.Scene,
    private readonly theme: Theme,
    scoreName: string,
  ) {
    const W = WORLD.width;
    paintedImage(scene, W, HUD_H, resolution, (ctx) => {
      const fill = ctx.createLinearGradient(0, 0, 0, HUD_H);
      fill.addColorStop(0, CHROME.hudTop);
      fill.addColorStop(1, CHROME.hudBottom);
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, W, HUD_H);
      const line = ctx.createLinearGradient(0, 0, W, 0);
      line.addColorStop(0, rgba(theme.primary, 0.75));
      line.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
      line.addColorStop(1, rgba(theme.accent, 0.65));
      ctx.fillStyle = line;
      ctx.fillRect(0, HUD_H - 1, W, 1);
    })
      .setOrigin(0, 0)
      .setDepth(50);

    this.chips = scene.add.graphics().setDepth(51);
    const value = (color: string) => scene.add.text(0, 0, '', textStyle(18, color, { fontStyle: '650' })).setOrigin(0, 0.5).setDepth(52);
    this.scoreLabel = label(scene, scoreName).setOrigin(0, 0.5).setDepth(52);
    this.scoreValue = value(CHROME.text);
    this.scoreTarget = value(CHROME.text3);
    this.timerLabel = label(scene, '').setOrigin(0, 0.5).setDepth(52);
    this.timerValue = value(CHROME.text);
    this.heartsFull = scene.add.text(0, 0, '', textStyle(17, theme.accent, { letterSpacing: 2 })).setOrigin(0, 0.5).setDepth(52);
    this.heartsEmpty = scene.add.text(0, 0, '', textStyle(17, 'rgba(255,255,255,0.25)', { letterSpacing: 2 })).setOrigin(0, 0.5).setDepth(52);
  }

  update(state: HudState): void {
    const timerText = state.timer ? formatTime(state.timer.seconds) : '';
    const key = [state.score, state.target, state.lives, state.maxLives, state.timer?.label, timerText, state.timer?.urgent].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    const { chips, theme } = this;
    chips.clear();
    const chip = (x: number, w: number, urgent = false) => {
      chips.fillStyle(urgent ? toColor(theme.accent) : 0xffffff, urgent ? 0.16 : 0.06).fillRoundedRect(x, CHIP_Y, w, CHIP_H, CHIP_H / 2);
      chips.lineStyle(1, urgent ? toColor(theme.accent) : 0xffffff, urgent ? 0.7 : 0.1).strokeRoundedRect(x + 0.5, CHIP_Y + 0.5, w - 1, CHIP_H - 1, CHIP_H / 2);
    };

    // Score chip, left.
    this.scoreValue.setText(String(state.score));
    this.scoreTarget.setText(state.target !== undefined ? `/ ${state.target}` : '');
    let x = PAD + 14;
    this.scoreLabel.setPosition(x, MID);
    x += this.scoreLabel.width + 10;
    this.scoreValue.setPosition(x, MID);
    x += this.scoreValue.width + (this.scoreTarget.text ? 6 : 0);
    this.scoreTarget.setPosition(x, MID);
    x += this.scoreTarget.width + 14;
    chip(PAD, x - PAD);

    // Timer chip, centre (only when the game has a clock).
    const timed = Boolean(state.timer);
    this.timerLabel.setVisible(timed);
    this.timerValue.setVisible(timed);
    if (state.timer) {
      const urgent = state.timer.urgent;
      this.timerLabel.setText(state.timer.label.toUpperCase()).setColor(urgent ? theme.accent : CHROME.text3);
      this.timerValue.setText(timerText).setColor(urgent ? theme.accent : CHROME.text);
      const icon = 14;
      const width = 14 + icon + 8 + this.timerLabel.width + 8 + this.timerValue.width + 14;
      const left = WORLD.width / 2 - width / 2;
      chip(left, width, urgent);
      const cx = left + 14 + icon / 2;
      chips.lineStyle(1.75, urgent ? toColor(theme.accent) : 0xa4aec0, 1).strokeCircle(cx, MID, icon / 2 - 1);
      chips.lineBetween(cx, MID, cx, MID - 4).lineBetween(cx, MID, cx + 3, MID + 1.5);
      this.timerLabel.setPosition(left + 14 + icon + 8, MID);
      this.timerValue.setPosition(this.timerLabel.x + this.timerLabel.width + 8, MID);
    }

    // Lives chip, right.
    const lives = Math.max(0, state.lives);
    this.heartsFull.setText('♥'.repeat(lives));
    this.heartsEmpty.setText('♥'.repeat(Math.max(0, state.maxLives - lives)));
    const heartsW = this.heartsFull.width + this.heartsEmpty.width;
    const right = WORLD.width - PAD;
    const left = right - (14 + heartsW + 12);
    chip(left, right - left);
    this.heartsFull.setPosition(left + 14, MID + 1);
    this.heartsEmpty.setPosition(this.heartsFull.x + this.heartsFull.width, MID + 1);
  }
}

// ---------------------------------------------------------------- Intro / end card

export interface OverlayContent {
  /** Small tag above the title, e.g. "Ready to play". */
  eyebrow: string;
  title: string;
  body: string;
  /** Optional big number, e.g. the final score. */
  stat?: { value: string; label: string };
  /** Text on the call-to-action button. */
  cta: string;
  tone?: 'neutral' | 'win' | 'lose';
}

const CARD_W = 560;
const CARD_PAD = 32;
const TONES = { neutral: undefined, win: '#4ade80', lose: '#f87171' } as const;

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: Theme): void {
  const r = 20;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, CHROME.surfaceTop);
  fill.addColorStop(1, CHROME.surfaceBottom);
  ctx.fillStyle = fill;
  roundedPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  // Soft inner glows in the game's own colours.
  ctx.save();
  roundedPath(ctx, x, y, w, h, r);
  ctx.clip();
  const glowA = ctx.createRadialGradient(x + w * 0.15, y, 0, x + w * 0.15, y, w * 0.7);
  glowA.addColorStop(0, rgba(theme.primary, 0.16));
  glowA.addColorStop(1, rgba(theme.primary, 0));
  ctx.fillStyle = glowA;
  ctx.fillRect(x, y, w, h);
  const glowB = ctx.createRadialGradient(x + w * 0.9, y + h, 0, x + w * 0.9, y + h, w * 0.6);
  glowB.addColorStop(0, rgba(theme.accent, 0.12));
  glowB.addColorStop(1, rgba(theme.accent, 0));
  ctx.fillStyle = glowB;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Gradient hairline border, like the dashboard's preview frame.
  const edge = ctx.createLinearGradient(x, y, x + w, y + h);
  edge.addColorStop(0, rgba(theme.primary, 0.6));
  edge.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
  edge.addColorStop(1, rgba(theme.accent, 0.5));
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.25;
  roundedPath(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, r);
  ctx.stroke();
}

/** Centered card that waits for a click or Space before calling `onContinue`. */
export function showOverlay(scene: Phaser.Scene, theme: Theme, content: OverlayContent, onContinue: () => void, controls: Controls): void {
  const { width: W, height: H } = WORLD;
  const tone = TONES[content.tone ?? 'neutral'] ?? theme.primary;
  const wrap = { width: CARD_W - CARD_PAD * 2, useAdvancedWrap: true };
  const cx = W / 2;

  const dim = scene.add.rectangle(0, 0, W, H, 0x05080e, 0.6).setOrigin(0, 0);

  // Build the content top-down, measuring as we go; the card is painted to fit afterwards.
  let y = CARD_PAD;
  const eyebrow = label(scene, content.eyebrow, tone).setOrigin(0.5, 0);
  const eyebrowPill = scene.add.graphics();
  const pillW = eyebrow.width + 20;
  eyebrowPill.fillStyle(toColor(tone), 0.14).fillRoundedRect(cx - pillW / 2, y, pillW, 22, 11);
  eyebrowPill.lineStyle(1, toColor(tone), 0.35).strokeRoundedRect(cx - pillW / 2 + 0.5, y + 0.5, pillW - 1, 21, 10.5);
  eyebrow.setPosition(cx, y + 5);
  y += 22 + 16;

  const title = scene.add.text(cx, y, content.title, textStyle(32, CHROME.text, { fontStyle: '650', align: 'center', wordWrap: wrap })).setOrigin(0.5, 0);
  y += title.height + 10;
  const body = scene.add
    .text(cx, y, content.body, textStyle(16, CHROME.text2, { align: 'center', wordWrap: wrap, lineSpacing: 4 }))
    .setOrigin(0.5, 0);
  y += body.height;

  const parts: Phaser.GameObjects.GameObject[] = [eyebrowPill, eyebrow, title, body];
  if (content.stat) {
    y += 18;
    const value = scene.add.text(cx, y, content.stat.value, textStyle(40, theme.primary, { fontStyle: '700' })).setOrigin(0.5, 0);
    y += value.height - 2;
    const statLabel = label(scene, content.stat.label).setOrigin(0.5, 0).setPosition(cx, y);
    y += statLabel.height;
    parts.push(value, statLabel);
  }

  y += 24;
  const ctaText = scene.add.text(0, 0, content.cta, textStyle(15, inkOn(theme.primary), { fontStyle: '650' })).setOrigin(0.5);
  const ctaW = ctaText.width + 48;
  const ctaH = 44;
  const cta = paintedImage(
    scene,
    ctaW,
    ctaH,
    resolution,
    (ctx, px, py) => {
      ctx.shadowColor = rgba(theme.primary, 0.4);
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(px, py, px + ctaW, py + ctaH);
      g.addColorStop(0, shade(theme.primary, 0.12));
      g.addColorStop(1, shade(theme.primary, -0.12));
      ctx.fillStyle = g;
      roundedPath(ctx, px, py, ctaW, ctaH, ctaH / 2);
      ctx.fill();
    },
    16,
  );
  const ctaGroup = scene.add.container(cx, y + ctaH / 2, [cta, ctaText]);
  y += ctaH + 16;

  // Keycap hint: [M] sound
  const key = scene.add.text(0, 0, keyLabel(controls.firstKey('sound')), textStyle(11, CHROME.text2, { fontStyle: '700' })).setOrigin(0.5);
  const hint = scene.add.text(0, 0, 'toggle sound', textStyle(12, CHROME.text3)).setOrigin(0, 0.5);
  const capW = Math.max(22, key.width + 12);
  const hintW = capW + 8 + hint.width;
  const hintX = cx - hintW / 2;
  const cap = scene.add.graphics();
  cap.fillStyle(0xffffff, 0.06).fillRoundedRect(hintX, y, capW, 20, 6);
  cap.lineStyle(1, 0xffffff, 0.16).strokeRoundedRect(hintX + 0.5, y + 0.5, capW - 1, 19, 6);
  key.setPosition(hintX + capW / 2, y + 10);
  hint.setPosition(hintX + capW + 8, y + 10);
  y += 20 + CARD_PAD - 4;

  const cardH = y;
  const top = Math.round((H - cardH) / 2);
  const card = paintedImage(scene, CARD_W, cardH, resolution, (ctx, px, py) => drawCard(ctx, px, py, CARD_W, cardH, theme), 48).setPosition(
    cx,
    top + cardH / 2,
  );
  // Content was laid out from y = 0; shift it onto the card.
  const content_ = scene.add.container(0, top, [...parts, ctaGroup, cap, key, hint]);
  const layer = scene.add.container(0, 0, [card, content_]).setDepth(100);
  const root = scene.add.container(0, 0, [dim, layer]).setDepth(100);

  layer.setAlpha(0).setY(12);
  dim.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, y: 0, duration: 240, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: dim, alpha: 0.6, duration: 240 });
  scene.tweens.add({ targets: ctaGroup, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  let unsubscribe = () => {};
  const go = () => {
    scene.input.off('pointerdown', go);
    unsubscribe();
    onContinue();
    scene.tweens.add({ targets: root, alpha: 0, duration: 140, onComplete: () => root.destroy() });
  };
  // Small delay so the click that ended the last round does not skip this card.
  scene.time.delayedCall(300, () => {
    scene.input.once('pointerdown', go);
    unsubscribe = controls.onPress('start', go);
  });
  scene.events.once('shutdown', () => unsubscribe());
}

// ---------------------------------------------------------------- Popups

/** "+3" style number that pops, drifts up and fades. */
export function popScore(scene: Phaser.Scene, x: number, y: number, text: string, color: string): void {
  const t = scene.add.text(x, y, text, textStyle(24, color, { fontStyle: '700' })).setOrigin(0.5).setDepth(60);
  t.setShadow(0, 2, 'rgba(0, 0, 0, 0.6)', 8, false, true);
  t.y = Math.max(y, FIELD.y + 20);
  t.setScale(0.7);
  scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: t.y - 44, alpha: 0, duration: 1100, delay: 250, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
}

/** The bubble currently on screen per scene, so a new one replaces it instead of stacking on top. */
const currentBubble = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** A small glass speech bubble (with a tail) or toast (without), kept inside the playfield. */
function bubble(scene: Phaser.Scene, x: number, y: number, text: string, theme: Theme, tail: boolean, holdMs: number): void {
  const previous = currentBubble.get(scene);
  if (previous?.active) {
    scene.tweens.killTweensOf(previous);
    scene.tweens.add({ targets: previous, alpha: 0, duration: 120, onComplete: () => previous.destroy() });
  }
  const t = scene.add.text(0, 0, text, textStyle(14, CHROME.text, { fontStyle: '500', align: 'center', wordWrap: { width: 240, useAdvancedWrap: true } })).setOrigin(0.5);
  const w = t.width + 22;
  const h = t.height + 14;
  const g = scene.add.graphics();
  g.fillStyle(0x0e131d, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(14, h / 2));
  g.lineStyle(1, toColor(theme.primary), 0.45).strokeRoundedRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1, Math.min(14, h / 2));
  if (tail) {
    g.fillStyle(0x0e131d, 0.9).fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 7);
  }
  const cx = Phaser.Math.Clamp(x, FIELD.x + w / 2 + 8, FIELD.x + FIELD.w - w / 2 - 8);
  const cy = Phaser.Math.Clamp(y, FIELD.y + h / 2 + 8, FIELD.y + FIELD.h - h / 2 - 8);
  const box = scene.add.container(cx, cy + 6, [g, t]).setDepth(61).setAlpha(0);
  currentBubble.set(scene, box);
  scene.tweens.add({ targets: box, alpha: 1, y: cy, duration: 180, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: box, alpha: 0, y: cy - 24, duration: 500, delay: holdMs, ease: 'Sine.easeIn', onComplete: () => box.destroy() });
}

/** Speech bubble above an entity, for its quotes. */
export function quoteBubble(scene: Phaser.Scene, x: number, y: number, text: string, theme: Theme): void {
  bubble(scene, x, y, text, theme, true, 1600);
}

/** Short message at the top of the playfield, e.g. "Sound off". */
export function toast(scene: Phaser.Scene, text: string, theme: Theme): void {
  bubble(scene, WORLD.width / 2, FIELD.y + 28, text, theme, false, 700);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
