export const TILE_WIDTH = 100;
export const TILE_HEIGHT = 65;

export function cartesianToIso(x, y) {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2),
  };
}
