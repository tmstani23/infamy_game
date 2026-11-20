// Frontier weather, purely visual (Tim 2026-11-20): which weather shows where the camera is.
// No game state: picked from the half-day (day or night of the clock day) and the biome under the
// camera with a fixed hash, so every client shows the same weather and saves need nothing.
// Numbers in data/weather.json; drawn by render/weather.js. Node tests: tools/test_weather.mjs.

// small integer hash -> 0..1
export function hash01(...n) {
  let h = 2166136261 >>> 0;
  for (const v of n) { h ^= (v | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

const BIOMES = ['forest', 'snow', 'dry'];

// the half-day number: day 1 daytime = 2, day 1 night = 3, ...
export const spellOf = (day, night) => Math.max(0, Math.floor(day ?? 1)) * 2 + (night ? 1 : 0);

// -> { kind, tint, fog, rain, snow, wind: { angle, speed } }
export function pickWeather(cfg, biome, day, night) {
  const b = cfg.biomes[biome] || cfg.biomes.forest, spell = spellOf(day, night);
  const table = Object.entries((night && b.night) || b.day);
  const total = table.reduce((n, [, w]) => n + w, 0);
  let r = hash01(cfg.seed, spell, BIOMES.indexOf(biome) + 1) * total, kind = table[0][0];
  for (const [k, w] of table) { if (r < w) { kind = k; break; } r -= w; }
  const k = cfg.kinds[kind] || cfg.kinds.clear;
  // one wind for the whole island each half-day, so it does not swing when the camera crosses biomes
  const angle = hash01(cfg.seed, spell, 99) * Math.PI * 2;
  const speed = (cfg.wind.min + hash01(cfg.seed, spell, 98) * (cfg.wind.max - cfg.wind.min)) * (k.wind || 1);
  return { kind, tint: b.tint, fog: k.fog, rain: k.rain, snow: k.snow, wind: { angle, speed } };
}

// ease the shown weather toward the picked one (amounts only; the tint and wind follow the new pick)
export function easeWeather(now, target, dt, fadeSeconds) {
  if (!now) return { ...target, wind: { ...target.wind } };
  const k = Math.min(1, dt / Math.max(0.01, fadeSeconds));
  const step = (a, b) => a + (b - a) * k;
  // the tint swaps only when little fog is left, so frost never pops into dust
  const tint = now.tint !== target.tint && now.fog > 0.08 ? now.tint : target.tint;
  const fogGoal = tint === target.tint ? target.fog : 0;
  // wind turns the short way round
  let da = target.wind.angle - now.wind.angle; da = Math.atan2(Math.sin(da), Math.cos(da));
  return { kind: target.kind, tint, fog: step(now.fog, fogGoal), rain: step(now.rain, target.rain), snow: step(now.snow, target.snow),
    wind: { angle: now.wind.angle + da * k, speed: step(now.wind.speed, target.wind.speed) } };
}
