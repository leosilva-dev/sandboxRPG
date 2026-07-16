import Phaser from 'phaser';
import { gridToScreen, TILE_SIZE } from '../grid.js';
import {
  GRID_SIZE,
  computeInputVector,
  resolveFacing,
  speedForInput,
  stepPosition,
  startJump,
  advanceJump,
} from '@rpg/shared';
import GameClient from '../net/GameClient.js';
import { generateForestMap } from '../maps/forest.js';
import TouchControls from '../input/TouchControls.js';

const TILE_KEYS = [
  'grassTile',
  'pathTile',
  'treeSmall',
  'treeMedium',
  'treeLarge',
  'bush1',
  'bush2',
  'bush3',
  'bush4',
  'bush5',
  'bush6',
  'rock1',
  'rock2',
  'rock3',
  'rock4',
  'rock5',
  'rock6',
  'grassTuft1',
  'grassTuft2',
  'grassTuft3',
  'grassTuft4',
  'grassTuft5',
  'grassTuft6',
];

const DIRECTIONS = ['down', 'up', 'left', 'right'];
const WALK_FRAME_COUNT = 9;
const IDLE_FRAME_COUNT = 2;
const RUN_FRAME_COUNT = 8;
const JUMP_FRAME_COUNT = 5;
const JUMP_CYCLE = [1, 2, 3, 4, 5, 2]; // matches LPC's official jump animation cycle

// Fração da distância até a posição autoritativa corrigida por frame — puxa
// suavemente a predição local em vez de "teleportar" quando o servidor diverge.
const RECONCILIATION_FACTOR = 0.15;
// Fração da distância até a posição alvo interpolada por frame, pra suavizar
// jitter de rede nos jogadores remotos.
const REMOTE_INTERPOLATION_FACTOR = 0.25;
// Distância em px acima dos pés (origem do sprite) onde o número fica, acima da cabeça.
const PLAYER_LABEL_OFFSET_Y = 70;
// Tiles de chão nascem em 16px (pixel art) — escala pra preencher exatamente
// o TILE_SIZE (64px) da grade, sem espaços nem sobreposição entre células.
const GROUND_SCALE = TILE_SIZE / 16;
// Árvores/arbustos/pedras/touceiras do mesmo pacote já nascem proporcionais
// entre si — uma única escala preserva a variação de tamanho da arte original.
const DECORATION_SCALE = 1.5;

const MINIMAP_SIZE = 160;
const MINIMAP_MARGIN = 16;
const MINIMAP_PADDING = 6;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
    this.mapId = 'forest';
    this.player = { x: GRID_SIZE / 2, y: GRID_SIZE / 2 };
    this.keys = null;
    this.props = [];
    this.facing = 'down';
    this.jump = { isJumping: false, jumpVelocity: 0, jumpHeight: 0 };

    this.touchControls = null;
    this.net = new GameClient();
    this.sessionId = null;
    this.serverPlayer = null; // referência viva ao PlayerState do próprio jogador
    this.playerNumber = null;
    this.remotePlayers = new Map(); // sessionId -> { sprite, label, state, renderX, renderY }
  }

  init(data) {
    this.mapId = data?.mapId ?? this.mapId;
  }

  preload() {
    TILE_KEYS.forEach((tileKey) => {
      this.load.image(tileKey, `assets/tiles/${tileKey}.png`);
    });

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
      for (let i = 1; i <= JUMP_FRAME_COUNT; i++) {
        this.load.image(`jump-${dir}-${i}`, `assets/character/jump-${dir}-${i}.png`);
      }
    });
  }

  create() {
    this.drawFloor();
    this.placeProps();

    this.playerSprite = this.add.sprite(0, 0, 'idle-down-1');
    this.playerSprite.setOrigin(0.5, 1);
    this.playerLabel = this.createPlayerLabel('');

    this.playerNumberText = this.add
      .text(16, 16, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(10000);

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
      this.anims.create({
        key: `jump-${dir}`,
        frames: JUMP_CYCLE.map((i) => ({ key: `jump-${dir}-${i}` })),
        frameRate: 10,
        repeat: 0,
      });
    });

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.touchControls = new TouchControls();
    this.events.once('shutdown', () => this.touchControls.destroy());

    // Trava a câmera nos limites visuais do chão (tiles centrados na grade,
    // então a borda real fica meio tile além do último índice) — assim ela
    // para na borda do mapa em vez de mostrar o fundo vazio além dele.
    const worldEdge = GRID_SIZE * TILE_SIZE;
    this.cameras.main.setBounds(-TILE_SIZE / 2, -TILE_SIZE / 2, worldEdge, worldEdge);
    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(1);

    this.updateEntityScreenPosition(this.playerSprite, this.player.x, this.player.y, 0, this.playerLabel);

    this.minimap = this.createMinimap();

    this.connectToServer();
  }

  async connectToServer() {
    await this.net.connect(this.mapId);
    this.sessionId = this.net.sessionId;

    this.net.onPlayerAdd((player, sessionId) => {
      if (sessionId === this.sessionId) {
        // Sincroniza com a posição inicial autoritativa antes de seguir prevendo localmente.
        this.player.x = player.x;
        this.player.y = player.y;
        this.serverPlayer = player;
        this.playerNumber = player.number;
        this.playerLabel.setText(`#${player.number}`);
        this.playerNumberText.setText(`Jogador #${player.number}`);
        return;
      }
      this.addRemotePlayer(sessionId, player);
    });

    this.net.onPlayerRemove((_player, sessionId) => {
      this.removeRemotePlayer(sessionId);
    });
  }

  createPlayerLabel(number) {
    const label = this.add.text(0, 0, number === '' ? '' : `#${number}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4,
    });
    label.setOrigin(0.5, 1);
    return label;
  }

  addRemotePlayer(sessionId, playerState) {
    const sprite = this.add.sprite(0, 0, 'idle-down-1');
    sprite.setOrigin(0.5, 1);
    const label = this.createPlayerLabel(playerState.number);
    this.remotePlayers.set(sessionId, {
      sprite,
      label,
      state: playerState,
      renderX: playerState.x,
      renderY: playerState.y,
    });
  }

  removeRemotePlayer(sessionId) {
    const remote = this.remotePlayers.get(sessionId);
    if (!remote) return;
    remote.sprite.destroy();
    remote.label.destroy();
    this.remotePlayers.delete(sessionId);
  }

  drawFloor() {
    this.map = generateForestMap(GRID_SIZE);

    for (let gx = 0; gx < this.map.size; gx++) {
      for (let gy = 0; gy < this.map.size; gy++) {
        const screen = gridToScreen(gx, gy);
        const tile = this.add.image(screen.x, screen.y, this.map.getGroundKey(gx, gy));
        tile.setOrigin(0.5, 0.5);
        tile.setScale(GROUND_SCALE);
        tile.setDepth(-1000); // floor always behind everything
      }
    }
  }

  placeProps() {
    this.map.decorations.forEach(({ x, y, key: tileKey }) => {
      const screen = gridToScreen(x, y);
      const prop = this.add.image(screen.x, screen.y, tileKey);
      prop.setOrigin(0.5, 1);
      prop.setScale(DECORATION_SCALE);
      prop.setDepth(screen.y);
      this.props.push(prop);
    });
  }

  update(time, delta) {
    const dt = delta / 1000;
    const touch = this.touchControls.getInput();
    const input = {
      up: this.keys.up.isDown || touch.up,
      down: this.keys.down.isDown || touch.down,
      left: this.keys.left.isDown || touch.left,
      right: this.keys.right.isDown || touch.right,
      run: this.keys.run.isDown || touch.run,
    };

    const { dx, dy } = computeInputVector(input);
    const isMoving = dx !== 0 || dy !== 0;
    const isRunning = isMoving && input.run;

    if (isMoving) {
      const { x, y } = stepPosition(this.player, { dx, dy }, dt, { speed: speedForInput(isRunning) });
      this.player.x = x;
      this.player.y = y;
      this.facing = resolveFacing(this.facing, input);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.jump) || this.touchControls.consumeJumpPress()) {
      this.jump = startJump(this.jump);
      this.net.sendJump();
    }
    this.jump = advanceJump(this.jump, dt);

    this.net.sendInput(input);

    // Reconciliação simples: puxa a predição local em direção ao estado
    // autoritativo do servidor a cada frame, sem replay de input history.
    if (this.serverPlayer) {
      this.player.x += (this.serverPlayer.x - this.player.x) * RECONCILIATION_FACTOR;
      this.player.y += (this.serverPlayer.y - this.player.y) * RECONCILIATION_FACTOR;
    }

    this.updateEntityAnimation(this.playerSprite, this.facing, {
      isMoving,
      isRunning,
      isJumping: this.jump.isJumping,
    });
    this.updateEntityScreenPosition(
      this.playerSprite,
      this.player.x,
      this.player.y,
      this.jump.jumpHeight,
      this.playerLabel,
    );

    this.updateRemotePlayers();
    this.updateMinimap();
  }

  createMinimap() {
    const bg = this.add.graphics().setScrollFactor(0).setDepth(9999);
    const playerDot = this.add
      .circle(0, 0, 4, 0x2ecc71)
      .setStrokeStyle(1, 0x0a2e1a)
      .setScrollFactor(0)
      .setDepth(10001);

    return { bg, playerDot, remoteDots: new Map() };
  }

  // Reposiciona a caixa a cada frame com base na largura atual da câmera —
  // o canvas usa Phaser.Scale.RESIZE, então a janela pode mudar de tamanho
  // a qualquer momento e o minimapa precisa continuar colado no canto.
  updateMinimap() {
    const { bg, playerDot, remoteDots } = this.minimap;
    const boxX = this.cameras.main.width - MINIMAP_MARGIN - MINIMAP_SIZE;
    const boxY = MINIMAP_MARGIN;
    const inner = MINIMAP_SIZE - MINIMAP_PADDING * 2;

    bg.clear();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(boxX, boxY, MINIMAP_SIZE, MINIMAP_SIZE);
    bg.lineStyle(2, 0xffffff, 0.8);
    bg.strokeRect(boxX, boxY, MINIMAP_SIZE, MINIMAP_SIZE);

    const toMinimap = (x, y) => ({
      x: boxX + MINIMAP_PADDING + (x / GRID_SIZE) * inner,
      y: boxY + MINIMAP_PADDING + (y / GRID_SIZE) * inner,
    });

    const playerPos = toMinimap(this.player.x, this.player.y);
    playerDot.setPosition(playerPos.x, playerPos.y);

    const seen = new Set();
    this.remotePlayers.forEach((remote, sessionId) => {
      seen.add(sessionId);
      let dot = remoteDots.get(sessionId);
      if (!dot) {
        dot = this.add.circle(0, 0, 3, 0xf5a623).setScrollFactor(0).setDepth(10001);
        remoteDots.set(sessionId, dot);
      }
      const pos = toMinimap(remote.renderX, remote.renderY);
      dot.setPosition(pos.x, pos.y);
    });

    remoteDots.forEach((dot, sessionId) => {
      if (!seen.has(sessionId)) {
        dot.destroy();
        remoteDots.delete(sessionId);
      }
    });
  }

  updateRemotePlayers() {
    this.remotePlayers.forEach((remote) => {
      remote.renderX += (remote.state.x - remote.renderX) * REMOTE_INTERPOLATION_FACTOR;
      remote.renderY += (remote.state.y - remote.renderY) * REMOTE_INTERPOLATION_FACTOR;

      this.updateEntityAnimation(remote.sprite, remote.state.facing, {
        isMoving: remote.state.moving,
        isRunning: remote.state.running,
        isJumping: remote.state.isJumping,
      });
      this.updateEntityScreenPosition(
        remote.sprite,
        remote.renderX,
        remote.renderY,
        remote.state.jumpHeight,
        remote.label,
      );
    });
  }

  updateEntityAnimation(sprite, facing, { isMoving, isRunning, isJumping }) {
    const animKey = isJumping
      ? `jump-${facing}`
      : isRunning
        ? `run-${facing}`
        : isMoving
          ? `walk-${facing}`
          : `idle-${facing}`;

    const isNewAnim = sprite.anims.currentAnim?.key !== animKey;
    // Enquanto pulando, não reinicia a animação mesmo que ela termine antes
    // do arco físico (senão os frames de pouso ficam repetindo em loop).
    const shouldPlay = isNewAnim || (!isJumping && !sprite.anims.isPlaying);

    if (shouldPlay) {
      sprite.play(animKey);
    }
  }

  updateEntityScreenPosition(sprite, x, y, jumpHeight, label) {
    const screen = gridToScreen(x, y);
    const screenY = screen.y - jumpHeight;
    sprite.setPosition(screen.x, screenY);
    sprite.setDepth(screen.y);

    if (label) {
      label.setPosition(screen.x, screenY - PLAYER_LABEL_OFFSET_Y);
      label.setDepth(screen.y + 1000); // sempre acima de sprites/props na mesma coluna
    }
  }

}
