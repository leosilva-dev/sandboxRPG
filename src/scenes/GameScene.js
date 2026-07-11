import Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT, cartesianToIso } from '../iso.js';

const GRID_SIZE = 12;
const PLAYER_SPEED = 3.2; // tile units per second
const PLAYER_RUN_SPEED = 6; // tile units per second
const WORLD_MARGIN = 0.5;

const DIRECTIONS = ['down', 'up', 'left', 'right'];
const WALK_FRAME_COUNT = 9;
const IDLE_FRAME_COUNT = 2;
const RUN_FRAME_COUNT = 8;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
    this.player = { x: GRID_SIZE / 2, y: GRID_SIZE / 2 };
    this.keys = null;
    this.props = [];
    this.facing = 'down';
  }

  preload() {
    this.generateTileTexture('tile-a', 0x4caf6d, 0x3a7d55);
    this.generateTileTexture('tile-b', 0x45a663, 0x357d4c);
    this.generatePropTexture();

    DIRECTIONS.forEach((dir) => {
      for (let i = 1; i <= WALK_FRAME_COUNT; i++) {
        this.load.image(`walk-${dir}-${i}`, `assets/character/walk-${dir}-${i}.png`);
      }
      for (let i = 1; i <= IDLE_FRAME_COUNT; i++) {
        this.load.image(`idle-${dir}-${i}`, `assets/character/idle-${dir}-${i}.png`);
      }
      for (let i = 1; i <= RUN_FRAME_COUNT; i++) {
        this.load.image(`run-${dir}-${i}`, `assets/character/run-${dir}-${i}.png`);
      }
    });
  }

  create() {
    this.drawFloor();
    this.placeProps();

    this.playerSprite = this.add.sprite(0, 0, 'idle-down-1');
    this.playerSprite.setOrigin(0.5, 1);

    DIRECTIONS.forEach((dir) => {
      this.anims.create({
        key: `walk-${dir}`,
        frames: Phaser.Utils.Array.NumberArray(1, WALK_FRAME_COUNT).map((i) => ({ key: `walk-${dir}-${i}` })),
        frameRate: 10,
        repeat: -1,
      });
      this.anims.create({
        key: `idle-${dir}`,
        frames: Phaser.Utils.Array.NumberArray(1, IDLE_FRAME_COUNT).map((i) => ({ key: `idle-${dir}-${i}` })),
        frameRate: 3,
        repeat: -1,
      });
      this.anims.create({
        key: `run-${dir}`,
        frames: Phaser.Utils.Array.NumberArray(1, RUN_FRAME_COUNT).map((i) => ({ key: `run-${dir}-${i}` })),
        frameRate: 14,
        repeat: -1,
      });
    });

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });

    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(1);

    this.updatePlayerScreenPosition();
  }

  drawFloor() {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gy = 0; gy < GRID_SIZE; gy++) {
        const iso = cartesianToIso(gx, gy);
        const key = (gx + gy) % 2 === 0 ? 'tile-a' : 'tile-b';
        const tile = this.add.image(iso.x, iso.y, key);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(-1000); // floor always behind everything
      }
    }
  }

  placeProps() {
    const positions = [
      { x: 3, y: 3 },
      { x: 8, y: 4 },
      { x: 5, y: 8 },
      { x: 9, y: 9 },
    ];

    positions.forEach(({ x, y }) => {
      const iso = cartesianToIso(x, y);
      const prop = this.add.image(iso.x, iso.y, 'prop');
      prop.setOrigin(0.5, 1);
      prop.setDepth(iso.y);
      this.props.push(prop);
    });
  }

  update(time, delta) {
    const dt = delta / 1000;
    const upPressed = this.keys.up.isDown;
    const downPressed = this.keys.down.isDown;
    const leftPressed = this.keys.left.isDown;
    const rightPressed = this.keys.right.isDown;

    let dx = 0;
    let dy = 0;

    // WASD é relativo à tela (cima/baixo/esquerda/direita visual), não aos
    // eixos brutos do grid isométrico — por isso cada tecla mexe nos dois
    // eixos cartesianos ao mesmo tempo (rotação de 45° do input).
    if (upPressed) {
      dx -= 1;
      dy -= 1;
    }
    if (downPressed) {
      dx += 1;
      dy += 1;
    }
    if (leftPressed) {
      dx -= 1;
      dy += 1;
    }
    if (rightPressed) {
      dx += 1;
      dy -= 1;
    }

    const isMoving = dx !== 0 || dy !== 0;
    const isRunning = isMoving && this.keys.run.isDown;

    if (isMoving) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;

      const speed = isRunning ? PLAYER_RUN_SPEED : PLAYER_SPEED;
      this.player.x += dx * speed * dt;
      this.player.y += dy * speed * dt;

      this.player.x = Phaser.Math.Clamp(this.player.x, WORLD_MARGIN, GRID_SIZE - WORLD_MARGIN);
      this.player.y = Phaser.Math.Clamp(this.player.y, WORLD_MARGIN, GRID_SIZE - WORLD_MARGIN);

      if (leftPressed && !rightPressed) this.facing = 'left';
      else if (rightPressed && !leftPressed) this.facing = 'right';
      else if (upPressed && !downPressed) this.facing = 'up';
      else if (downPressed && !upPressed) this.facing = 'down';
    }

    this.updateAnimation(isMoving, isRunning);
    this.updatePlayerScreenPosition();
  }

  updateAnimation(isMoving, isRunning) {
    const animKey = isRunning ? `run-${this.facing}` : isMoving ? `walk-${this.facing}` : `idle-${this.facing}`;

    if (this.playerSprite.anims.currentAnim?.key !== animKey || !this.playerSprite.anims.isPlaying) {
      this.playerSprite.play(animKey);
    }
  }

  updatePlayerScreenPosition() {
    const iso = cartesianToIso(this.player.x, this.player.y);
    this.playerSprite.setPosition(iso.x, iso.y);
    this.playerSprite.setDepth(iso.y);
  }

  generateTileTexture(key, topColor, edgeColor) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const w = TILE_WIDTH;
    const h = TILE_HEIGHT;

    g.fillStyle(topColor, 1);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w, h / 2);
    g.lineTo(w / 2, h);
    g.lineTo(0, h / 2);
    g.closePath();
    g.fillPath();

    g.lineStyle(1, edgeColor, 0.6);
    g.strokePath();

    g.generateTexture(key, w, h);
    g.destroy();
  }

  generatePropTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const w = TILE_WIDTH * 0.7;
    const h = TILE_HEIGHT * 0.7;
    const boxHeight = 60;

    const topY = 0;
    const midY = h / 2;
    const botY = h;

    // left face
    g.fillStyle(0x8a5a2b, 1);
    g.beginPath();
    g.moveTo(0, midY);
    g.lineTo(w / 2, botY);
    g.lineTo(w / 2, botY + boxHeight);
    g.lineTo(0, midY + boxHeight);
    g.closePath();
    g.fillPath();

    // right face
    g.fillStyle(0x6e4520, 1);
    g.beginPath();
    g.moveTo(w / 2, botY);
    g.lineTo(w, midY);
    g.lineTo(w, midY + boxHeight);
    g.lineTo(w / 2, botY + boxHeight);
    g.closePath();
    g.fillPath();

    // top face
    g.fillStyle(0xb07a3e, 1);
    g.beginPath();
    g.moveTo(w / 2, topY);
    g.lineTo(w, midY);
    g.lineTo(w / 2, botY);
    g.lineTo(0, midY);
    g.closePath();
    g.fillPath();

    g.generateTexture('prop', w, h + boxHeight);
    g.destroy();
  }
}
