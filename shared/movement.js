export const GRID_SIZE = 60;
export const PLAYER_SPEED = 3.2; // tile units per second
export const PLAYER_RUN_SPEED = 6; // tile units per second
export const WORLD_MARGIN = 0.5;
export const JUMP_SPEED = 220; // px per second, initial upward velocity
export const GRAVITY = 700; // px per second squared

export function computeInputVector({ up, down, left, right }) {
  let dx = 0;
  let dy = 0;
  if (up) dy -= 1;
  if (down) dy += 1;
  if (left) dx -= 1;
  if (right) dx += 1;
  return { dx, dy };
}

export function resolveFacing(current, { up, down, left, right }) {
  if (left && !right) return 'left';
  if (right && !left) return 'right';
  if (up && !down) return 'up';
  if (down && !up) return 'down';
  return current;
}

export function speedForInput(isRunning) {
  return isRunning ? PLAYER_RUN_SPEED : PLAYER_SPEED;
}

// O grid posiciona o centro do tile 0 em x=0 e o do último tile em
// x=gridSize-1, então a borda visual real fica meio tile além desses
// índices — por isso a margem é medida a partir de -0.5/gridSize-0.5,
// não de 0/gridSize (senão sobra folga de um tile de um lado e zero do
// outro).
function clampToBounds(x, y, gridSize, margin) {
  return {
    x: Math.min(Math.max(x, margin - 0.5), gridSize - 0.5 - margin),
    y: Math.min(Math.max(y, margin - 0.5), gridSize - 0.5 - margin),
  };
}

export function stepPosition(position, { dx, dy }, dt, options = {}) {
  if (dx === 0 && dy === 0) return { x: position.x, y: position.y };

  const { speed, gridSize = GRID_SIZE, margin = WORLD_MARGIN, isBlocked } = options;
  const len = Math.hypot(dx, dy);
  const nx = dx / len;
  const ny = dy / len;

  const target = clampToBounds(position.x + nx * speed * dt, position.y + ny * speed * dt, gridSize, margin);
  if (!isBlocked || !isBlocked(target.x, target.y)) return target;

  // Obstáculo (ex: água) no caminho: tenta deslizar só num eixo, como em
  // jogos 2D clássicos, em vez de travar o jogador seco encostado na borda.
  const xOnly = clampToBounds(target.x, position.y, gridSize, margin);
  if (!isBlocked(xOnly.x, xOnly.y)) return xOnly;

  const yOnly = clampToBounds(position.x, target.y, gridSize, margin);
  if (!isBlocked(yOnly.x, yOnly.y)) return yOnly;

  return { x: position.x, y: position.y };
}

// Início do pulo é disparado por evento (tecla pressionada agora), não por
// estado contínuo — por isso fica separado do avanço por tick.
export function startJump(jumpState, options = {}) {
  if (jumpState.isJumping) return jumpState;
  const { jumpSpeed = JUMP_SPEED } = options;
  return { isJumping: true, jumpVelocity: jumpSpeed, jumpHeight: jumpState.jumpHeight };
}

export function advanceJump(jumpState, dt, options = {}) {
  if (!jumpState.isJumping) return jumpState;

  const { gravity = GRAVITY } = options;
  let { jumpVelocity, jumpHeight } = jumpState;

  jumpVelocity -= gravity * dt;
  jumpHeight += jumpVelocity * dt;

  let isJumping = true;
  if (jumpHeight <= 0) {
    jumpHeight = 0;
    jumpVelocity = 0;
    isJumping = false;
  }

  return { isJumping, jumpVelocity, jumpHeight };
}
