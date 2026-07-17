// Lago determinístico do mapa "forest": mesma técnica de mancha orgânica
// (raio variando por harmônicos senoidais) usada pelas zonas do bioma em
// forest.js, mas mora em shared/ porque tanto o client (desenho + spawn de
// decoração) quanto o servidor (colisão autoritativa) precisam concordar
// sobre exatamente onde é água. Usa sua própria seed/rng, independente da
// sequência de geração do resto do mapa, pra não deslocar a posição de
// estrada/zonas/decorações já existentes.
const LAKE_SEED = 20260713;

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

function blobRadiusFactor(angle, harmonics) {
  let mod = 1;
  harmonics.forEach(({ freq, amp, phase }) => {
    mod += amp * Math.sin(freq * angle + phase);
  });
  return Math.max(0.45, mod);
}

export function generateLake(gridSize) {
  const rng = mulberry32(LAKE_SEED);
  const harmonics = [];
  for (let i = 0; i < 3; i++) {
    harmonics.push({
      freq: 2 + Math.floor(rng() * 4),
      amp: 0.12 + rng() * 0.22,
      phase: rng() * Math.PI * 2,
    });
  }
  return {
    cx: gridSize * 0.5,
    cy: gridSize * 0.15,
    radius: gridSize * 0.085,
    harmonics,
  };
}

export function lakeLocalRadius(lake, x, y) {
  const angle = Math.atan2(y - lake.cy, x - lake.cx);
  return lake.radius * blobRadiusFactor(angle, lake.harmonics);
}

export function isInLake(lake, x, y) {
  const dx = x - lake.cx;
  const dy = y - lake.cy;
  return Math.hypot(dx, dy) <= lakeLocalRadius(lake, x, y);
}
