import Phaser from 'phaser';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 640,
  backgroundColor: '#1a1a2e',
  pixelArt: false,
  scene: [GameScene],
};

new Phaser.Game(config);
