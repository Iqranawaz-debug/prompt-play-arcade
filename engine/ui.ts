import Phaser from 'phaser';
import type { GameSpec } from '../spec/schema';

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

type Theme = GameSpec['theme'];

export class Hud {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, theme: Theme) {
    const style = { fontFamily: FONT, fontSize: '22px', color: theme.text, stroke: '#000000', strokeThickness: 3 };
    const { width } = scene.scale;
    this.scoreText = scene.add.text(16, 12, '', style).setDepth(50);
    this.timerText = scene.add.text(width / 2, 12, '', style).setOrigin(0.5, 0).setDepth(50);
    this.livesText = scene.add.text(width - 16, 12, '', { ...style, color: theme.accent }).setOrigin(1, 0).setDepth(50);
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

/** Full-screen card that waits for a click or Space before calling `onContinue`. */
export function showOverlay(scene: Phaser.Scene, theme: Theme, text: OverlayText, onContinue: () => void): void {
  const { width: W, height: H } = scene.scale;
  const bg = Phaser.Display.Color.HexStringToColor(theme.background).color;
  const primary = Phaser.Display.Color.HexStringToColor(theme.primary).color;

  const panel = scene.add.graphics();
  panel.fillStyle(0x000000, 0.45).fillRect(0, 0, W, H);
  panel.fillStyle(bg, 0.95).fillRoundedRect(W / 2 - 320, H / 2 - 170, 640, 340, 24);
  panel.lineStyle(4, primary, 1).strokeRoundedRect(W / 2 - 320, H / 2 - 170, 640, 340, 24);

  const wrap = { width: 560, useAdvancedWrap: true };
  const title = scene.add
    .text(W / 2, H / 2 - 110, text.title, { fontFamily: FONT, fontSize: '38px', color: theme.primary, align: 'center', wordWrap: wrap })
    .setOrigin(0.5);
  const body = scene.add
    .text(W / 2, H / 2 + 5, text.body, { fontFamily: FONT, fontSize: '21px', color: theme.text, align: 'center', wordWrap: wrap, lineSpacing: 6 })
    .setOrigin(0.5);
  const footer = scene.add
    .text(W / 2, H / 2 + 125, text.footer, { fontFamily: FONT, fontSize: '18px', color: theme.accent, align: 'center' })
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

/** Floating text that drifts up and fades out. */
export function popText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 18): void {
  const t = scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4, align: 'center', wordWrap: { width: 260 } })
    .setOrigin(0.5)
    .setDepth(60);
  t.x = Phaser.Math.Clamp(x, t.width / 2 + 8, scene.scale.width - t.width / 2 - 8);
  scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1800, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
