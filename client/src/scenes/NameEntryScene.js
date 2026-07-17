import Phaser from 'phaser';
import { normalizeName, isValidName, MIN_NAME_LENGTH, MAX_NAME_LENGTH } from '@rpg/shared';
import GameClient from '../net/GameClient.js';

const NAME_STORAGE_KEY = 'rpg.playerName';
const DEFAULT_MAP_ID = 'forest';

const FORM_HTML = `
  <div style="
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 280px;
    padding: 32px 40px;
    background: rgba(10, 10, 20, 0.85);
    border: 1px solid #3a3a5a;
    border-radius: 8px;
    font-family: monospace;
    color: #ffffff;
  ">
    <div style="font-size: 20px;">Escolha seu nome</div>
    <input id="name-input" type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" style="
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      font-family: monospace;
      font-size: 16px;
      background: #10101c;
      color: #ffffff;
      border: 1px solid #4a4a6a;
      border-radius: 4px;
      outline: none;
    " />
    <div id="name-error" style="color: #ff6b6b; font-size: 13px; min-height: 16px; text-align: center;"></div>
    <button id="name-submit" style="
      width: 100%;
      padding: 10px;
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      background: #2ecc71;
      color: #0a2e1a;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    ">Entrar</button>
  </div>
`;

export default class NameEntryScene extends Phaser.Scene {
  constructor() {
    super('name-entry');
  }

  create() {
    this.isSubmitting = false;

    this.formDom = this.add.dom(0, 0).createFromHTML(FORM_HTML);
    this.positionForm();
    this.scale.on('resize', this.positionForm, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.positionForm, this));

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
