import Phaser from 'phaser';
import NameEntryScene from './scenes/NameEntryScene.js';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  preserveDrawingBuffer: true,
  // Sem isso, o scroll da câmera (que segue o jogador com lerp fracionário)
  // desalinha os tiles em sub-pixel e abre uma costura de 1px entre eles,
  // vazando o backgroundColor escuro como uma grade preta sobre o chão.
  render: { roundPixels: true },
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [NameEntryScene, GameScene],
};

window.game = new Phaser.Game(config);
