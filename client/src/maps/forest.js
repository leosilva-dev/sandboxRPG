// Geração procedural do terreno do mapa "forest": grama de base, um caminho
// de pedra serpenteando entre pontos de passagem, e bosques espalhados com
// árvores/arbustos/pedras variados. Determinístico (seed fixa) para o
// layout não mudar a cada reload.

const SEED = 20260712;

function mulberry32(seed) {
  let state = seed;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function key(x, y) {
  return `${x},${y}`;
}

function buildPath(from, to, rng) {
  const cells = [];
  let [x, y] = from;
  const [tx, ty] = to;

  while (x !== tx || y !== ty) {
    cells.push([x, y]);
    const canMoveX = x !== tx;
    const canMoveY = y !== ty;
    const moveX = canMoveX && (!canMoveY || rng() < 0.6);
    if (moveX) x += x < tx ? 1 : -1;
    else y += y < ty ? 1 : -1;
  }
  cells.push([x, y]);
  return cells;
}

function generateRoad(size, rng) {
  const road = new Set();
  const margin = 4;
  const waypoints = [
    [margin, Math.floor(size / 2)],
    [Math.floor(size * 0.35), margin],
    [Math.floor(size * 0.65), size - margin],
    [size - margin, Math.floor(size * 0.55)],
  ];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const cells = buildPath(waypoints[i], waypoints[i + 1], rng);
    cells.forEach(([x, y]) => road.add(key(x, y)));
  }

  return road;
}

const TREE_VARIANTS = ['treeSmall', 'treeMedium', 'treeLarge'];
const BUSH_VARIANTS = ['bush1', 'bush2', 'bush3', 'bush4', 'bush5', 'bush6'];
const ROCK_VARIANTS = ['rock1', 'rock2', 'rock3', 'rock4', 'rock5', 'rock6'];
const GRASS_TUFT_VARIANTS = [
  'grassTuft1',
  'grassTuft2',
  'grassTuft3',
  'grassTuft4',
  'grassTuft5',
  'grassTuft6',
];

function pick(rng, variants) {
  return variants[Math.floor(rng() * variants.length)];
}

function generateForestPatches(size, rng, blocked) {
  const decorations = [];
  const patches = [
    { cx: size * 0.15, cy: size * 0.15, radius: size * 0.12 },
    { cx: size * 0.85, cy: size * 0.15, radius: size * 0.11 },
    { cx: size * 0.15, cy: size * 0.85, radius: size * 0.13 },
    { cx: size * 0.85, cy: size * 0.85, radius: size * 0.12 },
    { cx: size * 0.5, cy: size * 0.08, radius: size * 0.07 },
  ];

  patches.forEach(({ cx, cy, radius }) => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(size - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(size - 1, Math.ceil(cy + radius));

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (blocked.has(key(x, y))) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) continue;
        const density = 0.4 * (1 - d / radius) + 0.05;
        if (rng() > density) continue;

        const roll = rng();
        const variantKey =
          roll < 0.55 ? pick(rng, TREE_VARIANTS) : roll < 0.85 ? pick(rng, BUSH_VARIANTS) : pick(rng, ROCK_VARIANTS);

        decorations.push({
          x: x + (rng() - 0.35) * 0.6,
          y: y + (rng() - 0.35) * 0.6,
          key: variantKey,
        });
      }
    }
  });

  return decorations;
}

// Espalha touceiras de grama/flor pelo resto do mapa (fora dos bosques e do
// caminho) pra quebrar a monotonia do verde liso, com densidade baixa.
function generateGrassTufts(size, rng, blocked) {
  const decorations = [];
  const density = 0.03;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (blocked.has(key(x, y))) continue;
      if (rng() > density) continue;
      decorations.push({
        x: x + (rng() - 0.5) * 0.8,
        y: y + (rng() - 0.5) * 0.8,
        key: pick(rng, GRASS_TUFT_VARIANTS),
      });
    }
  }

  return decorations;
}

export function generateForestMap(size) {
  const rng = mulberry32(SEED);
  const road = generateRoad(size, rng);

  const decorations = [
    ...generateForestPatches(size, rng, road),
    ...generateGrassTufts(size, rng, road),
  ];

  function getGroundKey(x, y) {
    return road.has(key(x, y)) ? 'pathTile' : 'grassTile';
  }

  return { size, getGroundKey, decorations };
}
