import Phaser from 'phaser';
import { BlankScene } from '../engine/BlankScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 600,
  backgroundColor: '#1d2433',
  scene: [BlankScene],
});
