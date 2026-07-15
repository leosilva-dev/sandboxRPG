export const TILE_SIZE = 64;

export function gridToScreen(x, y) {
  return {
    x: x * TILE_SIZE,
    y: y * TILE_SIZE,
  };
}
