import Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';
import { HUD_H, WORLD } from './world';

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const PAD = 16;

type Theme = GameSpec['theme'];
type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** Real pixels per logical pixel; text is rasterised at this resolution so it stays sharp. */
let textResolution = 1;
export function setTextResolution(resolution: number): void {
  textResolution = resolution;
}

/** Every text in the game goes through here, so all of it shares the font and the sharp resolution. */
export function textStyle(size: number, color: string, extra: TextStyle = {}): TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, resolution: textResolution, ...extra };
}

const toColor = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;

/** Top bar: score left, timer centred, hearts right. Gameplay happens below it (see FIELD). */
export class Hud {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, theme: Theme) {
    const W = WORLD.width;
    const mid = HUD_H / 2;
    const bar = scene.add.graphics().setDepth(50);
    bar.fillStyle(0x000000, 0.45).fillRect(0, 0, W, HUD_H);
    bar.fillStyle(toColor(theme.primary), 0.6).fillRect(0, HUD_H - 2, W, 2);

    const style = (color: string) => textStyle(20, color, { stroke: '#000000', strokeThickness: 3 });
    this.scoreText = scene.add.text(PAD, mid, '', style(theme.text)).setOrigin(0, 0.5).setDepth(51);
    this.timerText = scene.add.text(W / 2, mid, '', style(theme.text)).setOrigin(0.5, 0.5).setDepth(51);
    this.livesText = scene.add.text(W - PAD, mid, '', style(theme.accent)).setOrigin(1, 0.5).setDepth(51);
  }

  update(score: string, lives: number, maxLives: number, timer: string): void {
    this.scoreText.setText(score);
    this.livesText.setText('♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, maxLives - lives)));
    this.timerText.setText(timer);
  }
}

export interface OverlayText {
  title: string;
  body: string;
  footer: string;
}

const CARD = { w: 620, h: 320 };

/** Full-screen card that waits for a click or Space before calling `onContinue`. */
export function showOverlay(scene: Phaser.Scene, theme: Theme, text: OverlayText, onContinue: () => void): void {
  const { width: W, height: H } = WORLD;
  const left = (W - CARD.w) / 2;
  const top = (H - CARD.h) / 2;

  const panel = scene.add.graphics();
  panel.fillStyle(0x000000, 0.5).fillRect(0, 0, W, H);
  panel.fillStyle(toColor(theme.background), 0.96).fillRoundedRect(left, top, CARD.w, CARD.h, 22);
  panel.lineStyle(4, toColor(theme.primary), 1).strokeRoundedRect(left, top, CARD.w, CARD.h, 22);

  const wrap = { width: CARD.w - 64, useAdvancedWrap: true };
  const title = scene.add
    .text(W / 2, top + 54, text.title, textStyle(34, theme.primary, { align: 'center', wordWrap: wrap }))
    .setOrigin(0.5);
  const body = scene.add
    .text(W / 2, top + CARD.h / 2 + 8, text.body, textStyle(19, theme.text, { align: 'center', wordWrap: wrap, lineSpacing: 5 }))
    .setOrigin(0.5);
  const footer = scene.add
    .text(W / 2, top + CARD.h - 34, text.footer, textStyle(16, theme.accent, { align: 'center' }))
    .setOrigin(0.5);
  scene.tweens.add({ targets: footer, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });

  const layer = scene.add.container(0, 0, [panel, title, body, footer]).setDepth(100);

  const go = () => {
    scene.input.off('pointerdown', go);
    scene.input.keyboard?.off('keydown-SPACE', go);
    layer.destroy();
    onContinue();
  };
  // Small delay so the click that ended the last round does not skip this card.
  scene.time.delayedCall(300, () => {
    scene.input.once('pointerdown', go);
    scene.input.keyboard?.once('keydown-SPACE', go);
  });
}

/** Floating text that drifts up and fades out. Kept inside the screen and below the HUD bar. */
export function popText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 18): void {
  const t = scene.add
    .text(x, y, text, textStyle(size, color, { stroke: '#000000', strokeThickness: 4, align: 'center', wordWrap: { width: 260 } }))
    .setOrigin(0.5)
    .setDepth(60);
  t.x = Phaser.Math.Clamp(x, t.width / 2 + 8, WORLD.width - t.width / 2 - 8);
  t.y = Math.max(y, HUD_H + 50 + t.height / 2);
  scene.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1800, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
