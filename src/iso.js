export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;

export function cartesianToIso(x, y) {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2),
  };
}
