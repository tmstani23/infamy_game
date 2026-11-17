// 8e-4 camp station and spur (sim/frontier/rail.js campSpurs), 8e-1 ryo by train into a camp's war chest.
// Run: node game/tools/test_camp_spur.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { storageCap } from '../src/sim/frontier/storage.js';

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
// Tim 2026-11-17: short pieces in a row just outside the camp station, hit anywhere along the red
{ const SP = frontier.war.supply;
  secs.forEach((b, k) => { assert.equal(b.rail.d0, SP.sectionStart + k * (SP.sectionLength + SP.sectionGap), 'in a row from the station'); assert.equal(Math.round(b.rail.d1 - b.rail.d0), SP.sectionLength, 'short piece'); assert.ok(b.hitBoxes.length >= 5, 'hit boxes along it'); });
  const sl = g.frontier.structures.list?.().find?.(x => x.b === secs[0]);
  if (sl) assert.equal(sl.boxes, secs[0].hitBoxes, 'the structure is hit by its red piece');
  assert.ok(!(S.news || []).some(n => n.kind === 'supplyLineTip'), 'no tip for a bot defender'); }
// the auto refill from the treasury (generals): a chest at or above chestLow gets none, unless the general holds that
// ryo back for the camp hall upgrade (`held`, Tim 2026-11-17)
{ const autos = () => Object.values(F.shipping.orders).filter(x => x.kind === 'ryo' && x.auto && x.state === 'open' && x.war === 'w1');
  clan.ryo = 5000; g.frontier.world.syncCapital(); w.camp.chest = frontier.war.supply.chestLow + 20;
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'autoChest', war: 'w1' }]);
  assert.equal(autos().length, 0, 'no refill for a chest above the low mark');
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'autoChest', war: 'w1', held: 9999 }]);
  assert.equal(autos().length, 1, 'held back for the hall upgrade: the refill is ordered');
  assert.equal(autos()[0].amount, Math.min(frontier.war.supply.refill, Math.floor((5000 - frontier.war.supply.treasuryKeep) * frontier.war.supply.autoShare)));
  for (const x of autos()) { x.sources = []; x.state = 'cancelled'; } }
// a cut line (Tim 2026-11-17): orders into the camp wait and carry on when the line is whole again; nothing goes back
clan.ryo = 5000; g.frontier.world.syncCapital();
g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'ryo', from: 'treasury', into: 'chest', war: 'w1', amount: 400 }]);
const oc2 = Object.values(F.shipping.orders).find(x => x.kind === 'ryo' && x.state === 'open');
assert.ok(oc2, clan.notice?.text);
assert.equal(clan.ryo, 4600);
const stn = w.camp.buildings.find(b => b.type === 'camp_station');
stn.stage = 'ruined';
run(20 * 5);
assert.ok(l.closed && l.cutBy === 'war', 'the station down cuts it off (Tim 2026-11-17: any break)');
assert.equal(w.camp.station.cut, true);
assert.match(clan.notice?.text || '', /cut off/i);
assert.equal(oc2.state, 'open', 'the order into the cut camp waits');
assert.equal(clan.ryo, 4600, 'its ryo stays on the way');
const chestCut = w.camp.chest || 0;
run(20 * 240);
assert.equal(oc2.state, 'open', 'still waiting while the line is cut');
assert.equal(w.camp.chest || 0, chestCut, 'nothing reaches the camp over a cut line');
// rebuilt in place from the station menu (Tim 2026-11-17); a ruined station or section cannot be erased
assert.equal(g.frontier.war.campEraseCheck('w1', stn.id).ok, false, 'a ruined station is not erased');
w.camp.stock.timber = 1000; w.camp.stock.stone = 1000;
g.step([{ id: hero.id, type: 'frontier', action: 'campRebuild', war: 'w1', building: stn.id }]);
assert.equal(stn.stage, 'site', 'the station is a site again');
assert.ok(stn.rebuild && stn.need > 0);
assert.equal(w.camp.stock.timber, 1000 - frontier.war.buildings.camp_station.cost.timber, 'paid from the camp stores');
g.step([{ id: hero.id, type: 'frontier', action: 'campCancel', war: 'w1', building: stn.id }]);
assert.equal(stn.stage, 'ruined', 'cancel: back to the ruin');
assert.equal(w.camp.stock.timber, 1000, 'cancel before work: refunded');
g.step([{ id: hero.id, type: 'frontier', action: 'campRebuild', war: 'w1', building: stn.id }]);
stn.progress = stn.need - 1;   // the camp workers finish it (workers.js turns a finished site to built)
stn.stage = 'built'; delete stn.progress; delete stn.need; delete stn.rebuild;
secs[1].stage = 'ruined';
run(20 * 5);
assert.ok(l.closed, 'still cut while one section is down');
assert.equal(g.frontier.war.campEraseCheck('w1', secs[1].id).ok, false, 'a section is not erased');
g.step([{ id: hero.id, type: 'frontier', action: 'campRebuild', war: 'w1', building: secs[1].id }]);
assert.equal(secs[1].stage, 'site');
assert.equal(w.camp.stock.timber, 1000 - frontier.war.buildings.camp_station.cost.timber - frontier.war.supply.sectionCost.timber, 'section cost');
secs[1].stage = 'built';
run(20 * 5);
assert.ok(!l.closed, 'open again once all stand');
assert.equal(run(20 * 600, () => oc2.state === 'done'), true, 'the waiting order arrives once the line is mended: ' + JSON.stringify([oc2.state, oc2.got, oc2.amount]));
assert.equal(Math.round((w.camp.chest || 0) - chestCut), 400, 'its ryo is in the war chest');
assert.ok(clan.ryo <= 4600, 'nothing refunded to the treasury (lieutenant wages may go out)');
// Tim 2026-11-17: a camp sells its stores at the capital (the ryo into its war chest) and buys there from its war chest
{ const sale = () => Object.values(F.shipping.orders).filter(x => x.kind === 'sell' && x.camp && x.war === 'w1').at(-1);
  w.camp.stock.stone = 500; const ch0 = w.camp.chest || 0, price = railways.ship.sellPrice.stone;
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'sell', town: node, resource: 'stone', amount: 200 }]);
  const so = sale();
  assert.ok(so && so.sellFrom === node && so.state === 'open', 'a camp sale: ' + clan.notice?.text);
  assert.equal(w.camp.reserved.stone, 200, 'held back in the camp stores until the train takes it');
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'sell', town: node, resource: 'stone', amount: 400 }]);
  assert.match(clan.notice?.text || '', /to spare/, 'no more than the stores hold');
  assert.equal(run(20 * 900, () => so.state === 'done'), true, 'sold: ' + JSON.stringify([so.state, so.got]));
  assert.equal(w.camp.stock.stone, 300, 'it left the camp stores');
  assert.equal(Math.round((w.camp.chest || 0) - ch0), 200 * price, 'paid into the war chest');
  assert.equal(w.camp.reserved.stone || 0, 0);
  // buying: the towns have nothing to spare; the order's ryo offer buys at the capital from the war chest
  const timber0 = town.stock.timber; town.stock.timber = 0; w.camp.stock.timber = 0; w.camp.chest = 1000;
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: 'timber', amount: 100 }]);
  const free0 = Object.values(F.shipping.orders).filter(x => x.camp && x.resource === 'timber' && x.state === 'open').at(-1);
  run(40); assert.equal(free0.sources.length, 0, 'no offer: it waits for a town to spare some');
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'cancel', order: free0.id }]);
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: 'timber', amount: 100, ryo: 5000 }]);
  assert.match(clan.notice?.text || '', /war chest/, 'an offer above the war chest is refused');
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: 'timber', amount: 100, ryo: 600 }]);
  const bo = Object.values(F.shipping.orders).filter(x => x.camp && x.resource === 'timber' && x.state === 'open').at(-1);
  assert.ok(bo.sources.some(x => x.from === 'capital'), 'bought at the capital');
  assert.equal(w.camp.chest, 1000 - 100 * railways.ship.buyPrice.timber, 'paid from the war chest');
  assert.equal(run(20 * 900, () => bo.state === 'done'), true, 'delivered');
  assert.equal(w.camp.stock.timber, 100);
  // an open order's offer can be set afterwards
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'order', town: node, resource: 'timber', amount: 50 }]);
  const oo = Object.values(F.shipping.orders).filter(x => x.camp && x.resource === 'timber' && x.state === 'open').at(-1);
  g.step([{ id: hero.id, type: 'frontier', action: 'ship', mode: 'offer', order: oo.id, ryo: 300 }]);
  assert.ok(oo.ryo === 300 && oo.sources.some(x => x.from === 'capital'), 'offer: bought at the capital');
  run(20 * 900, () => oo.state === 'done'); town.stock.timber = timber0; }
// Tim 2026-11-17: a bot's town fills its own camp's orders down to war.supply.botCampKeepShare of its storage
{ const tX = F.settlements.tX, cap = storageCap(tX, frontier, 'timber'), bot0 = S.clans[tX.owner]; if (!bot0) S.clans[tX.owner] = { id: tX.owner, bot: true, ryo: 0 }; const wasBot = S.clans[tX.owner].bot; S.clans[tX.owner].bot = true;
  if (Number.isFinite(cap) && cap > 0) {
    tX.stock.timber = Math.floor(cap * 0.4); tX.reserved = {};
    assert.equal(sh.free(tX, 'timber'), Math.max(0, Math.floor(cap * 0.4) - sh.keepOf(tX, 'timber')), 'its keep for other orders');
    assert.equal(Math.round(sh.free(tX, 'timber', { camp: true })), Math.floor(cap * 0.4) - Math.floor(cap * frontier.war.supply.botCampKeepShare), 'down to a quarter for its camp');
    assert.equal(sh.free(town, 'timber', { camp: true }), sh.free(town, 'timber'), "a player's town keeps its keep amount");
  } else console.log('  (no storage cap: bot camp keep share not checked)');
  if (!bot0) delete S.clans[tX.owner]; else bot0.bot = wasBot; }
// camp ruins take no building slot; building over one says to erase it
{ const bk = { id: 'w1:bk', type: 'barracks', stage: 'ruined', x: cx - 30, z: cz };
  w.camp.buildings.push(bk);
  const e = g.frontier.war.campBuildList('w1').find(x => x.type === 'barracks');
  assert.equal(e.count, 0, 'a ruin is not counted');
  const r = g.frontier.war.campCheck('w1', 'barracks', { x: bk.x, z: bk.z });
  assert.equal(r.reason, 'Erase the ruin first');
  w.camp.buildings.splice(w.camp.buildings.indexOf(bk), 1); }

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
