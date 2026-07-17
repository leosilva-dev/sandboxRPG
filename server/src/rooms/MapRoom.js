import { Room } from 'colyseus';
import {
  GRID_SIZE,
  computeInputVector,
  resolveFacing,
  speedForInput,
  stepPosition,
  startJump,
  advanceJump,
  normalizeName,
  isValidName,
} from '@rpg/shared';
import { MapState } from '../schema/MapState.js';
import { PlayerState } from '../schema/PlayerState.js';

const TICK_RATE = 20; // Hz

// Sala genérica reaproveitada por cada mapa do jogo (floresta, taverna, caverna...).
// Cada mapa é registrado em index.js sob seu próprio nome, o que garante uma
// única instância isolada por mapa — jogadores de mapas diferentes não se veem.
export class MapRoom extends Room {
  onCreate(options) {
    this.mapId = options?.mapId ?? this.roomName;
    this.setState(new MapState());

    // Estado auxiliar por conexão que não faz parte do schema sincronizado:
    // o input bruto recebido do client e a velocidade instantânea do pulo.
    this.inputs = new Map();
    this.jumpVelocities = new Map();

    this.onMessage('input', (client, message) => {
      this.inputs.set(client.sessionId, {
        up: !!message?.up,
        down: !!message?.down,
        left: !!message?.left,
        right: !!message?.right,
        run: !!message?.run,
      });
    });

    this.onMessage('jump', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const jumped = startJump({
        isJumping: player.isJumping,
        jumpHeight: player.jumpHeight,
      });
      player.isJumping = jumped.isJumping;
      player.jumpHeight = jumped.jumpHeight;
      this.jumpVelocities.set(client.sessionId, jumped.jumpVelocity);
    });

    this.setSimulationInterval((deltaTime) => this.tick(deltaTime), 1000 / TICK_RATE);
  }

  // Roda antes do jogador entrar na sala — rejeitar aqui fecha a conexão
  // de forma limpa (o client recebe o erro na Promise do joinOrCreate) em
  // vez de deixar entrar e só then expulsar depois.
  onAuth(client, options) {
    const name = normalizeName(options?.name);
    if (!isValidName(name)) {
      throw new Error('Nome inválido.');
    }

    const nameTaken = [...this.state.players.values()].some(
      (player) => player.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameTaken) {
      throw new Error('Esse nome já está em uso.');
    }

    return true;
  }

  onJoin(client, options) {
    const player = new PlayerState();
    player.name = normalizeName(options?.name);
    player.x = GRID_SIZE / 2;
    player.y = GRID_SIZE / 2;

    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { up: false, down: false, left: false, right: false, run: false });
    this.jumpVelocities.set(client.sessionId, 0);
    console.log(`[map:${this.mapId}] join ${client.sessionId} (${this.state.players.size} jogador(es))`);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.jumpVelocities.delete(client.sessionId);
    console.log(`[map:${this.mapId}] leave ${client.sessionId} (${this.state.players.size} jogador(es))`);
  }

  tick(deltaTime) {
    const dt = deltaTime / 1000;

    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId);
      if (!input) return;

      const { dx, dy } = computeInputVector(input);
      const isMoving = dx !== 0 || dy !== 0;
      const isRunning = isMoving && input.run;

      const { x, y } = stepPosition(player, { dx, dy }, dt, { speed: speedForInput(isRunning) });
      player.x = x;
      player.y = y;
      player.moving = isMoving;
      player.running = isRunning;
      player.facing = resolveFacing(player.facing, input);

      const jumpState = advanceJump(
        {
          isJumping: player.isJumping,
          jumpVelocity: this.jumpVelocities.get(sessionId) ?? 0,
          jumpHeight: player.jumpHeight,
        },
        dt,
      );
      player.isJumping = jumpState.isJumping;
      player.jumpHeight = jumpState.jumpHeight;
      this.jumpVelocities.set(sessionId, jumpState.jumpVelocity);
    });
  }
}
