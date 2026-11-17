// 8e-4 camp station and spur (sim/frontier/rail.js campSpurs), 8e-1 ryo by train into a camp's war chest.
// Run: node game/tools/test_camp_spur.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), railways = data('data/railways.json');
railways.link.seconds = 30;
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, railways, fixtureTowns: false } };
const g = createGame(options);
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 41 });
const S = g.state, F = S.frontier, hero = S.entities[m.heroId], clan = S.clans.player, rail = g.frontier.rail, sh = g.frontier.shipments;
const [gx, gz] = g.gate.railApproach;
const site = world.sites.filter(s => Math.hypot(s.x - gx, s.z - gz) > 1200).sort((a, b) => Math.hypot(a.x - gx, a.z - gz) - Math.hypot(b.x - gx, b.z - gz))[0];
g.frontier.world.addTown({ id: 'tR', name: 'Railton', owner: 'player', x: site.x, z: site.z, pop: 3, stock: { food: 500, goods: 300, timber: 400, stone: 200, ryo: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const other = world.sites.filter(s => s !== site).map(s => ({ s, d: Math.hypot(s.x - site.x, s.z - site.z) })).filter(o => o.d > 700 && o.d < 1400).sort((a, b) => a.d - b.d)[0].s;
g.frontier.world.addTown({ id: 'tX', name: 'Rivalburg', owner: 'bot1', x: other.x, z: other.z, pop: 3, stock: { food: 100 }, buildings: [{ type: frontier.founding.townHall, stage: 'built', cell: 0 }] });
const town = F.settlements.tR;
g.step([]);
town.tier = railways.link.minTier;
const nearCell = s => { let best = -1, bd = Infinity; s.grid.use.split('').forEach((c, i) => { if (c !== '.') return; const [x, z] = g.frontier.stable.centre(s, { cell: i }), d = Math.hypot(x - s.x, z - s.z); if (d > 25 && d < bd) { bd = d; best = i; } }); return best; };
const run = (n, until) => { for (let i = 0; i < n; i++) { g.step([]); if (until?.()) return true; } return !until; };
const node = 'camp:w1';

// a war on Rivalburg: the camp a little way out from it, toward Railton
const k = 320 / Math.hypot(site.x - other.x, site.z - other.z), cx = other.x + (site.x - other.x) * k, cz = other.z + (site.z - other.z) * k;
F.wars ||= { list: {}, cooldown: {}, history: [] };
const st = { id: 'w1:station', type: 'camp_station', stage: 'site', x: cx + 12, z: cz + 6 };
const w = F.wars.list.w1 = { id: 'w1', town: 'tX', attacker: 'player', defender: 'bot1', x: cx, z: cz, started: S.tick, state: 'active',
  camp: { x: cx, z: cz, chest: 100, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: 'w1:hall', type: 'camp_hall', stage: 'built', x: cx, z: cz }, st] } };

// a station still being built: no spur
run(60);
assert.ok(!Object.values(F.rail.links).some(l => l.from === node), 'no spur before the camp station is built');
// built, but no town with a station yet: it says why
st.stage = 'built';
run(60);
assert.match(w.camp.station?.why || '', /station/i, 'needs a town with a station');
// Railton gets a station: the spur is ordered at the next try, paid from the camp stores
town.buildings.push({ id: 'st1', type: 'station', cell: nearCell(town), stage: 'built' });
w.camp.station.retry = 0;
run(60);
const l = Object.values(F.rail.links).find(l => l.from === node);
assert.ok(l, 'spur ordered: ' + (w.camp.station?.why || ''));
assert.equal(l.to, 'tR', 'to the nearest own town with a station');
assert.equal(l.payer, node);
assert.equal(w.camp.station.link, l.id);
assert.equal(w.camp.station.linked, false);
const s0 = { ...town.stock };
run(400);
assert.ok(l.waiting === 'timber' || l.waiting === 'stone', 'waits for the camp stores, never the town');
assert.equal(town.stock.timber, s0.timber, 'town stock untouched');
w.camp.stock.timber = 5000; w.camp.stock.stone = 5000;
assert.ok(run(30 * 20 * 8, () => l.done), 'spur laid ' + JSON.stringify({ built: l.built, len: l.length, paid: l.paid, waiting: l.waiting, stock: w.camp.stock, has: !!F.rail.links[l.id] }));
assert.ok(w.camp.stock.timber < 5000, 'paid from the camp stores');
assert.equal(w.camp.station.linked, true, 'camp linked');
assert.match(clan.notice?.text || '', /camp station linked/i);
assert.ok(Object.values(F.rail.trains).some(t => t.link === l.id), 'the spur has a train');
assert.deepEqual(rail.endpoint('player', node), { x: st.x, z: st.z });

// treasury ryo to the camp war chest: capital -> Railton -> camp
F.rail.links.r0 = { id: 'r0', owner: 'player', from: 'capital', to: 'tR', done: true, length: 100, points: [[0, 0], [100, 0]], dist: [0, 100] };
clan.ryo = 5000; g.frontier.world.syncCapital();
g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'ryo', from: 'treasury', into: 'chest', war: 'w1', amount: 700 }]);
const o = Object.values(F.shipping.orders).find(x => x.kind === 'ryo');
assert.ok(o, clan.notice?.text);
assert.equal(o.to, node);
assert.deepEqual(sh.route('player', 'capital', node), ['capital', 'tR', node]);
assert.ok(run(40000, () => o.state === 'done'), 'ryo reached the camp');
assert.equal(Math.round(w.camp.chest), 800, 'into the war chest');
assert.equal(w.camp.sources.treasury, 700);

// 8e-5: timber and stone ordered into the camp from Railton's spare stock
town.stock.timber = 900; town.keep = { timber: 100, stone: 100 };
const t0 = w.camp.stock.timber;
g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: 'goods', amount: 50 }]);
assert.match(clan.notice?.text || '', /timber and stone/i, 'a camp takes timber and stone only');
g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: 'timber', amount: 200 }]);
const oc = Object.values(F.shipping.orders).find(x => x.to === node && x.resource === 'timber');
assert.ok(oc, clan.notice?.text);
assert.deepEqual(oc.sources.map(x => x.from), ['tR'], 'sourced from Railton');
assert.ok(run(40000, () => oc.state === 'done'), 'timber reached the camp');
assert.ok(w.camp.stock.timber >= t0 + 200 - 1, 'into the camp stores');

// 8e-6: marked rail sections inside the war circle, on the camp's morale bar
run(20 * 5);
const secs = w.camp.buildings.filter(b => b.type === 'rail_section');
assert.equal(secs.length, frontier.war.supply.sections, 'sections made');
const R0 = frontier.war.circleRadius ?? 900;
for (const b of secs) assert.ok(Math.hypot(b.x - other.x, b.z - other.z) <= R0 + 1, 'section inside the circle');
assert.ok(g.frontier.warMorale.view?.(w)?.camp?.weights?.rail_section || frontier.war.morale.weights.rail_section, 'counted on the morale bar');
// ryo on its way when the line is cut goes back to the treasury; orders into the camp stop
clan.ryo = 5000; g.frontier.world.syncCapital();
g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'ryo', from: 'treasury', into: 'chest', war: 'w1', amount: 400 }]);
const oc2 = Object.values(F.shipping.orders).find(x => x.kind === 'ryo' && x.state === 'open');
assert.ok(oc2, clan.notice?.text);
assert.equal(clan.ryo, 4600);
const stn = w.camp.buildings.find(b => b.type === 'camp_station');
stn.stage = 'ruined'; secs[0].stage = 'ruined'; secs[1].stage = 'ruined';
run(20 * 5);
assert.ok(!l.closed, 'still open while one section stands');
secs[2].stage = 'ruined';
run(20 * 5);
assert.ok(l.closed && l.cutBy === 'war', 'cut off');
assert.equal(w.camp.station.cut, true);
assert.match(clan.notice?.text || '', /cut off/i);
assert.equal(oc2.state, 'cancelled', 'order into the cut camp stopped');
assert.equal(clan.ryo, 5000, 'ryo back to the treasury');
// mended: open again
for (const b of [stn, ...secs]) b.stage = 'built';
run(20 * 5);
assert.ok(!l.closed, 'open again');

// camp falls: spur gone, the spur gives nothing; camp timber and stone go to the town (up to storage room)
const tX = F.settlements.tX;
tX.stock.timber = 0; tX.stock.stone = 0;
w.camp.stock.timber = 150; w.camp.stock.stone = 60;
const r0 = { ...town.stock };
g.frontier.warEnd.finish(w, 'campFell');
run(20 * 5);
assert.ok(!F.rail.links[l.id], 'spur removed');
assert.ok(!Object.values(F.rail.trains).some(t => t.link === l.id), 'its train gone');
assert.equal(town.stock.timber, r0.timber, 'spur gives nothing back');
assert.equal(tX.stock.timber, 150, 'camp timber to the defender');
assert.equal(tX.stock.stone, 60, 'camp stone to the defender');

// a war won some other way (sacked, burned, called off): the spur is torn up, half its cost back to the town it ran to
const fake = (id, result) => {
  const node2 = `camp:${id}`, ww = { id, town: 'tX', attacker: 'player', defender: 'bot1', x: cx, z: cz, started: S.tick, state: 'active',
    camp: { x: cx, z: cz, chest: 0, stock: { timber: 0, stone: 0 }, brought: {}, workers: [], workerTraining: [], buildings: [{ id: `${id}:hall`, type: 'camp_hall', stage: 'built', x: cx, z: cz }, { id: `${id}:station`, type: 'camp_station', stage: 'built', x: cx + 12, z: cz + 6 }] } };
  F.wars.list[id] = ww;
  F.rail.links[`s${id}`] = { ...l, id: `s${id}`, from: node2, payer: node2, camp: id, done: true, closed: false, spent: { timber: 100, stone: 40 } };
  delete F.rail.links[`s${id}`].cutBy;
  ww.camp.station = { node: node2, link: `s${id}`, linked: true, to: 'tR' };
  run(20 * 5);
  g.frontier.war.end(id, result);
  run(20 * 5);
  return F.rail.links[`s${id}`];
};
const a0 = { ...town.stock };
assert.ok(!fake('w2', 'sacked'), 'torn up');
assert.equal(town.stock.timber - a0.timber, 50, 'half the timber back');
assert.equal(town.stock.stone - a0.stone, 20, 'half the stone back');
// captured with a station: the spur becomes a normal line from the captured town; its owner can tear it up
tX.owner = 'player'; tX.tier = railways.link.minTier;
tX.buildings.push({ id: 'stX', type: 'station', cell: nearCell(tX), stage: 'built' });
fake('w3', 'captured');
const cap = Object.values(F.rail.links).find(k => k.from === 'tX' && k.to === 'tR');
assert.ok(cap && cap.done && cap.spur, 'captured spur is a line to the captured town');
assert.ok(Object.values(F.rail.trains).some(t => t.link === cap.id), 'with a train');
const b0 = { ...town.stock };
g.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'tear', link: cap.id }]);
assert.ok(!F.rail.links[cap.id], 'owner tore it up');
assert.equal(town.stock.timber - b0.timber, 50, 'half back on tear up');
console.log('camp spur ok');
