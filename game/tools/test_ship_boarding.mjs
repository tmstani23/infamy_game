// Ships plan S8 (2026-11-23): boarding (sim/frontier/boarding.js) on the ship_test dev save. Board goes from the
// nearest selected warship with troops aboard, sails alongside, grapples 4 s, then the holds fight a second at a time
// (strength by ryo cost, no dice) until one is empty; capture, an empty hold taken at once, the deck Gatling's cut, the
// weakened defender, a grapple that fails, break off and its wait, no boarding while unloading or empty, a tie, a third
// ship joining either side, a war that pauses, save and load mid-fight, locked ships neither sail nor fire.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { loadSave, makeSave } from '../src/sim/save.js';
import { build } from './make_dev_save.mjs';
import { waterGrid, sailable } from '../src/sim/frontier/water_nav.js';
import { specialView, specialOf } from '../src/sim/special_cast.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  frontier: { ...data('data/frontier.json'), railways: data('data/railways.json'), castleBlueprint: data('data/castle_default.json'), campaignZones: data('data/campaign_zones.json') } });
const file = build('ship_test', { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, shipTest: true });
const OPT = options(), world = OPT.world, BD = OPT.frontier.war.ships.boarding, wg = waterGrid(world), UNITS = OPT.units;
let g, S, rec, casts = [];
const fresh = (save = file) => { g = createGame(options()); loadSave(g, JSON.parse(JSON.stringify(save))); S = g.state; rec = Object.values(S.frontier.wars.list)[0]; };
const hero = () => Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'player');
const step = (cmds = []) => { g.step(cmds); casts.push(...(S.casts || [])); };
const run = n => { for (let i = 0; i < n; i++) step(); };
const until = (test, max = 2000) => { for (let i = 0; i < max; i++) { if (test()) return true; step(); } return test(); };
fresh();
const town = S.frontier.settlements[rec.town], circle = { x: town.x, z: town.z, r: OPT.frontier.war.circleRadius };
// open water in the circle: every point within 50 sailable, nearest the town
let sea = null;
for (let r = 60; r < circle.r - 60 && !sea; r += 20) for (let a = 0; a < 64 && !sea; a++) {
  const x = town.x + Math.cos(a / 64 * Math.PI * 2) * r, z = town.z + Math.sin(a / 64 * Math.PI * 2) * r;
  let ok = true; for (let dx = -50; dx <= 50 && ok; dx += 10) for (let dz = -50; dz <= 50 && ok; dz += 10) ok = sailable(wg, x + dx, z + dz, 'big');
  if (ok) sea = { x, z };
}
assert.ok(sea, 'open water in the war circle');
const foe = () => rec.defender;
// a ship of owner at sea + (dx, dz), holding fire unless fire, with these troops aboard
function ship(unit, owner, dx, dz, men = [], { fire = false, hp = 1 } = {}) {
  const s = g.ships.spawn(rec, unit, sea.x + dx, sea.z + dz, owner);
  s.heading = 0; if (!fire) s.holdFire = true; s.hp = Math.round(s.maxHp * hp);
  for (const m of men) { const u = S.entities[g.frontier.war.spawnTroop(rec, m, s.x, s.z, owner)]; Object.assign(u, { aboard: s.id, inShip: s.id }); delete u.order; }
  return s;
}
const board = (ships, t) => step([{ id: hero().id, type: 'special', ability: 'board', units: ships.map(s => s.id), x: t.x, z: t.z }]);
const breakOff = s => step([{ id: hero().id, type: 'special', ability: 'breakoff', units: [s.id] }]);
const fight = t => S.frontier.boardings?.[t.id];
const str = u => u.type === 'hero' ? BD.hero : u.warTroop ? OPT.frontier.war.units[u.warUnit].ryo : BD.crew;
const hold = s => g.ships.riders(s).reduce((n, u) => n + str(u), 0);

// --- the button: a warship with troops aboard has Board; an empty one, a transport, or one unloading cannot ---
{
  const p = ship('warship', 'player', 0, 0, ['grunt']), empty = ship('warship', 'player', 0, 30), tr = ship('transport', 'player', 30, 0, ['grunt']);
  assert.equal(specialOf(UNITS, p), 'board', 'a warship has Board');
  assert.equal(specialOf(UNITS, tr), null, 'a transport cannot board');
  assert.deepEqual([specialView({ state: S, units: UNITS }, 'board', [p.id]).ready, specialView({ state: S, units: UNITS }, 'board', [empty.id]).ready], [1, 0], 'an empty hold cannot board');
  p.sorder = { kind: 'unload', land: { x: p.x, z: p.z }, next: 1e9 };
  assert.equal(specialView({ state: S, units: UNITS }, 'board', [p.id]).ready, 0, 'not while unloading');
  console.log('boarding: button ok');
}

// --- board, grapple 4 s, fight a second at a time, capture; locked ships neither sail nor fire ---
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['grunt', 'grunt', 'grunt', 'brute', 'brute', 'enforcer']);
  const near = ship('warship', 'player', -60, 0, ['grunt']);   // also selected, farther: one press sends the nearest
  const t = ship('transport', foe(), 30, 0, ['grunt', 'grunt', 'archer'], { fire: true });
  board([near, p], t);
  assert.ok(p.board && p.sorder.kind === 'board' && !near.board, 'one press, one ship: the nearest to the target');
  assert.ok(until(() => p.board?.grip != null, 600), 'it sails alongside and grapples');
  const grip = S.tick; assert.ok(casts.some(c => c.kind === 'boardGrapple' && c.a === p.id), 'grapple cast');
  assert.ok(until(() => fight(t), 200) && S.tick - grip >= 79 && S.tick - grip <= 82, `the struggle starts after the 4 s grapple (${S.tick - grip})`);
  assert.ok(p.locked === t.id && t.locked === t.id && t.sorder.kind === 'stay', 'both ships locked');
  const at = { px: p.x, pz: p.z, tx: t.x, tz: t.z }, gun = JSON.stringify(t.gunAt || {}), a0 = hold(p), d0 = hold(t); casts = [];
  step([{ id: hero().id, type: 'order', kind: 'move', units: [p.id], x: p.x + 50, z: p.z, place: 'world' }]);
  assert.ok(p.locked && p.sorder.kind === 'stay', 'a locked ship takes no move order');
  run(19);
  // first exchange: each side takes lossShare of its own strength off the other
  assert.ok(Math.abs(fight(t).carry[foe()] - BD.lossShare * a0) < 1e-6 && hold(t) === d0, `the boarders hit the defenders (${fight(t).carry[foe()]})`);
  assert.ok(Math.abs(fight(t).carry.player - BD.lossShare * d0) < 1e-6, `the defenders hit back (${fight(t).carry.player})`);
  let falls = 0, fell = [];
  until(() => !fight(t), 1200);
  for (const c of casts) if (c.kind === 'boardFall') { falls++; fell.push(c.t); }
  assert.equal(t.owner, 'player', 'the boarders take the ship');
  assert.ok(Math.hypot(p.x - at.px, p.z - at.pz) < 0.01 && Math.hypot(t.x - at.tx, t.z - at.tz) < 0.01, 'neither ship moved while locked');
  assert.equal(JSON.stringify(t.gunAt || {}), gun, 'the locked target fired no cannon');
  assert.ok(!casts.some(c => (c.kind === 'shipCannon' || c.kind === 'shipBroadside') && (c.a === p.id || c.a === t.id) && S.entities[c.a]?.locked), 'no gun fire from locked ships');
  assert.equal(g.ships.riders(t).length, 0, 'taken empty');
  assert.ok(falls >= 3 && fell.every(id => S.entities[id].dead && S.entities[id].drowned && !S.entities[id].inShip), 'fallen troops go overboard and drown');
  assert.ok(casts.some(c => c.kind === 'shipCaptured' && c.a === t.id && c.from === foe()), 'capture cast');
  assert.ok(S.news.some(n => n.kind === 'shipCaptured' && n.clan === 'player') || casts.some(c => c.kind === 'shipCaptured'), 'capture news');
  assert.ok(!p.locked && !p.board && !t.locked && hold(p) < a0 && hold(p) > 0, 'unlocked; the boarders keep their survivors');
  { const v = g.frontier.war.troopView(rec.id); assert.ok(v.troops >= 5 + 5 + 4, `the captured transport counts its troop places for the captor (${v.troops})`); }
  console.log('boarding: capture ok');
}

// --- an empty hold is taken at once after the grapple; no Gatling cut without defenders ---
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['grunt']), t = ship('warship', foe(), 25, 0, []);
  board([p], t);
  assert.ok(until(() => t.owner === 'player', 800), 'an empty hold is taken');
  assert.ok(!fight(t) && hold(p) === 30 && !casts.some(c => c.kind === 'boardGatling'), 'at once, nobody lost');
  console.log('boarding: empty hold ok');
}

// --- the deck Gatling of a defending warship cuts the boarding party; the weakened defender hits back at x0.6 ---
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['enforcer', 'enforcer', 'enforcer', 'enforcer', 'enforcer', 'enforcer']), t = ship('warship', foe(), 25, 0, ['grunt', 'grunt', 'grunt', 'grunt']);
  board([p], t);
  until(() => fight(t), 800);
  assert.ok(casts.some(c => c.kind === 'boardGatling' && c.a === t.id && c.t === p.id), 'Gatling tracers during the grapple');
  assert.ok(Math.abs(fight(t).carry.player - BD.gatlingCut * 360) < 1e-6, `the Gatling cuts ${BD.gatlingCut} of the party (${fight(t).carry.player})`);
  console.log('boarding: gatling ok');
}
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['grunt', 'grunt', 'grunt', 'grunt', 'grunt', 'grunt']), t = ship('transport', foe(), 25, 0, ['enforcer', 'enforcer'], { hp: 0.4 });
  board([p], t);
  until(() => fight(t), 800); run(20);
  assert.ok(Math.abs(fight(t).carry.player - BD.lossShare * 120 * BD.weakDefender) < 1e-6, `a ship under half health: its defenders at x${BD.weakDefender} (${fight(t).carry.player})`);
  assert.ok(fight(t).view.weak, 'the bar knows it is weakened');
  const pv = g.ships.boarding.preview(p, t);
  assert.ok(pv.weakened && pv.theirs === 120, 'the armed cursor shows both strengths and weakened');
  console.log('boarding: weakened ok');
}

// --- the grapple fails when the target gets out of reach ---
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['grunt']), t = ship('transport', foe(), 25, 0, ['grunt']);
  board([p], t);
  until(() => p.board?.grip != null, 600);
  t.x += 30; step();
  assert.ok(!p.board && !fight(t) && p.sorder.kind === 'stay', 'out of reach in the grapple: it fails');
  assert.match(S.clans.player.notice?.text || '', /got away/, 'and says so');
  console.log('boarding: grapple fails ok');
}

// --- break off only after 3 s; then no boarding for 15 s; a tie goes to the defender ---
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['grunt', 'grunt']), t = ship('transport', foe(), 25, 0, ['enforcer', 'enforcer', 'enforcer', 'enforcer']);
  board([p], t);
  until(() => fight(t), 800);
  assert.equal(specialOf(UNITS, p), 'breakoff', 'the same slot is Break off');
  breakOff(p);
  assert.ok(p.locked && fight(t), 'not before 3 s');
  until(() => S.tick >= p.board.offAt); breakOff(p);
  assert.ok(!p.locked && !p.board && !fight(t) && !t.locked, 'breaks off; the fight ends');
  assert.ok(Math.abs(p.boardReadyAt - S.tick - BD.cooldownSeconds * 20) <= 2, 'then waits before boarding again');
  board([p], t);
  assert.ok(!p.board, 'no boarding during the wait');
  console.log('boarding: break off ok');
}
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, ['grunt']), t = ship('transport', foe(), 25, 0, ['grunt']);
  board([p], t);
  until(() => !fight(t) && t.locked == null && p.board == null && casts.some(c => c.kind === 'boardEnd'), 2000);
  assert.ok(t.owner === foe() && hold(t) === 30 && hold(p) === 0, `a tie: the defender keeps the ship with one (${t.owner} ${hold(t)} ${hold(p)})`);
  console.log('boarding: tie ok');
}

// --- a third ship joins from the free side, on either side; a war that pauses stops the fight; save and load ---
fresh(); casts = [];
{
  const G12 = Array(12).fill('grunt'), E6 = Array(6).fill('enforcer');
  const p = ship('warship', 'player', 0, 0, E6), p2 = ship('warship', 'player', 50, 0, ['brute', 'brute']);
  const t = ship('transport', foe(), 25, 0, G12);
  const d2 = ship('warship', foe(), 25, 40, ['grunt', 'grunt']);
  board([p], t); board([p2], t);
  assert.ok(p.board && p2.board && p2.board.side === -p.board.side, 'the second boarder goes to the free side');
  until(() => fight(t)?.ships.includes(p2.id), 800);
  assert.ok(!g.ships.boarding.order(d2, { x: p.x, z: p.z }) && !d2.board, 'no room left alongside for the defenders');
  assert.ok(p2.locked === t.id && fight(t).ships.length === 3, 'joins the fight');
  // save and load mid-fight
  const sv = JSON.parse(JSON.stringify(makeSave(g)));
  fresh(sv);
  const T = S.entities[t.id], P = S.entities[p.id];
  assert.ok(fight(T) && P.locked === T.id && fight(T).ships.length === 3, 'loads mid-fight');
  rec.terms = { by: 'test' }; step();
  assert.ok(!fight(T) && !P.locked && !T.locked && T.owner === foe() && hold(T) > 0, 'a war that pauses stops the fight; survivors stay');
  delete rec.terms;
  console.log('boarding: join, save, war pause ok');
}
fresh(); casts = [];
{
  const p = ship('warship', 'player', 0, 0, Array(6).fill('enforcer')), t = ship('transport', foe(), 25, 0, Array(12).fill('grunt'));
  const d2 = ship('warship', foe(), 50, 0, ['grunt', 'grunt']);
  board([p], t);
  until(() => fight(t), 800);
  assert.ok(g.ships.boarding.order(d2, { x: p.x, z: p.z }) && d2.board.role === 'd' && d2.board.t === t.id, 'a defender ship boarding a boarder joins its own side');
  until(() => fight(t)?.ships.includes(d2.id), 800);
  assert.ok(fight(t).view.nd === hold(t) / 30 + 2 && hold(d2) === 60, `its hold fights for the defenders (${fight(t).view.nd})`);
  assert.equal(specialOf(UNITS, d2), null, 'the defenders cannot break off');
  console.log('boarding: defender joins ok');
}
console.log('boarding: all ok');
