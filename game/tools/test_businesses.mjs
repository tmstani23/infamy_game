// Owning businesses (sim/businesses.js, plan checkpoint 1): Buy at the door ring, payouts at dawn,
// no payout in a Manhunt, the building panel's price rows. Run: node tools/test_businesses.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { buildingInfo } from '../src/building_panel.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = data('data/port_town.json'), settings = data('data/settings.json');
const g = createGame({
  district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...settings, dayNight: { auto: false } },
});
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const clan = g.state.clans.player;
const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
const den = Object.values(g.state.businesses).find(b => b.kind === 'gambling_den');
assert.ok(tea.ring && den.ring, 'businesses have door rings');
const hero = g.spawn('hero', 'ronin', tea.ring[0] + 10, tea.ring[1], { owner: 'player' });
const buy = b => g.step([{ id: hero, type: 'business', action: 'buy', business: b.id }]);

// too far from the door: nothing happens, the reason is shown
clan.ryo = 5000;
assert.equal(g.businesses.canBuy(hero, tea.id).why, 'Walk to its door to buy');
buy(tea);
assert.equal(tea.owner, null); assert.equal(clan.ryo, 5000);

// at the door with too little ryo
const h = g.state.entities[hero];
h.x = tea.ring[0]; h.z = tea.ring[1];
clan.ryo = 100;
assert.equal(g.businesses.canBuy(hero, tea.id).why, 'Need 400 ryo');
buy(tea);
assert.equal(tea.owner, null);

// at the door with enough: bought, paid
clan.ryo = 500;
buy(tea);
assert.equal(tea.owner, 'player'); assert.equal(clan.ryo, 100);
assert.match(clan.notice.text, /yours/);
assert.equal(g.businesses.canBuy(hero, tea.id).why, 'Already yours');
console.log('buy at the door ok');

// a rival's business can't be bought (raid only)
g.clans.setOwner(den.id, 'kuroda');
h.x = den.ring[0]; h.z = den.ring[1]; clan.ryo = 5000;
assert.equal(g.businesses.canBuy(hero, den.id).ok, false);
buy(den);
assert.equal(den.owner, 'kuroda');

// dawn pays every owner once; night and day ticks otherwise pay nothing
clan.ryo = 0; g.state.clans.kuroda.ryo = 0;
g.step([{ type: 'time', night: true }]);
for (let i = 0; i < 40; i++) g.step();
assert.equal(clan.ryo, 0);
g.step([{ type: 'time', night: false }]);
assert.equal(clan.ryo, 100);
assert.equal(g.state.clans.kuroda.ryo, 300);
assert.ok(g.state.ryoGains.some(r => r.clan === 'player' && r.amount === 100));
for (let i = 0; i < 40; i++) g.step();
assert.equal(clan.ryo, 100);
console.log('dawn payouts ok');

// Manhunt (heat 90+): no payout
clan.heat = 95;
g.step([{ type: 'time', night: true }]);
g.step([{ type: 'time', night: false }]);
assert.equal(clan.ryo, 100);
assert.match(clan.notice.text, /No payout/);
console.log('no payout in a Manhunt ok');

// building panel rows
const i = Number(tea.id.slice(1)), units = g.settings.units;
const rows = Object.fromEntries(buildingInfo({ state: g.state, district, info: data('data/buildings.json'), units }, i, 'player').rows);
assert.equal(rows['Pays you'], '100 ryo at dawn');
g.clans.setOwner(tea.id, null);
const rows2 = Object.fromEntries(buildingInfo({ state: g.state, district, info: data('data/buildings.json'), units }, i, 'player').rows);
assert.equal(rows2.Price, '400 ryo'); assert.equal(rows2.Pays, '100 ryo at dawn');
console.log('building panel rows ok');

// house guards: 2 inside each owned business, not crew, can't be ordered, die outright, replaced later
{
  const guardsOf = b => Object.values(g.state.entities).filter(e => e.guard === b.id && !e.dead);
  g.clans.setOwner(tea.id, 'player');
  g.step();
  let gs = guardsOf(tea);
  assert.equal(gs.length, 2, 'two guards');
  assert.ok(gs.every(e => e.owner === 'player' && e.place === tea.room && e.type === 'guard'));
  assert.equal(g.clans.crewOf('player').length, 0, 'guards are not crew');
  assert.equal(guardsOf(den).length, 2, 'the rival den has guards too');
  // they patrol: over half a minute each walks to more than one spot in the building
  const seen = gs.map(() => new Set());
  for (let i = 0; i < 40 * 20; i++) { g.step(); gs.forEach((e, k) => { seen[k].add(`${e.order.x.toFixed(1)},${e.order.z.toFixed(1)}`); assert.equal(e.place, tea.room); }); }
  assert.ok(seen.every(s => s.size >= 3), `guards patrol (${seen.map(s => s.size)})`);
  assert.ok(gs.every(e => e.order.kind === 'station'));
  // an order from the hero does not move them
  g.step([{ id: hero, type: 'order', units: gs.map(e => e.id), kind: 'move', x: 0, z: 0 }]);
  assert.deepEqual(gs.map(e => e.order.kind), ['station', 'station']);
  // a guard killed dies outright and comes back after replaceSeconds
  const R = g.settings.units.rules.houseGuards;
  gs[0].hp = 1;
  const k = g.spawn('thug', 'thug', gs[0].x, gs[0].z, { owner: 'kuroda', place: tea.room });
  for (let i = 0; i < 200 && !gs[0].dead; i++) g.step([{ id: k, type: 'noop' }]);
  assert.ok(gs[0].dead && !gs[0].downed, 'guard dies outright');
  delete g.state.entities[k];
  for (let i = 0; i < 40; i++) g.step();
  assert.equal(guardsOf(tea).length, 1);
  for (let i = 0; i < R.replaceSeconds * 20; i++) g.step();
  assert.equal(guardsOf(tea).length, 2, 'replaced');
  // new owner: the old guards go, fresh ones for the new owner
  g.clans.setOwner(tea.id, 'kuroda');
  g.step();
  gs = guardsOf(tea);
  assert.equal(gs.length, 2); assert.ok(gs.every(e => e.owner === 'kuroda'));
  g.clans.setOwner(tea.id, null);
  g.step();
  assert.equal(guardsOf(tea).length, 0, 'unclaimed: no guards');
  console.log('house guards ok');
}
