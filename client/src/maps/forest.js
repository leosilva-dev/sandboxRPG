// Geração procedural do terreno do mapa "forest": lago orgânico (autotile de água),
// estrada serpenteando com ponte sobre a água (autotile de estrada) e bosques
// espalhados com árvores/coníferas variadas. Determinístico (seed fixa) para o
// layout não mudar a cada reload.

const SEED = 20260712;
const CARDINALS = ['N', 'E', 'S', 'W'];
const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

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

function inBounds(x, y, size) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

// Sufixo canônico N,E,S,W filtrado pelas direções presentes — casa com a
// convenção de nomes de arquivo do pacote inteiro (waterNE, crossroadNES, etc).
function suffixFor(dirSet) {
  return CARDINALS.filter((d) => dirSet.has(d)).join('');
}

function generateLakes(size, rng) {
  const water = new Set();
  const lakeCount = 2;

  const centerX = size / 2;
  const centerY = size / 2;
  const spawnClearRadius = size * 0.22;

  for (let i = 0; i < lakeCount; i++) {
    let cx;
    let cy;
    do {
      cx = size * 0.15 + rng() * size * 0.7;
      cy = size * 0.15 + rng() * size * 0.7;
    } while (Math.hypot(cx - centerX, cy - centerY) < spawnClearRadius);
    const radius = 5 + rng() * 4;

    for (let x = Math.floor(cx - radius - 2); x <= cx + radius + 2; x++) {
      for (let y = Math.floor(cy - radius - 2); y <= cy + radius + 2; y++) {
        if (!inBounds(x, y, size)) continue;
        const d = Math.hypot(x - cx, y - cy) + (rng() - 0.5) * 3;
        if (d < radius) water.add(key(x, y));
      }
    }
  }

  // Suaviza por autômato celular (regra da maioria) pra virar blobs convexos,
  // sem canais finos nem ilhas de 1 célula que o autotile não sabe desenhar.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Set();
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        let wetNeighbors = 0;
        for (let nx = x - 1; nx <= x + 1; nx++) {
          for (let ny = y - 1; ny <= y + 1; ny++) {
            if (nx === x && ny === y) continue;
            if (water.has(key(nx, ny))) wetNeighbors++;
          }
        }
        const isWet = water.has(key(x, y));
        if (isWet ? wetNeighbors >= 3 : wetNeighbors >= 5) next.add(key(x, y));
      }
    }
    water.clear();
    next.forEach((k) => water.add(k));
  }

  // Remove células de água isoladas (sem vizinho cardinal molhado) — não há
  // tile de "lagoa de 1 célula" no pacote.
  const isolated = [];
  water.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    const hasWetCardinal = CARDINALS.some((d) => {
      const [dx, dy] = DELTA[d];
      return water.has(key(x + dx, y + dy));
    });
    if (!hasWetCardinal) isolated.push(k);
  });
  isolated.forEach((k) => water.delete(k));

  return water;
}

function waterTileKey(water, x, y) {
  const grassDirs = new Set();
  CARDINALS.forEach((d) => {
    const [dx, dy] = DELTA[d];
    if (!water.has(key(x + dx, y + dy))) grassDirs.add(d);
  });

  if (grassDirs.size === 0) return 'water';

  if (grassDirs.size === 1) return `water${suffixFor(grassDirs)}`;

  if (grassDirs.size === 2) {
    const suffix = suffixFor(grassDirs);
    if (suffix === 'NE' || suffix === 'NW' || suffix === 'SW' || suffix === 'ES') {
      return `water${suffix}`;
    }
    // par oposto (NS ou EW) não tem tile dedicado — cai pra 1 lado só.
    return `water${CARDINALS.find((d) => grassDirs.has(d))}`;
  }

  // 3-4 lados com grama: célula quase isolada, aproxima pro primeiro par válido.
  for (const suffix of ['NE', 'NW', 'SW', 'ES']) {
    const dirs = suffix.split('');
    if (dirs.every((d) => grassDirs.has(d))) return `water${suffix}`;
  }
  return `water${CARDINALS.find((d) => grassDirs.has(d))}`;
}

function waterCornerTileKey(water, x, y) {
  // Célula seca com água só na diagonal (cantinho convexo arredondado).
  const diagonals = {
    NE: [1, -1],
    NW: [-1, -1],
    SW: [-1, 1],
    ES: [1, 1],
  };
  for (const [suffix, [dx, dy]] of Object.entries(diagonals)) {
    const [cardinalA, cardinalB] = suffix.split('');
    const [dxA, dyA] = DELTA[cardinalA];
    const [dxB, dyB] = DELTA[cardinalB];
    const cardinalAWet = water.has(key(x + dxA, y + dyA));
    const cardinalBWet = water.has(key(x + dxB, y + dyB));
    const diagonalWet = water.has(key(x + dx, y + dy));
    if (diagonalWet && !cardinalAWet && !cardinalBWet) return `waterCorner${suffix}`;
  }
  return null;
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

function generateRoad(size, rng, water) {
  const road = new Set();
  const bridges = new Map(); // key -> 'NS' | 'EW'
  const margin = 4;
  const waypoints = [
    [margin, Math.floor(size / 2)],
    [Math.floor(size * 0.35), margin],
    [Math.floor(size * 0.65), size - margin],
    [size - margin, Math.floor(size * 0.55)],
  ];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const cells = buildPath(waypoints[i], waypoints[i + 1], rng);
    cells.forEach(([x, y], idx) => {
      if (water.has(key(x, y))) {
        const [px, py] = idx > 0 ? cells[idx - 1] : cells[idx + 1];
        bridges.set(key(x, y), px === x ? 'NS' : 'EW');
      } else {
        road.add(key(x, y));
      }
    });
  }

  return { road, bridges };
}

function roadTileKey(road, x, y, size) {
  const connected = new Set();
  CARDINALS.forEach((d) => {
    const [dx, dy] = DELTA[d];
    if (inBounds(x + dx, y + dy, size) && road.has(key(x + dx, y + dy))) connected.add(d);
  });

  if (connected.size === 0) return 'road';
  if (connected.size === 1) return `end${suffixFor(connected)}`;
  if (connected.size === 2) return `road${suffixFor(connected)}`;
  if (connected.size === 3) return `crossroad${suffixFor(connected)}`;
  return 'crossroad';
}

const TREE_VARIANTS = [
  'treeShort',
  'treeTall',
  'treeAltShort',
  'treeAltTall',
  'coniferShort',
  'coniferTall',
  'coniferAltShort',
  'coniferAltTall',
];

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

        decorations.push({
          x: x + (rng() - 0.35) * 0.6,
          y: y + (rng() - 0.35) * 0.6,
          key: TREE_VARIANTS[Math.floor(rng() * TREE_VARIANTS.length)],
        });
      }
    }
  });

  return decorations;
}

export function generateForestMap(size) {
  const rng = mulberry32(SEED);
  const water = generateLakes(size, rng);
  const { road, bridges } = generateRoad(size, rng, water);

  const blockedForForest = new Set([...water, ...road, ...bridges.keys()]);
  const decorations = generateForestPatches(size, rng, blockedForForest);

  function getGroundKey(x, y) {
    const k = key(x, y);
    if (bridges.has(k)) return bridges.get(k) === 'NS' ? 'bridgeNS' : 'bridgeEW';
    if (road.has(k)) return roadTileKey(road, x, y, size);
    if (water.has(k)) return waterTileKey(water, x, y);
    const corner = waterCornerTileKey(water, x, y);
    if (corner) return corner;
    return 'grassWhole';
  }

  return { size, getGroundKey, decorations };
}
