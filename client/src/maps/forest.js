// Geração procedural do terreno do mapa "forest": chão autotiled de verdade
// (grama/caminho de terra, com bordas reais tiradas do tilemap Tiny Swords),
// zonas orgânicas com identidade própria (mata fechada, região rochosa,
// clareiras, bosque de árvores grandes), marcos fixos compostos só com os
// assets existentes (anel de pedras, árvore ancestral, amontoado de pedras)
// e um caminho serpenteando entre pontos de passagem. Determinístico (seed
// fixa) para o layout não mudar a cada reload.

import { generateLake, isInLake } from '@rpg/shared';

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
// sequência do rng porque é usado sob demanda por tile (não durante a
// geração), então precisa ser uma função pura de (x, y).
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

// Carimba um disco de raio fixo em cada ponto da curva contínua (bem mais
// pontos do que células, então os discos vizinhos sempre se sobrepõem). Isso
// dá um traçado largo com contorno relativamente suave direto na origem —
// diferente de rasterizar uma linha fina em "escada" e só depois dilatar,
// que preserva cada degrau da escada e deixa bolsões de grama presos entre
// dois trechos próximos do próprio caminho.
const PATH_RADIUS = 1.4;

function buildPath(from, to, rng, size) {
  const cells = [];
  const points = buildMeanderingPath(from, to, rng);
  const r2 = PATH_RADIUS * PATH_RADIUS;
  const ir = Math.ceil(PATH_RADIUS);

  points.forEach(([px, py]) => {
    const cx = Math.round(px);
    const cy = Math.round(py);
    for (let dx = -ir; dx <= ir; dx++) {
      for (let dy = -ir; dy <= ir; dy++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < size && y < size) cells.push([x, y]);
      }
    }
  });

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

// Depois do carimbo de disco, ainda podem sobrar bolsões de 1-2 tiles de
// grama quase engolidos pelo caminho (3 ou 4 dos 4 vizinhos cardeais já são
// caminho) — a grama nesses bolsões usa a arte de "borda", e como não sobra
// vizinho pra combinar direito, isso aparece como uma mancha com contorno
// escuro cravada no meio do caminho. Fecha esses bolsões preenchendo com
// caminho também, o que resolve sem precisar de peças de canto côncavo.
function closeNotchesPass(road, size) {
  const closed = new Set(road);
  let changed = false;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (road.has(key(x, y))) continue;
      let pathNeighbors = 0;
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([dx, dy]) => {
        if (road.has(key(x + dx, y + dy))) pathNeighbors += 1;
      });
      if (pathNeighbors >= 3) {
        closed.add(key(x, y));
        changed = true;
      }
    }
  }
  return { closed, changed };
}

// Bolsões maiores que 1 tile (ex: dois tiles de grama grudados, cada um só
// com 2 vizinhos de caminho) não fecham numa passada só — fechar um libera o
// vizinho pra também virar 3+. Repete até estabilizar (ou um teto de
// segurança) em vez de tentar prever cada topologia de escada na mão.
function closeNotches(road, size) {
  let current = road;
  for (let i = 0; i < 6; i++) {
    const { closed, changed } = closeNotchesPass(current, size);
    current = closed;
    if (!changed) break;
  }
  return current;
}

function generateRoad(size, rng) {
  let road = new Set();
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

  road = closeNotches(road, size);
  waypoints.slice(1, -1).forEach(([x, y]) => stampPlaza(road, x, y));

  return road;
}

// --- Autotile do chão (Tiny Swords update-010, terrain/ground/tilemap-flat.png) ---
// Folha 640x256 = 10 colunas x 4 linhas de 64px. Conferido pixel a pixel: o
// "blob" de grama é na verdade só 3x3 (col0/row0 = borda, col1/row1 = recorte
// liso, col2/row2 = borda do outro lado) — col3/row3 são peças extras
// separadas, não uma continuação. O bloco de areia só tem um recorte liso
// confirmado (col6) e uma borda (col7); sem contraparte confiável do outro
// lado, então a areia fica sempre lisa e só a grama ganha um contorno fino
// onde encosta no caminho — um toque de detalhe sem exagerar.
const GROUND_SHEET_KEY = 'ground-tiles';
const GROUND_SHEET_COLS = 10;
const GRASS_EDGE = { left: 0, fill: 1, right: 2 };
const GRASS_ROW = { top: 0, fill: 1, bottom: 2 };
const PATH_FILL_FRAME = 1 * GROUND_SHEET_COLS + 6; // col 6, row 1 — lisa, confirmada

function frameIndex(col, row) {
  return row * GROUND_SHEET_COLS + col;
}

function makeGroundFrameGetter(size, road, water) {
  const isPath = (x, y) => road.has(key(x, y));
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;

  return function getGroundFrame(x, y) {
    if (water.has(key(x, y))) return { key: WATER_TILE_KEY, frame: undefined };
    if (isPath(x, y)) return { key: GROUND_SHEET_KEY, frame: PATH_FILL_FRAME };

    // Fora do caminho: só ganha o contorno fino se encostar nele — o interior
    // do campo aberto continua liso.
    const pathAt = (nx, ny) => (inBounds(nx, ny) ? isPath(nx, ny) : false);
    const colClass = pathAt(x - 1, y) ? 'left' : pathAt(x + 1, y) ? 'right' : 'fill';
    const rowClass = pathAt(x, y - 1) ? 'top' : pathAt(x, y + 1) ? 'bottom' : 'fill';
    return { key: GROUND_SHEET_KEY, frame: frameIndex(GRASS_EDGE[colClass], GRASS_ROW[rowClass]) };
  };
}

// --- Lago (Tiny Swords update-010: terrain/water/water.png + terrain/water/foam/foam.png) ---
// A forma do lago vem de shared/water.js (a mesma fonte que o servidor usa
// pra colisão autoritativa) — aqui só cuidamos do desenho: tile de água cheio
// no interior, com espuma espalhada na margem pra suavizar o encontro com a
// grama, já que o pack não tem peças de autotile dedicadas a costa no estilo
// top-down flat. Usa uma seed própria, separada da sequência principal, pra
// não deslocar a posição de árvores/decorações já geradas.
const WATER_TILE_KEY = 'water-tile';
const FOAM_SHEET_KEY = 'foam-tiles';
const FOAM_FRAME_COUNT = 8;
const FOAM_SEED = 20260714;
const WATER_BASE_TINT = 0xffffff;

function buildWaterTiles(size, lake) {
  const water = new Set();
  const reach = lake.radius * 1.4;
  const minX = Math.max(0, Math.floor(lake.cx - reach));
  const maxX = Math.min(size - 1, Math.ceil(lake.cx + reach));
  const minY = Math.max(0, Math.floor(lake.cy - reach));
  const maxY = Math.min(size - 1, Math.ceil(lake.cy + reach));

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (isInLake(lake, x, y)) water.add(key(x, y));
    }
  }
  return water;
}

function isShoreTile(water, x, y) {
  return (
    !water.has(key(x - 1, y)) ||
    !water.has(key(x + 1, y)) ||
    !water.has(key(x, y - 1)) ||
    !water.has(key(x, y + 1))
  );
}

function generateShoreFoam(water) {
  const rng = mulberry32(FOAM_SEED);
  const decorations = [];
  water.forEach((cellKey) => {
    const [x, y] = cellKey.split(',').map(Number);
    if (!isShoreTile(water, x, y) || rng() > 0.5) return;
    decorations.push({
      x: x + (rng() - 0.5) * 0.5,
      y: y + (rng() - 0.5) * 0.5,
      key: FOAM_SHEET_KEY,
      frame: Math.floor(rng() * FOAM_FRAME_COUNT),
      scale: 0.45 + rng() * 0.15,
    });
  });
  return decorations;
}

// --- Decorações (Tiny Swords update-010: Deco/*.png soltos + Resources/Trees/Tree.png em folha) ---
const TREE_SHEET_KEY = 'tree-tiles';
const TREE_FRAME_COUNT = 6; // 6 coníferas na folha 4x3 (as outras 6 células ficam vazias/tronco)
const TREE_BASE_SCALE = 0.75;
const DECO_BASE_SCALE = 1.05;

const BUSH_DECO = ['deco-07', 'deco-08', 'deco-09'];
const ROCK_DECO = ['deco-04', 'deco-05', 'deco-06'];
const TUFT_DECO = ['deco-10', 'deco-11', 'deco-01', 'deco-02'];

function pick(rng, variants) {
  return variants[Math.floor(rng() * variants.length)];
}

function pickTree(rng) {
  return { key: TREE_SHEET_KEY, frame: Math.floor(rng() * TREE_FRAME_COUNT), baseScale: TREE_BASE_SCALE };
}

function pickDeco(rng, variants) {
  return { key: pick(rng, variants), frame: undefined, baseScale: DECO_BASE_SCALE };
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
    const variant = pickTree(rng);
    if (bigTrees) variant.baseScale *= 1.3;
    return variant;
  }
  if (roll < weights.tree + weights.bush) return pickDeco(rng, BUSH_DECO);
  if (roll < weights.tree + weights.bush + weights.rock) return pickDeco(rng, ROCK_DECO);
  return pickDeco(rng, TUFT_DECO);
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

        const variant = pickForZoneType(rng, zone.type);
        decorations.push({
          x: x + (rng() - 0.35) * 0.6,
          y: y + (rng() - 0.35) * 0.6,
          key: variant.key,
          frame: variant.frame,
          scale: variant.baseScale * (0.85 + rng() * 0.35),
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
      const variant = pickDeco(rng, TUFT_DECO);
      decorations.push({
        x: x + (rng() - 0.5) * 0.8,
        y: y + (rng() - 0.5) * 0.8,
        key: variant.key,
        frame: variant.frame,
        scale: variant.baseScale * (0.8 + rng() * 0.3),
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

  // Árvore ancestral: uma conífera grande cercada por um anel de pedras, como
  // um pequeno santuário no meio do bosque de árvores grandes.
  {
    const cx = size * 0.32;
    const cy = size * 0.6;
    const tree = pickTree(rng);
    decorations.push({ x: cx, y: cy, key: tree.key, frame: tree.frame, scale: tree.baseScale * 1.6 });
    stamp(cx, cy);
    const ringCount = 8;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + rng() * 0.2;
      const rx = cx + Math.cos(angle) * 2.4;
      const ry = cy + Math.sin(angle) * 2.4;
      decorations.push({
        x: rx + (rng() - 0.5) * 0.3,
        y: ry + (rng() - 0.5) * 0.3,
        key: pick(rng, ROCK_DECO),
        scale: DECO_BASE_SCALE * (0.8 + rng() * 0.3),
      });
      stamp(rx, ry);
    }
  }

  // Anel de pedras: um círculo isolado no meio do campo aberto, como ruínas
  // antigas, com um ídolo de pedra no centro — um destino claro pra explorar.
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
        key: pick(rng, ROCK_DECO),
        scale: DECO_BASE_SCALE * (1 + rng() * 0.2),
      });
      stamp(rx, ry);
    }
    decorations.push({ x: cx, y: cy, key: 'deco-18', scale: 1.1 });
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
      decorations.push({ x, y, key: pick(rng, ROCK_DECO), scale: DECO_BASE_SCALE * (1.4 + rng() * 0.5) });
      stamp(x, y);
    }
    decorations.push({ x: cx + 1.2, y: cy + 0.6, key: pick(rng, BUSH_DECO), scale: DECO_BASE_SCALE * 1.1 });
    stamp(cx, cy);
  }

  return { decorations, occupied };
}

const GRASS_BASE_TINT = 0xffffff;
const ZONE_BLEND_STRENGTH = 0.55; // a textura nova já é bem detalhada — um tint forte demais apaga o desenho

export function generateForestMap(size) {
  const rng = mulberry32(SEED);
  const road = generateRoad(size, rng);
  const zones = buildZones(size, rng);
  const { decorations: landmarkDecorations, occupied } = generateLandmarks(size, rng);

  const lake = generateLake(size);
  const water = buildWaterTiles(size, lake);
  const shoreFoam = generateShoreFoam(water);

  const blocked = new Set([...road, ...occupied, ...water]);

  const decorations = [
    ...generateZoneDecorations(size, rng, zones, blocked),
    ...generateAmbientTufts(size, rng, blocked),
    ...landmarkDecorations,
    ...shoreFoam,
  ];

  const getGroundFrame = makeGroundFrameGetter(size, road, water);

  // Tint por tile: variação sutil de brilho em todo canto (quebra a repetição
  // do tile) mais a cor de identidade da zona mais próxima, quando o tile cai
  // dentro de uma (só no chão de grama — o caminho fica com a cor própria).
  // Água segue sua própria regra: mais escura no fundo do lago, mais clara
  // perto da margem, pra sugerir profundidade sem precisar de arte extra.
  function getGroundTint(x, y) {
    if (water.has(key(x, y))) {
      const dist = Math.hypot(x - lake.cx, y - lake.cy);
      const depthT = clamp01(1 - dist / lake.radius);
      const jitter = 0.94 + smoothNoise(x, y, 4) * 0.1;
      return applyBrightness(WATER_BASE_TINT, (1 - depthT * 0.35) * jitter);
    }

    const isPath = road.has(key(x, y));
    const jitter = 0.92 + smoothNoise(x, y, 5) * 0.16;

    let tint = GRASS_BASE_TINT;
    if (!isPath) {
      const influence = zoneInfluenceAt(zones, x, y);
      if (influence) {
        const t = influence.strength * ZONE_BLEND_STRENGTH;
        tint = hexLerp(GRASS_BASE_TINT, ZONE_TYPES[influence.zone.type].tint, t);
      }
    }

    return applyBrightness(tint, jitter);
  }

  return { size, name: 'Floresta', getGroundFrame, getGroundTint, decorations, lake };
}
