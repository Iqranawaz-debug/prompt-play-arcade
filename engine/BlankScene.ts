import Phaser from 'phaser';

/** Placeholder scene proving the Phaser pipeline works. */
export class BlankScene extends Phaser.Scene {
  constructor() {
    super('blank');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'Phaser is running', { fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5);
  }
}
