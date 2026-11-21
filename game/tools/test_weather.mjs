// Frontier weather picker (src/weather_pick.js, visual only, Tim 2026-11-20).
// Run: node tools/test_weather.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pickWeather, easeWeather, spellOf } from '../src/weather_pick.js';

const cfg = JSON.parse(readFileSync(new URL('../data/weather.json', import.meta.url)));

// every kind named in a biome table exists
for (const [b, t] of Object.entries(cfg.biomes)) for (const half of ['day', 'night']) for (const k of Object.keys(t[half] || {})) assert.ok(cfg.kinds[k], `${b} ${half} names kind ${k}`);

// the same half-day and biome always give the same weather (no saved state, same on every client)
assert.deepEqual(pickWeather(cfg, 'forest', 5, false), pickWeather(cfg, 'forest', 5, false));
assert.equal(spellOf(3, true), 7);
assert.equal(spellOf(undefined, false), 2, 'no clock reads as day 1');

// over many half-days every biome sees several kinds, snow only in the snow biome, rain never there
const seen = { forest: new Set(), snow: new Set(), dry: new Set() };
for (let d = 1; d <= 400; d++) for (const night of [false, true]) for (const b of Object.keys(seen)) {
  const w = pickWeather(cfg, b, d, night);
  seen[b].add(w.kind);
  assert.ok(w.fog >= 0 && w.rain >= 0 && w.snow >= 0);
  assert.ok(w.wind.speed >= cfg.wind.min && w.wind.speed <= cfg.wind.max * 3);
  if (b !== 'snow') assert.equal(w.snow, 0, `${b} has no snow`);
  if (b === 'snow') assert.equal(w.rain, 0, 'no rain in the snow');
}
for (const [b, s] of Object.entries(seen)) assert.ok(s.size >= 3, `${b} varies: ${[...s]}`);
assert.ok(seen.forest.has('clear') && seen.forest.has('fog') && seen.forest.has('rain'));
assert.ok(seen.snow.has('snow') && seen.dry.has('haze'));

// one wind for the whole island per half-day
assert.deepEqual(pickWeather(cfg, 'forest', 9, true).wind, pickWeather(cfg, 'dry', 9, true).wind);

// easing: moves toward the target, reaches it, and never swaps the tint while fog is still showing
const a = { kind: 'fog', tint: 'frost', fog: 1, rain: 0, snow: 0, wind: { angle: 0.1, speed: 1 } };
const b = { kind: 'haze', tint: 'dust', fog: 0.55, rain: 0, snow: 0, wind: { angle: 6.2, speed: 2 } };
let w = easeWeather(null, a, 0.016, 12);
assert.deepEqual(w, a);
w = easeWeather(w, b, 1, 12);
assert.equal(w.tint, 'frost', 'old tint stays while its fog fades');
assert.ok(w.fog < 1 && w.fog > 0.8);
assert.ok(w.wind.angle < 0.1, 'wind turns the short way');
for (let i = 0; i < 400; i++) w = easeWeather(w, b, 0.5, 12);
assert.equal(w.tint, 'dust');
assert.ok(Math.abs(w.fog - 0.55) < 0.01 && Math.abs(w.wind.speed - 2) < 0.01);

// fog on about one night in six, at random, so runs of fog or of clear nights happen (Tim 2026-11-20, halved 2026-11-21)
for (const b of Object.keys(cfg.biomes)) {
  let foggy = 0; for (let d = 1; d <= 1000; d++) if (pickWeather(cfg, b, d, true).fog > 0) foggy++;
  assert.ok(foggy > 120 && foggy < 230, `${b}: fog on ${foggy} of 1000 nights`);
}

// and the hash really is random night to night: some fog streaks and some long clear runs
{ let run = 0, longest = 0, back2back = 0, prev = false;
  for (let d = 1; d <= 1000; d++) { const f = pickWeather(cfg, 'forest', d, true).fog > 0; run = f ? 0 : run + 1; longest = Math.max(longest, run); if (f && prev) back2back++; prev = f; }
  assert.ok(longest >= 8 && back2back > 8, `clear run ${longest}, fog two nights running ${back2back}`); }

console.log('weather ok');
