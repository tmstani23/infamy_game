// Crows (src/crow_flock.js, wildlife W1, visual only, Tim 2026-11-24).
// Run: node tools/test_crow_flock.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createCrowFlocks, crowOutline, CROW_DEFAULTS } from '../src/crow_flock.js';

const cfg = JSON.parse(readFileSync(new URL('../data/wildlife.json', import.meta.url))).crows;
for (const k of Object.keys(cfg)) assert.ok(k in CROW_DEFAULTS, `wildlife.json crows.${k} is a known setting`);

// the outline keeps the same polygons at every wingbeat, so the flying mesh's buffer never changes size
const size = o => o.map(([p]) => p.length).join(',');
const base = size(crowOutline(0, false));
for (const ph of [0.1, 0.37, 0.5, 0.8]) assert.equal(size(crowOutline(ph, false, 0.3)), base);
assert.equal(size(crowOutline(0, true)), base);

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const trees = Array.from({ length: 12 }, (_, i) => ({ x: 30 + (i % 4), y: 4, z: 30 + Math.floor(i / 4), tree: true, key: `t${i}` }));
function env(over = {}) {
  return {
    cam: { x: 0, z: 0, r: 40 }, night: 0, groundY: () => 0, scatters: [], people: [], battles: [], armies: [],
    spots(kind, x, z, r, n) {
      if (kind === 'tree') return trees.filter(t => Math.hypot(t.x - x, t.z - z) < r + 40).slice(0, n);
      if (kind !== 'ground') return [];
      return Array.from({ length: n }, (_, i) => ({ x: x + (rnd() - 0.5) * r, y: 0, z: z + (rnd() - 0.5) * r, ground: true, key: null }));
    },
    ...over,
  };
}
const run = (f, e, s) => { for (let t = 0; t < s; t += 0.05) f.update(e, 0.05); };

// by day flocks come in, sized and capped as set
{
  const f = createCrowFlocks(cfg, rnd);
  run(f, env(), 120);
  assert.ok(f.flocks().length >= 1 && f.flocks().length <= cfg.flocksDay, `flocks ${f.flocks().length}`);
  assert.ok(f.birds().length <= cfg.maxBirds);
  for (const fl of f.flocks()) assert.ok(fl.birds.length >= cfg.flockSize[0] && fl.birds.length <= cfg.flockSize[1]);
  // over a few minutes some crows come down to sit, and flying ones keep near crow height and pace
  let sat = 0;
  for (let t = 0; t < 200; t += 0.05) { f.update(env(), 0.05); sat = Math.max(sat, f.birds().filter(b => b.mode === 'sit').length); }
  assert.ok(sat > 0, 'some crows sit');
  for (const b of f.birds().filter(b => b.mode === 'fly')) assert.ok(b.y > 0.5 && b.y < 10, `height ${b.y}`);
}

// a gunshot by sitting crows: they all burst up and move away, and the scatter is reported for its sound
{
  const f = createCrowFlocks(cfg, rnd);
  let tries = 0;
  while (!f.flocks().some(fl => fl.birds.every(b => b.mode === 'sit')) && tries++ < 4000) f.update(env(), 0.05);
  const fl = f.flocks().find(fl => fl.birds.every(b => b.mode === 'sit'));
  assert.ok(fl, 'a flock settles');
  const c = () => ({ x: fl.birds.reduce((a, b) => a + b.x, 0) / fl.birds.length, z: fl.birds.reduce((a, b) => a + b.z, 0) / fl.birds.length });
  const at = c(), out = f.update(env({ scatters: [{ x: at.x + 2, z: at.z, r: 22 }] }), 0.05);
  assert.equal(out.scattered.length, 1);
  assert.equal(fl.goal.kind, 'flee');
  run(f, env(), 2);
  assert.ok(fl.birds.every(b => b.mode === 'fly' || b.mode === 'takeoff'), 'all up');
  run(f, env(), 3);
  const now = c();
  assert.ok(now.x < at.x - 6, `flew away from the shot: ${at.x} -> ${now.x}`);
}

// at night they roost in the trees and sleep; with no trees about they fly off and are gone
{
  const f = createCrowFlocks(cfg, rnd);
  run(f, env(), 30);
  run(f, env({ night: 1 }), 240);
  assert.ok(f.flocks().length >= 1);
  assert.ok(f.flocks().every(fl => fl.sleeping && fl.birds.every(b => b.mode === 'sit' && b.spot?.tree)), 'asleep in the trees');
  run(f, env({ night: 0 }), 20);
  assert.ok(f.flocks().every(fl => !fl.sleeping), 'up at dawn');

  const g = createCrowFlocks(cfg, rnd), bare = env({ spots: (k, ...a) => k === 'tree' ? [] : env().spots(k, ...a) });
  run(g, bare, 30);
  run(g, { ...bare, night: 1 }, 400);
  assert.ok(g.birds().every(b => b.mode !== 'sit'), 'nothing to roost on: none sit at night');
}

// a fight nearby: a flock circles over it while it goes on
{
  const f = createCrowFlocks(cfg, rnd);
  run(f, env(), 20);
  run(f, env({ battles: [{ x: 5, z: 5, active: true, kills: [] }] }), 40);
  assert.ok(f.flocks().some(fl => fl.goal?.kind === 'circle'), 'circling the fight');
}
// troops walking under a tree: a few birds burst out of it and fly off away from them, for good
{
  const f = createCrowFlocks(cfg, rnd);
  const out = f.flush({ x: 10, y: 4, z: 10, fx: 6, fz: 10 });
  const fl = f.flocks()[0];
  assert.equal(out.scattered.length, 1);
  assert.ok(fl.birds.length >= cfg.flush.size[0] && fl.birds.length <= cfg.flush.size[1]);
  run(f, env({ cam: { x: 10, z: 10, r: 40 } }), 6);
  const c = fl.birds.reduce((a, b) => a + b.x, 0) / fl.birds.length;
  assert.ok(c > 20, `flew off away from the troops: ${c.toFixed(1)}`);
  assert.ok(fl.birds.every(b => b.mode === 'fly'));
  run(f, env({ cam: { x: 10, z: 10, r: 40 } }), 40);
  assert.ok(!f.flocks().includes(fl), 'gone');
}
console.log('crow flock ok');
