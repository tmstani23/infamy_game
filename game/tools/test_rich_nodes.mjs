// Rich resource nodes (Tim 2026-11-06). Run: node game/tools/test_rich_nodes.mjs
// Rich deposits yield stages.rich.yield x and regrow faster; every node kind has a "Rich ..." name; reach lines.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotYield, regrowSpot, isRich, RICH_NAME, RICH_GIVES, richReach } from '../src/sim/resource_spots.js';
const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const conf = read('resource_spots.json'), world = read('world.json'), spots = read('world_spots.json').spots, fr = read('frontier.json');
const st = conf.stages, k = st.rich.yield;
assert.ok(k > 1 && st.rich.regrow >= 1, 'rich factors set');
const dep = spots.find(s => s.deposit), small = spots.find(s => !s.deposit && s.kind === dep.kind);
assert.ok(isRich(dep) && !isRich(small));
assert.equal(spotYield(dep, undefined, st), dep.pieces.length * k, 'rich full yield = pieces x factor');
assert.equal(spotYield(small, undefined, st), small.pieces.length, 'small spot unchanged');
assert.ok(Math.abs(spotYield(dep, 'h'.repeat(dep.pieces.length), st) - Math.max(dep.pieces.length * st.value.h, st.trickle) * k) < 1e-9, 'worked rich yield');
// regrow: with rand just above the small chance, only the rich spot regrows
const r = () => st.regrow.h * 1.01;
assert.equal(regrowSpot(small, 'h'.repeat(small.pieces.length), st, r), 'h'.repeat(small.pieces.length), 'small spot waits');
assert.equal(regrowSpot(dep, 'h'.repeat(dep.pieces.length), st, r), 's'.repeat(dep.pieces.length), 'rich spot regrows faster');
for (const kind of new Set(world.nodes.map(n => n.kind))) { assert.match(RICH_NAME[kind], /^Rich /, `${kind} named Rich`); assert.ok(RICH_GIVES[kind]); }
for (const s of spots.filter(s => s.deposit)) assert.ok(RICH_NAME[s.nodeKind], `${s.id} nodeKind named`);
// reach
const p = { x: 0, z: 0 }, hall = { town: 'T1', name: 'Kita', x: 700, z: 0, r: fr.workers.range };
let out = richReach(p, [hall]);
assert.equal(out.ok, false); assert.equal(out.town, 'T1'); assert.match(out.text, /Needs a work camp: 700 from Kita/);
out = richReach(p, [hall, { town: 'T1', name: 'Kita', x: 300, z: 0, r: fr.workers.campReach, camp: true }]);
assert.equal(out.ok, true); assert.match(out.text, /Kita's work camp \(300 away\)/);
assert.equal(richReach(p, [{ ...hall, x: 500 }]).ok, true);
assert.ok(fr.workers.campReach > 0 && fr.townArt._spots.glow.rich.scale > 1, 'config present');
console.log('test_rich_nodes: ok');
