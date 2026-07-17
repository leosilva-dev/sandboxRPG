// Geração procedural do terreno do mapa "forest": grama de base com variação
// sutil de tom (pra quebrar o tile liso repetido), zonas orgânicas com
// identidade própria (mata fechada, região rochosa, clareiras, bosque de
// árvores grandes), marcos fixos compostos só com os assets existentes
// (anel de pedras, árvore ancestral, amontoado de pedras) e um caminho de
// pedra serpenteando entre pontos de passagem. Determinístico (seed fixa)
// para o layout não mudar a cada reload.

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
  return `${Math.round(x)},${Math.round(y)}`;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Hash determinístico de coordenadas inteiras -> [0,1). Não depende da
// sequência do rng porque getGroundTint é chamada sob demanda por tile
// (não durante a geração), então precisa ser uma função pura de (x, y).
function hashLatticePoint(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Ruído "value noise" com interpolação bilinear numa malha esparsa (um ponto
// aleatório a cada `cell` tiles) — dá manchas suaves de variação de tom em
// vez de um valor independente por tile, que lido de perto parecia estática.
function smoothNoise(x, y, cell) {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const sx = gx - x0;
  const sy = gy - y0;

  const n00 = hashLatticePoint(x0, y0);
  const n10 = hashLatticePoint(x0 + 1, y0);
  const n01 = hashLatticePoint(x0, y0 + 1);
  const n11 = hashLatticePoint(x0 + 1, y0 + 1);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
}

function hexLerp(a, b, t) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function applyBrightness(hex, factor) {
  const r = clamp01(((hex >> 16) & 0xff) / 255 * factor) * 255;
  const g = clamp01(((hex >> 8) & 0xff) / 255 * factor) * 255;
  const b = clamp01((hex & 0xff) / 255 * factor) * 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// Bresenham simples — preenche os buracos entre pontos consecutivos da curva
// serpenteante (o passo ao longo dela pode saltar mais de 1 tile na diagonal).
function lineCells(x0, y0, x1, y1) {
  const cells = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    cells.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

// Caminho reto entre dois waypoints deslocado perpendicularmente por uma
// onda de dois harmônicos — dá uma curva serpenteante suave em vez da linha
// reta em esquadro que o random-walk original produzia (ficava um corredor
// de dezenas de tiles perfeitamente vertical/horizontal). O deslocamento
// afunila pra zero nas pontas (`taper`) pra encaixar certinho nos waypoints.
function buildMeanderingPath(from, to, rng) {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;

  const amp1 = 2.5 + rng() * 2;
  const freq1 = 1 + Math.floor(rng() * 2);
  const phase1 = rng() * Math.PI * 2;
  const amp2 = 1.2 + rng() * 1.2;
  const freq2 = freq1 + 2 + Math.floor(rng() * 2);
  const phase2 = rng() * Math.PI * 2;

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble =
      amp1 * Math.sin(freq1 * t * Math.PI * 2 + phase1) + amp2 * Math.sin(freq2 * t * Math.PI * 2 + phase2);
    const taper = Math.sin(t * Math.PI);
    points.push([x0 + dx * t + perpX * wobble * taper, y0 + dy * t + perpY * wobble * taper]);
  }
  return points;
}

function buildPath(from, to, rng, size) {
  const cells = [];
  const points = buildMeanderingPath(from, to, rng);

  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    lineCells(Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by)).forEach(([x, y]) => {
      if (x >= 0 && y >= 0 && x < size && y < size) cells.push([x, y]);
    });
  }

  return cells;
}

// Plaza pequena em cruz nos pontos de passagem intermediários, pra parecerem
// entroncamentos de verdade em vez do caminho só "passar reto" por eles.
function stampPlaza(road, cx, cy) {
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  offsets.forEach(([dx, dy]) => road.add(key(cx + dx, cy + dy)));
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
    const cells = buildPath(waypoints[i], waypoints[i + 1], rng, size);
    cells.forEach(([x, y]) => road.add(key(x, y)));
  }

  waypoints.slice(1, -1).forEach(([x, y]) => stampPlaza(road, x, y));

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

// Perfis de zona: cada tipo tem uma cor de identidade (aplicada como tint no
// chão, misturada por proximidade do centro) e pesos de composição da
// vegetação/decoração, todos usando só os assets já existentes.
const ZONE_TYPES = {
  denseForest: {
    tint: 0x4f6a3a,
    maxDensity: 0.55,
    weights: { tree: 0.55, bush: 0.3, rock: 0.1, tuft: 0.05 },
  },
  rocky: {
    tint: 0x8d8a6d,
    maxDensity: 0.45,
    weights: { tree: 0.1, bush: 0.15, rock: 0.6, tuft: 0.15 },
  },
  meadow: {
    tint: 0xc7d478,
    maxDensity: 0.28,
    weights: { tree: 0.05, bush: 0.15, rock: 0.05, tuft: 0.75 },
  },
  grove: {
    tint: 0x5d7a49,
    maxDensity: 0.22,
    weights: { tree: 0.75, bush: 0.1, rock: 0.05, tuft: 0.1 },
    bigTrees: true,
  },
};

// Forma orgânica de "mancha": o raio varia com o ângulo somando alguns
// harmônicos senoidais com amplitude/fase aleatórias, então a zona nunca sai
// um círculo perfeito.
function makeBlobShape(rng) {
  const harmonics = 3;
  const terms = [];
  for (let i = 0; i < harmonics; i++) {
    terms.push({
      freq: 2 + Math.floor(rng() * 4),
      amp: 0.12 + rng() * 0.22,
      phase: rng() * Math.PI * 2,
    });
  }
  return (angle) => {
    let mod = 1;
    terms.forEach(({ freq, amp, phase }) => {
      mod += amp * Math.sin(freq * angle + phase);
    });
    return Math.max(0.45, mod);
  };
}

function buildZones(size, rng) {
  const defs = [
    { cx: 0.15, cy: 0.15, r: 0.15, type: 'denseForest' },
    { cx: 0.85, cy: 0.18, r: 0.13, type: 'rocky' },
    { cx: 0.14, cy: 0.85, r: 0.16, type: 'denseForest' },
    { cx: 0.85, cy: 0.85, r: 0.14, type: 'meadow' },
    { cx: 0.32, cy: 0.62, r: 0.09, type: 'grove' },
    { cx: 0.5, cy: 0.5, r: 0.11, type: 'meadow' },
  ];

  return defs.map(({ cx, cy, r, type }) => ({
    cx: size * cx,
    cy: size * cy,
    radius: size * r,
    type,
    shape: makeBlobShape(rng),
  }));
}

function zoneInfluenceAt(zones, x, y) {
  let best = null;
  zones.forEach((zone) => {
    const dx = x - zone.cx;
    const dy = y - zone.cy;
    const d = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const localRadius = zone.radius * zone.shape(angle);
    if (d > localRadius) return;
    const strength = 1 - d / localRadius;
    if (!best || strength > best.strength) best = { zone, strength, d, localRadius };
  });
  return best;
}

function pickForZoneType(rng, zoneType) {
  const { weights, bigTrees } = ZONE_TYPES[zoneType];
  const roll = rng();
  if (roll < weights.tree) {
    if (bigTrees) return rng() < 0.7 ? 'treeLarge' : 'treeMedium';
    return pick(rng, TREE_VARIANTS);
  }
  if (roll < weights.tree + weights.bush) return pick(rng, BUSH_VARIANTS);
  if (roll < weights.tree + weights.bush + weights.rock) return pick(rng, ROCK_VARIANTS);
  return pick(rng, GRASS_TUFT_VARIANTS);
}

function generateZoneDecorations(size, rng, zones, blocked) {
  const decorations = [];

  zones.forEach((zone) => {
    const profile = ZONE_TYPES[zone.type];
    const reach = zone.radius * 1.4; // cobre o "estouro" do blob orgânico
    const minX = Math.max(0, Math.floor(zone.cx - reach));
    const maxX = Math.min(size - 1, Math.ceil(zone.cx + reach));
    const minY = Math.max(0, Math.floor(zone.cy - reach));
    const maxY = Math.min(size - 1, Math.ceil(zone.cy + reach));

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (blocked.has(key(x, y))) continue;
        const dx = x - zone.cx;
        const dy = y - zone.cy;
        const d = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const localRadius = zone.radius * zone.shape(angle);
        if (d > localRadius) continue;

        const density = profile.maxDensity * (1 - d / localRadius) + 0.03;
        if (rng() > density) continue;

        decorations.push({
          x: x + (rng() - 0.35) * 0.6,
          y: y + (rng() - 0.35) * 0.6,
          key: pickForZoneType(rng, zone.type),
          scale: 0.85 + rng() * 0.35,
        });
      }
    }
  });

  return decorations;
}

// Espalha touceiras de grama/flor por fora das zonas com identidade própria,
// bem esparso, só pra nenhum canto do mapa ficar 100% liso.
function generateAmbientTufts(size, rng, blocked) {
  const decorations = [];
  const density = 0.02;

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (blocked.has(key(x, y))) continue;
      if (rng() > density) continue;
      decorations.push({
        x: x + (rng() - 0.5) * 0.8,
        y: y + (rng() - 0.5) * 0.8,
        key: pick(rng, GRASS_TUFT_VARIANTS),
        scale: 0.8 + rng() * 0.3,
      });
    }
  }

  return decorations;
}

// Marcos fixos, compostos só com os assets existentes (pedras/árvores), pra
// dar pontos de referência memoráveis em vez de só vegetação espalhada.
function generateLandmarks(size, rng) {
  const decorations = [];
  const occupied = new Set();
  const stamp = (x, y) => occupied.add(key(x, y));

  // Árvore ancestral: uma treeLarge cercada por um anel de pedras, como um
  // pequeno santuário no meio do bosque de árvores grandes.
  {
    const cx = size * 0.32;
    const cy = size * 0.6;
    decorations.push({ x: cx, y: cy, key: 'treeLarge', scale: 1.35 });
    stamp(cx, cy);
    const ringCount = 8;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + rng() * 0.2;
      const rx = cx + Math.cos(angle) * 2.4;
      const ry = cy + Math.sin(angle) * 2.4;
      decorations.push({
        x: rx + (rng() - 0.5) * 0.3,
        y: ry + (rng() - 0.5) * 0.3,
        key: pick(rng, ROCK_VARIANTS),
        scale: 0.8 + rng() * 0.3,
      });
      stamp(rx, ry);
    }
  }

  // Anel de pedras: um círculo isolado no meio do campo aberto, como ruínas
  // antigas — um destino claro pra explorar.
  {
    const cx = size * 0.8;
    const cy = size * 0.4;
    const ringCount = 10;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const rx = cx + Math.cos(angle) * 3.2;
      const ry = cy + Math.sin(angle) * 3.2;
      decorations.push({
        x: rx,
        y: ry,
        key: pick(rng, ROCK_VARIANTS),
        scale: 1 + rng() * 0.2,
      });
      stamp(rx, ry);
    }
    decorations.push({ x: cx, y: cy, key: pick(rng, GRASS_TUFT_VARIANTS) });
    stamp(cx, cy);
  }

  // Amontoado de pedras: pedras grandes empilhadas visualmente, tipo um
  // afloramento rochoso na borda da região rochosa.
  {
    const cx = size * 0.9;
    const cy = size * 0.75;
    for (let i = 0; i < 5; i++) {
      const x = cx + (rng() - 0.5) * 1.6;
      const y = cy + (rng() - 0.5) * 1.6;
      decorations.push({ x, y, key: pick(rng, ROCK_VARIANTS), scale: 1.4 + rng() * 0.5 });
      stamp(x, y);
    }
    decorations.push({ x: cx + 1.2, y: cy + 0.6, key: pick(rng, BUSH_VARIANTS), scale: 1.1 });
    stamp(cx, cy);
  }

  return { decorations, occupied };
}

const GRASS_BASE_TINT = 0xffffff;
const PATH_BASE_TINT = 0xffffff;
const ZONE_BLEND_STRENGTH = 0.85; // nunca funde 100% puro, mantém textura do tile original

export function generateForestMap(size) {
  const rng = mulberry32(SEED);
  const road = generateRoad(size, rng);
  const zones = buildZones(size, rng);
  const { decorations: landmarkDecorations, occupied } = generateLandmarks(size, rng);

  const blocked = new Set([...road, ...occupied]);

  const decorations = [
    ...generateZoneDecorations(size, rng, zones, blocked),
    ...generateAmbientTufts(size, rng, blocked),
    ...landmarkDecorations,
  ];

  function getGroundKey(x, y) {
    return road.has(key(x, y)) ? 'pathTile' : 'grassTile';
  }

  // Tint por tile: variação sutil de brilho em todo canto (quebra o tile
  // liso repetido) mais a cor de identidade da zona mais próxima, quando o
  // tile cai dentro de uma.
  function getGroundTint(x, y) {
    const isPath = road.has(key(x, y));
    const jitter = 0.92 + smoothNoise(x, y, 5) * 0.16;

    let tint = isPath ? PATH_BASE_TINT : GRASS_BASE_TINT;
    if (!isPath) {
      const influence = zoneInfluenceAt(zones, x, y);
      if (influence) {
        const t = influence.strength * ZONE_BLEND_STRENGTH;
        tint = hexLerp(GRASS_BASE_TINT, ZONE_TYPES[influence.zone.type].tint, t);
      }
    }

    return applyBrightness(tint, jitter);
  }

  return { size, name: 'Floresta', getGroundKey, getGroundTint, decorations };
}
