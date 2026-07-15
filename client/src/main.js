import Phaser from 'phaser';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  preserveDrawingBuffer: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [GameScene],
};

window.game = new Phaser.Game(config);
