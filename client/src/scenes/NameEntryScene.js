import Phaser from 'phaser';
import { normalizeName, isValidName, MIN_NAME_LENGTH, MAX_NAME_LENGTH } from '@rpg/shared';
import GameClient from '../net/GameClient.js';

const NAME_STORAGE_KEY = 'rpg.playerName';
const DEFAULT_MAP_ID = 'forest';

const TINY_SWORDS_BASE = 'assets/tiny-swords/update-010';
const UI_BASE = `/${TINY_SWORDS_BASE}/ui`;
// Recorte próprio (ver client/public/assets/tiny-swords/_derived) — o papel
// claro do free-pack vem com respiro entre as 9 células (não é um 9-slice
// compacto), então foi cortado e remontado sem os vãos pra funcionar como
// border-image.
const PANEL_BG_URL = '/assets/tiny-swords/_derived/panel-cream-paper.png';

// Painel/ribbon/botão usam border-image 9-slice (ou 3-slice) pra esticar só
// a borda/miolo tecido e manter os cantos entalhados nítidos, em vez de
// distorcer a arte toda — as mesmas texturas do Tiny Swords usadas no resto do jogo.
const FORM_HTML = `
  <style>
    .name-entry-panel {
      position: relative;
      width: 320px;
      box-sizing: border-box;
      padding: 40px 30px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      border-style: solid;
      border-width: 22px;
      border-image: url('${PANEL_BG_URL}') 44 52 45 52 fill repeat;
      image-rendering: pixelated;
      font-family: monospace;
    }
    .name-entry-ribbon {
      position: absolute;
      top: -50px;
      left: 50%;
      transform: translateX(-50%);
      width: 260px;
      height: 64px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-bottom: 6px;
      background-image: url('${UI_BASE}/ribbons/ribbon-red-3slides.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      image-rendering: pixelated;
      text-align: center;
      white-space: nowrap;
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 0.5px;
      color: #ffe9c2;
      text-shadow: 1px 1px 0 #3a0d0d, -1px 1px 0 #3a0d0d, 1px -1px 0 #3a0d0d, -1px -1px 0 #3a0d0d;
    }
    .name-entry-input {
      width: 100%;
      margin-top: 20px;
      box-sizing: border-box;
      padding: 13px 14px;
      border: 3px solid #6b4a2a;
      border-radius: 3px;
      background-image: url('${UI_BASE}/banners/carved-3slides.png');
      background-size: 100% 100%;
      image-rendering: pixelated;
      font-family: monospace;
      font-size: 15px;
      color: #3a2410;
      outline: none;
    }
    .name-entry-input::placeholder {
      color: #8a6f4f;
    }
    .name-entry-error {
      min-height: 16px;
      margin-top: 10px;
      color: #ff8080;
      font-size: 12px;
      text-align: center;
      text-shadow: 1px 1px 0 #000;
    }
    .name-entry-button {
      margin-top: 16px;
      padding: 2px 18px;
      box-sizing: border-box;
      border-style: solid;
      border-width: 14px;
      border-image: url('${UI_BASE}/buttons/button-blue-9slides.png') 64 fill repeat;
      image-rendering: pixelated;
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      color: #f0f6ff;
      text-shadow: 1px 1px 0 #123048;
      background: transparent;
      cursor: pointer;
    }
    .name-entry-button:active {
      border-image-source: url('${UI_BASE}/buttons/button-blue-9slides-pressed.png');
    }
    .name-entry-button:disabled {
      cursor: default;
      color: #d8cdb8;
      text-shadow: none;
      border-image-source: url('${UI_BASE}/buttons/button-disable-9slides.png');
    }
  </style>
  <div class="name-entry-panel">
    <div class="name-entry-ribbon">Escolha seu nome</div>
    <input
      id="name-input"
      class="name-entry-input"
      type="text"
      maxlength="${MAX_NAME_LENGTH}"
      autocomplete="off"
      placeholder="Nome do aventureiro"
    />
    <div id="name-error" class="name-entry-error"></div>
    <button id="name-submit" class="name-entry-button">Entrar</button>
  </div>
`;

export default class NameEntryScene extends Phaser.Scene {
  constructor() {
    super('name-entry');
  }

  preload() {
    this.load.spritesheet('bg-trees', `${TINY_SWORDS_BASE}/resources/trees/tree.png`, {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.image('bg-bush-a', `${TINY_SWORDS_BASE}/deco/07.png`);
    this.load.image('bg-bush-b', `${TINY_SWORDS_BASE}/deco/09.png`);
  }

  create() {
    this.isSubmitting = false;

    this.drawBackdrop();

    this.formDom = this.add.dom(0, 0).createFromHTML(FORM_HTML);
    this.formDom.setDepth(10);
    this.positionForm();
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));

    this.inputEl = this.formDom.getChildByID('name-input');
    this.errorEl = this.formDom.getChildByID('name-error');
    this.submitEl = this.formDom.getChildByID('name-submit');

    this.inputEl.value = localStorage.getItem(NAME_STORAGE_KEY) ?? '';

    this.submitEl.addEventListener('click', () => this.attemptJoin());
    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.attemptJoin();
    });
    this.inputEl.focus();
  }

  // Fundo de clareira noturna: gradiente de céu + duas árvores emolduram o
  // formulário, feito com as mesmas texturas usadas no mapa (nada de asset
  // novo). Redesenhado a cada resize porque o degradê depende do tamanho da tela.
  drawBackdrop() {
    this.bgGradient = this.add.graphics().setDepth(0);
    this.treeLeft = this.add.image(0, 0, 'bg-trees', 0).setDepth(1).setOrigin(0.5, 1);
    this.treeRight = this.add.image(0, 0, 'bg-trees', 3).setDepth(1).setOrigin(0.5, 1).setFlipX(true);
    this.bushLeft = this.add.image(0, 0, 'bg-bush-a').setDepth(2).setOrigin(0.5, 1).setScale(1.4);
    this.bushRight = this.add.image(0, 0, 'bg-bush-b').setDepth(2).setOrigin(0.5, 1).setScale(1.4);
    this.layoutBackdrop();
  }

  layoutBackdrop() {
    const { width, height } = this.cameras.main;

    this.bgGradient.clear();
    this.bgGradient.fillGradientStyle(0x1c2f1e, 0x1c2f1e, 0x0a120a, 0x0a120a, 1);
    this.bgGradient.fillRect(0, 0, width, height);

    const treeScale = Math.max(1, height / 480);
    this.treeLeft.setPosition(width * 0.14, height + 20).setScale(treeScale * 1.3);
    this.treeRight.setPosition(width * 0.86, height + 20).setScale(treeScale * 1.3);
    this.bushLeft.setPosition(width * 0.26, height + 10).setScale(treeScale * 1.1);
    this.bushRight.setPosition(width * 0.74, height + 10).setScale(treeScale * 1.1);
  }

  handleResize() {
    this.layoutBackdrop();
    this.positionForm();
  }

  positionForm() {
    this.formDom.setPosition(this.cameras.main.width / 2, this.cameras.main.height / 2);
  }

  showError(message) {
    this.errorEl.textContent = message;
  }

  setSubmitting(submitting) {
    this.isSubmitting = submitting;
    this.submitEl.disabled = submitting;
    this.submitEl.textContent = submitting ? 'Entrando...' : 'Entrar';
  }

  async attemptJoin() {
    if (this.isSubmitting) return;

    const name = normalizeName(this.inputEl.value);
    if (!isValidName(name)) {
      this.showError(
        `O nome deve ter entre ${MIN_NAME_LENGTH} e ${MAX_NAME_LENGTH} caracteres (letras, números, espaço, - ou _).`,
      );
      return;
    }

    this.showError('');
    this.setSubmitting(true);

    const client = new GameClient();
    try {
      await client.connect(DEFAULT_MAP_ID, { name });
    } catch (error) {
      this.setSubmitting(false);
      this.showError(error?.message || 'Não foi possível entrar. Tente novamente.');
      return;
    }

    localStorage.setItem(NAME_STORAGE_KEY, name);
    this.scene.start('game', { mapId: DEFAULT_MAP_ID, name, client });
  }
}
