import { Client, getStateCallbacks } from 'colyseus.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';

export default class GameClient {
  constructor() {
    this.client = new Client(SERVER_URL);
    this.room = null;
    this.$ = null;
    this.lastSentInputKey = null;
  }

  async connect(mapId, options = {}) {
    this.room = await this.client.joinOrCreate(mapId, options);
    this.$ = getStateCallbacks(this.room);
    return this.room;
  }

  get isConnected() {
    return this.room !== null;
  }

  get sessionId() {
    return this.room?.sessionId ?? null;
  }

  onPlayerAdd(callback) {
    this.$(this.room.state).players.onAdd(callback);
  }

  onPlayerRemove(callback) {
    this.$(this.room.state).players.onRemove(callback);
  }

  // Só envia quando o estado das teclas muda — o servidor mantém o último
  // valor recebido e continua simulando o movimento a cada tick.
  sendInput(input) {
    if (!this.room) return;
    const key = `${input.up}|${input.down}|${input.left}|${input.right}|${input.run}`;
    if (key === this.lastSentInputKey) return;
    this.lastSentInputKey = key;
    this.room.send('input', input);
  }

  sendJump() {
    this.room?.send('jump');
  }
}
