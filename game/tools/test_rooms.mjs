// Checks the room generator over many seeds: node game/tools/test_rooms.mjs [seeds]
// Every room must pass the same checks the game runs on load, plus the walkway check.
import { readFileSync } from 'node:fs';
import { generateRoom } from '../src/sim/generate.js';

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const recipes = data('room_recipes.json'), parts = data('interior_parts.json');
const seeds = Number(process.argv[2]) || 100;
let failed = 0;
for (const type of Object.keys(recipes).filter(k => !k.startsWith('_'))) {
  const t0 = performance.now(), bad = {}, retries = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const a = generateRoom(type, seed, recipes, parts), b = generateRoom(type, seed, recipes, parts);
    if (JSON.stringify(a.template) !== JSON.stringify(b.template)) (bad['same seed gave different rooms'] ||= []).push(seed);
    for (const p of a.problems) (bad[p.replace(/[\d.]+,[\d.]+/g, '#')] ||= []).push(seed);
    retries.push(a.attempt);
  }
  const ms = (performance.now() - t0) / seeds / 2;
  const nBad = new Set(Object.values(bad).flat()).size;
  failed += nBad;
  console.log(`${type}: ${seeds - nBad}/${seeds} passed, ${ms.toFixed(1)} ms per room, average ${(retries.reduce((a, b) => a + b, 0) / seeds).toFixed(1)} retries`);
  for (const [p, s] of Object.entries(bad)) console.log(`  ${p}: seeds ${s.slice(0, 8).join(', ')}${s.length > 8 ? ` (+${s.length - 8})` : ''}`);
}
process.exit(failed ? 1 : 0);
