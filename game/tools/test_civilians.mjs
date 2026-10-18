// Checks the townsfolk in the sim: node game/tools/test_civilians.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const civData = data('data/civilians.json');
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: civData,
  });
  g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true });
  return g;
};
const run = (g, s, cmds = []) => { g.step(cmds); for (let i = 1; i < s * 20; i++) g.step(); };
const civs = g => Object.values(g.state.entities).filter(e => e.type === 'civilian');
const total = Object.values(civData.types).reduce((n, t) => n + t.count, 0);
const inWall = (g, e) => g.blockers.some(b => e.x > b.minX && e.x < b.maxX && e.z > b.minZ && e.z < b.maxZ);

// Every spot can be walked to from the main street, and every art model exists
{
  const g = newGame(), art = data('data/art.json');
  for (const p of g.civilians.spots) assert.ok(g.nav.findPath(0, 1, p.x, p.z), `no path to ${p.id}`);
  for (const t of Object.values(civData.types)) assert.ok(art.characters[t.model], `no art for ${t.model}`);
  console.log('spots ok');
}

// Daytime: they spread out, walk between spots, stay out of walls, chat and bow
{
  const g = newGame();
  g.civilians.populate();
  assert.equal(civs(g).length, total);
  const visits = {}, anims = new Set();
  const t0 = performance.now();
  for (let i = 0; i < 20 * 120; i++) {
    g.step();
    for (const e of civs(g)) {
      (visits[e.id] ||= new Set()).add(g.civilians.mind[e.id].spot);
      anims.add(e.anim);
      assert.ok(!inWall(g, e), `civilian ${e.id} inside a wall at ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
    }
  }
  const ms = (performance.now() - t0) / (20 * 120);
  const movers = Object.values(visits).filter(s => s.size >= 3).length;
  assert.ok(movers >= total * 0.8, `most walk between spots (${movers}/${total})`);
  for (const a of ['walk', 'idle', 'talk', 'bow']) assert.ok(anims.has(a), `someone does ${a}`);
  assert.equal(civs(g).length, total, 'nobody lost by day');
  assert.ok(ms < 5, `tick cost ${ms.toFixed(2)} ms`);
  console.log(`day ok (${movers}/${total} visited 3+ spots, ${ms.toFixed(2)} ms per tick)`);
}

// A fight nearby: civilians freeze, then run away, and remember who did it; nobody attacks them
{
  const g = newGame(), S = g.state.entities;
  const hero = g.spawn('hero', 'ronin', -6, 1, { owner: 'player' });
  const foe = g.spawn('thug', 'thug', -4.6, 1, { owner: 'kuroda', order: { kind: 'station', x: -4.6, z: 1 } });
  const near = g.civilians.add('merchant', -1, 1.5), far = g.civilians.add('monk', 20, 17);
  let scared = false, fled = false, hitCiv = 0;
  for (let i = 0; i < 20 * 4; i++) {
    g.step();
    hitCiv += g.state.hits.filter(h => S[h.t]?.type === 'civilian').length;
    if (S[near].anim === 'scared') scared = true;
    if (S[near].flee && S[near].anim === 'run') fled = true;
  }
  assert.ok(scared, 'froze in fright');
  assert.ok(fled, 'ran');
  assert.ok(S[near].witness && ['player', 'kuroda'].includes(S[near].witness.clan), 'witness marked');
  assert.equal(S[far].witness, undefined, 'too far to see it');
  assert.equal(hitCiv, 0, 'nobody hits townsfolk');
  run(g, 4);
  assert.ok(Math.hypot(S[near].x + 5, S[near].z - 1) > 8, 'got away from the fight');
  void foe; void hero;
  console.log('fear ok');
}

// Night: most go home and in, night owls stay at night spots; morning: everyone back out
{
  const g = newGame();
  g.civilians.populate();
  run(g, 5);
  const owls = civs(g).filter(e => g.civilians.mind[e.id].nightOut).length;
  g.step([{ type: 'time' }]);
  assert.equal(g.state.night, true);
  run(g, 150);
  const out = civs(g);
  assert.equal(out.length, owls, `only night owls out (${out.length} vs ${owls})`);
  assert.equal(g.civilians.away.length, total - owls);
  const nightSpots = new Set(g.civilians.spots.filter(p => p.night).map(p => p.id));
  run(g, 30);
  for (const e of civs(g)) { const s = g.civilians.mind[e.id].spot; assert.ok(s === null || nightSpots.has(s), `night spot ${s}`); }
  g.step([{ type: 'time', night: false }]);
  run(g, 40);
  assert.equal(civs(g).length, total, 'all back out by day');
  console.log(`night ok (${owls} stay out)`);
}

// One fixed total (Tim 2026-10-18): out + indoors + dead waiting their replaceSeconds never goes
// above it across a night and a day with kills, and townsfolk only ever appear at their own homes
{
  const g = newGame();
  g.civilians.populate();
  const homeOk = e => {
    const m = g.civilians.mind[e.id], ids = civData.types[m.kind].homes;
    const list = g.civilians.spots.filter(p => ids ? ids.includes(p.id) : p.home);
    return list.some(p => Math.hypot(p.x - e.x, p.z - e.z) < 1.5);
  };
  const seen = new Set(civs(g).map(e => e.id));
  const tick = () => {
    g.step();
    const c = g.civilians.count();
    assert.ok(c.all <= total, `count ${c.all} over ${total}`);
    for (const e of civs(g)) if (!seen.has(e.id)) { seen.add(e.id); assert.ok(homeOk(e), `${e.civ} came out at its home, not at ${e.x.toFixed(1)},${e.z.toFixed(1)}`); }
  };
  const runT = s => { for (let i = 0; i < s * 20; i++) tick(); };
  runT(2);
  for (const e of civs(g).slice(0, 5)) delete g.state.entities[e.id];      // five killed and cleared away
  runT(1);
  assert.equal(g.civilians.count().lost, 5, 'five waiting');
  g.step([{ type: 'time', night: true }]); runT(60);
  g.step([{ type: 'time', night: false }]); runT(60);
  assert.equal(civs(g).length, total - 5, 'only the living came back out by day');
  runT(civData.rules.replaceSeconds);
  assert.equal(civs(g).length, total, 'the dead came back once their time was up');
  assert.equal(g.civilians.count().all, total);
  console.log('townsfolk total ok');
}

console.log('civilian tests passed');
