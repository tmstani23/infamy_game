// Checks clan money, crew cap and hire prices in the sim: node game/tools/test_crew.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { SCREEN_RIGHT as SR, SCREEN_DOWN as SD } from '../src/sim/geometry.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json');
units.rules.baseCap = 3;   // the hiring checks below were written for a cap of 3
const game = createGame({
  district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
});
const { state, clans } = game;
const R = units.rules;

const player = clans.addClan('player');
const bot = clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
assert.equal(player.ryo, R.startRyo);
assert.equal(bot.bot, true);

// The waterfront has a teahouse, warehouse, den and clinic, nobody owns them at the start
const kinds = Object.values(state.businesses).map(b => b.kind).sort();
assert.deepEqual(kinds, ['clinic', 'gambling_den', 'police_box', 'police_hq', 'teahouse', 'warehouse']);
assert.equal(clans.crewCap('player'), R.baseCap);

// Holding businesses raises the cap, for players and bots alike
const tea = Object.values(state.businesses).find(b => b.kind === 'teahouse');
const den = Object.values(state.businesses).find(b => b.kind === 'gambling_den');
clans.setOwner(tea.id, 'player');
clans.setOwner(den.id, 'kuroda');
assert.equal(clans.crewCap('player'), R.baseCap + R.capPerBusiness.teahouse);
assert.equal(clans.crewCap('kuroda'), R.baseCap + R.capPerBusiness.gambling_den);
// Every dawn of the season adds capPerDawn (Tim 2026-10-28)
state.season = { day: 4 };
assert.equal(clans.crewCap('player'), R.baseCap + 3 * R.capPerDawn + R.capPerBusiness.teahouse);
delete state.season;

// The hero is not crew; each crew member makes the next hire dearer
game.spawn('hero', 'ronin', 0, 0, { owner: 'player' });
assert.equal(clans.crewOf('player').length, 0);
assert.equal(clans.hirePrice('player', 'thug'), 60);
game.spawn('thug', 'thug', 1, 0, { owner: 'player' });
game.spawn('thug', 'thug', 2, 0, { owner: 'player' });
assert.equal(clans.crewOf('player').length, 2);
assert.equal(clans.hirePrice('player', 'thug'), Math.round(60 * (1 + 2 * R.priceStepPerCrew)));
assert.equal(clans.hirePrice('kuroda', 'thug'), 60);

// Types waiting on later systems cannot be hired; unknown types neither
assert.equal(clans.hirePrice('player', 'rifleman'), null);
assert.equal(clans.hirePrice('player', 'samurai'), null);

// --- Hiring (phase 2) ---
// A fresh game: hero walks into the teahouse and hires through commands, like a player would
function fresh() {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units,
  });
  return g;
}
let g = fresh();
const teaId = Object.values(g.state.businesses).find(b => b.kind === 'teahouse').id;
const teaB = g.state.businesses[teaId];
const ticks = s => Math.ceil(s * 20) + 1;
const run = (n, cmds = []) => { g.step(cmds); for (let i = 1; i < n; i++) g.step(); };
const crew = id => Object.values(g.state.entities).filter(e => e.owner === id && e.type !== 'hero');

const heroes = {};
const main = g;
for (const [clanId, bot] of [['player', false], ['kuroda', true]]) {
  if (clanId === 'kuroda') g = fresh();
  g.clans.addClan(clanId, { bot });
  const hero = g.spawn('hero', 'ronin', teaB.door[0], teaB.door[1], { owner: clanId });
  const clan = g.state.clans[clanId];

  // Outside the teahouse: refused, nothing paid
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'thug' }]);
  assert.equal(clan.ryo, R.startRyo);
  assert.match(clan.notice.text, /inside a teahouse/);

  // Walk in through the door, then hire a thug
  run(1, [{ id: hero, type: 'use' }]);
  assert.equal(g.state.entities[hero].place, teaB.room);
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'thug' }]);
  assert.equal(clan.ryo, R.startRyo - 60);
  assert.equal(clan.queue.length, 1);
  assert.equal(crew(clanId).length, 0);

  // Arrives at the teahouse door when the timer ends, owned by the clan
  run(ticks(units.types.thug.hireSeconds));
  assert.equal(clan.queue.length, 0);
  const t = crew(clanId);
  assert.equal(t.length, 1);
  assert.equal(t[0].type, 'thug');
  assert.equal(t[0].hp, units.types.thug.hp);
  assert.equal(t[0].place, 'street');
  assert.ok(Math.hypot(t[0].x - teaB.door[0], t[0].z - teaB.door[1]) > 0.5, 'steps out of the doorway');

  // Locked types refused; cap counts waiting hires; money runs out
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'rifleman' }]);
  assert.match(clan.notice.text, /Nobody here/);
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'brute' }]);   // 100 * 1.05 = 105
  assert.equal(clan.ryo, R.startRyo - 60 - 105);
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'swordsman' }]); // 120 * 1.1 = 132 exceeds the balance
  assert.match(clan.notice.text, /Not enough ryo/);
  clan.ryo = 1000;
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'thug' }]);     // now 3 of 3 (1 here + 2 waiting)
  run(1, [{ id: hero, type: 'hire', business: teaId, unit: 'thug' }]);
  assert.match(clan.notice.text, /Crew is full/);
  run(ticks(units.types.brute.hireSeconds + units.types.thug.hireSeconds));
  assert.equal(crew(clanId).length, 3);
  assert.equal(clan.queue.length, 0);

  // Player hires hold until commanded; AI clans still follow their leader.
  for (const u of crew(clanId)) assert.equal(u.order?.kind, bot ? 'follow' : undefined);
  if (bot) assert.deepEqual(crew(clanId).map(u => u.order.slot).sort(), [0, 1, 2]);
  assert.ok(crew(clanId).every(u => u.anim === 'idle'), JSON.stringify(Object.values(g.state.entities).map(e => [e.owner, e.type, e.anim, e.x|0, e.z|0, e.place, e.order?.kind])));
  heroes[clanId] = hero;
}
// the bot hired in its own game (clans fight on sight); give it a hero here for the order checks
g = main;
g.clans.addClan('kuroda', { bot: true });
heroes.kuroda = g.spawn('hero', 'ronin', 30, 25, { owner: 'kuroda' });

// --- Orders (phase 4) ---
const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
const pHero = g.state.entities[heroes.player];
run(1, [{ id: pHero.id, type: 'use' }]);                       // leave the teahouse
assert.equal(pHero.place, 'street');
run(1, [{ id: pHero.id, type: 'order', units: crew('player').map(u => u.id), kind: 'follow' }]);
const near = () => crew('player').every(u => dist(u, pHero.x, pHero.z) < 3.5);

// Walk the hero along the street (crossroads at x -16): crew keep up
const walkTo = (x, z, max = 400) => {
  for (let i = 0; i < max && dist(pHero, x, z) > 0.4; i++) {
    const dx = x - pHero.x, dz = z - pHero.z;
    // turn the wanted world direction into screen right/down (inverse of the sim's mapping)
    const right = dx * SR.x + dz * SR.z, down = dx * SD.x + dz * SD.z, n = Math.max(Math.abs(right), Math.abs(down));
    g.step([{ id: pHero.id, type: 'move', right: right / n, down: down / n }]);
  }
  run(1, [{ id: pHero.id, type: 'move', right: 0, down: 0 }]);
};
walkTo(-16, 17); walkTo(-16, 1); walkTo(0, 1);
run(60);
assert.ok(near(), 'crew followed the hero round the corner: ' + crew('player').map(u => dist(u, pHero.x, pHero.z).toFixed(1)));

// Move order across the map, around buildings: they arrive in a block, then stand
const ids = crew('player').map(u => u.id);
run(1, [{ id: pHero.id, type: 'order', units: ids, kind: 'move', x: 16, z: 25 }]);
run(20 * 15);
assert.ok(crew('player').every(u => dist(u, 16, 25) < 2.5), 'crew reached the move point: ' + crew('player').map(u => dist(u, 16, 25).toFixed(1)));
assert.ok(crew('player').every(u => u.anim === 'idle'));
const xs = crew('player').map(u => `${u.x.toFixed(1)},${u.z.toFixed(1)}`);
assert.equal(new Set(xs).size, xs.length, 'no two crew on the same spot');

// A point inside a building is moved to the nearest open ground
run(1, [{ id: pHero.id, type: 'order', units: [ids[0]], kind: 'station', x: 8, z: 9 }]);
const st = g.state.entities[ids[0]];
assert.equal(st.order.kind, 'station');
assert.ok(g.nav.clearLine(st.order.x, st.order.z, st.order.x, st.order.z));

// Follow again; another clan's hero cannot order my crew; crew cannot give orders
run(1, [{ id: heroes.kuroda, type: 'order', units: ids, kind: 'move', x: 0, z: 0 }]);
assert.ok(crew('player').every(u => u.order.x !== 0 || u.order.z !== 0));
run(1, [{ id: ids[1], type: 'order', units: ids, kind: 'follow' }]);
assert.notEqual(g.state.entities[ids[0]].order.kind, 'follow');
run(1, [{ id: pHero.id, type: 'order', units: ids, kind: 'follow' }]);
run(20 * 15);
assert.ok(near(), 'crew came back to the hero');
console.log('orders ok');

// Crew cannot hire, and a hero cannot spend another clan's money
const someThug = crew('player')[0];
const before = g.state.clans.player.ryo;
run(1, [{ id: someThug.id, type: 'hire', business: teaId, unit: 'thug' }]);
assert.equal(g.state.clans.player.ryo, before);
assert.deepEqual(JSON.parse(JSON.stringify(g.state)), g.state);

// The whole state stays plain data (it has to sync to other players later)
assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
console.log('crew tests passed');
