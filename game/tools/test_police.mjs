// Checks the police in the sim: node game/tools/test_police.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const P = data('data/police.json').rules, U = data('data/units.json');
const newGame = () => {
  const g = createGame({
    district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: U, civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  });
  g.clans.addClan('player');
  return g;
};
const run = (g, s, cmds = []) => { g.step(cmds); for (let i = 1; i < s * 20; i++) g.step(); };
const cops = g => Object.values(g.state.entities).filter(e => e.owner === 'police' && !e.dead);
const clan = g => g.state.clans.player;
const door = (g, menu) => g.doors.find(d => d.menu === menu);

// The map has the box and the HQ with their door rings, and the officer has art
{
  const g = newGame(), art = data('data/art.json');
  assert.ok(g.police.hq && g.police.box, 'box and HQ found');
  assert.ok(door(g, 'police_box') && door(g, 'police_hq'), 'door rings');
  for (const d of [door(g, 'police_box'), door(g, 'police_hq')]) assert.ok(g.nav.findPath(-8, 1, d.x, d.z), `door ${d.menu} reachable`);
  assert.ok(art.characters[U.types.junsa.sprite], 'officer art');
  console.log('map ok');
}

// Tiers: nobody at 0 heat; Watched sends 2, Wanted 4, Manhunt 6; they go home when heat drops
{
  const g = newGame();
  g.spawn('hero', 'ronin', -8, 30, { owner: 'player', hp: 1e7 });   // too tough to arrest here
  run(g, 20);
  assert.equal(cops(g).length, 0, 'quiet: no police');
  for (const [heat, n] of [[35, 2], [65, 4], [95, 6]]) {
    clan(g).heat = heat;
    run(g, n * P.spawnEverySeconds + 2);
    assert.equal(cops(g).filter(c => !g.police.mind[c.id]?.leaving).length, n, `${n} officers at heat ${heat}`);
  }
  clan(g).heat = 0;
  run(g, 90);
  assert.equal(cops(g).length, 0, 'gone home when heat dropped');
  console.log('tiers ok');
}

// Clinic doubles at Wanted; bribe at the box; underdog bonus
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', 0, 0, { owner: 'player' })];
  h.hp = h.maxHp - 100;
  const base = g.clans.healCost(h).cost;
  clan(g).heat = 65;
  assert.equal(g.clans.healCost(h).cost, base * 2, 'clinic x2 at Wanted');
  assert.equal(g.police.tierOf('player'), 2);
  // bribe: walk-up not needed for the rule test, stand on the box ring
  const b = door(g, 'police_box');
  Object.assign(h, { x: b.x, z: b.z });
  const ryo = clan(g).ryo, heat = clan(g).heat;
  g.step([{ id: h.id, type: 'police', action: 'bribe' }]);
  assert.ok(Math.abs(clan(g).heat - (heat - P.bribeHeat)) <= 1, `bribe takes heat off (${heat} -> ${clan(g).heat})`);
  assert.equal(clan(g).ryo, ryo - P.bribePerTier * 3, 'costs 10 x tier (Wanted = 3)');
  // no bribe right after an officer hit the hero
  h.copHitAt = g.state.tick;
  const heat2 = clan(g).heat, ryo2 = clan(g).ryo;
  g.step([{ id: h.id, type: 'police', action: 'bribe' }]);
  assert.equal(clan(g).ryo, ryo2, 'refused while being hit');
  assert.ok(clan(g).heat >= heat2 - 1, 'heat unchanged');
  run(g, P.bribeBlockSeconds + 0.5);
  g.step([{ id: h.id, type: 'police', action: 'bribe' }]);
  assert.ok(clan(g).ryo < ryo2, 'taken again after the wait');
  // underdog: the top-infamy clan gains 25% more
  g.clans.addClan('kuroda', { bot: true });
  clan(g).infamy = 100; g.state.clans.kuroda.infamy = 10;
  assert.equal(g.police.heatScale('player'), 1 + P.topInfamyHeatBonus);
  assert.equal(g.police.heatScale('kuroda'), 1);
  console.log('clinic, bribe, underdog ok');
}

// Watched: fighting in front of a patrol makes them come for you; hitting police is +10 heat
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', -8, 1, { owner: 'player' })];
  clan(g).heat = 35;
  run(g, 12);
  const c = cops(g)[0];
  assert.ok(c, 'patrol out');
  assert.ok(!g.police.mind[c.id]?.leaving);
  // nobody fought yet: the officer leaves the hero alone
  assert.ok(!c.angry?.player, 'not angry before a fight');
  const before = clan(g).heat;
  Object.assign(h, { x: c.x + 1.5, z: c.z });
  g.step([{ id: h.id, type: 'attack', target: c.id }]);
  run(g, 3);
  assert.ok(clan(g).heat >= before + P.hitPoliceHeat - 1, `hitting police raises heat (${before} -> ${clan(g).heat})`);
  assert.ok(cops(g).some(o => o.angry?.player), 'police angry after being hit');
  console.log('watched ok');
}

// Arrests: police down crew and jail them (never killed); bail at the HQ; jail time runs out
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', 20, 10, { owner: 'player' })];
  const td = g.doors.find(x => x.label === 'Enter the Teahouse');
  Object.assign(h, { x: td.to.x, z: td.to.z, place: td.place });   // boss indoors: only the thug is out there
  const t = g.state.entities[g.spawn('thug', 'thug', 30, 1, { owner: 'player', order: { kind: 'move', x: 30, z: 1 } })];
  clan(g).heat = 95;
  let arrested = false, killed = false;
  for (let i = 0; i < 20 * 120 && !arrested; i++) {
    g.step();
    if (g.state.casts.some(c => c.kind === 'arrest')) arrested = true;
    if (g.state.casts.some(c => c.kind === 'execute')) killed = true;
  }
  assert.ok(arrested, 'crew arrested');
  assert.ok(!killed, 'nobody executed');
  assert.equal(clan(g).jail.length, 1, 'thug in jail');
  assert.equal(clan(g).jail[0].bail, Math.round(U.types.thug.price * P.bailShare), 'bail is half the hire price');
  // bail at the HQ ring
  clan(g).heat = 0;
  const d = door(g, 'police_hq');
  Object.assign(h, { x: d.x, z: d.z, place: 'street', dead: false, hp: h.maxHp });
  const ryo = clan(g).ryo;
  g.step([{ id: h.id, type: 'police', action: 'bail', prisoner: 0 }]);
  assert.equal(clan(g).jail.length, 0, 'bailed out');
  assert.equal(clan(g).ryo, ryo - Math.round(U.types.thug.price * P.bailShare));
  assert.ok(Object.values(g.state.entities).some(e => e.type === 'thug' && e.owner === 'player'), 'thug back on the street');
  // waiting it out
  clan(g).jail.push({ unit: 'thug', model: 'thug', left: 1, bail: 30 });
  run(g, 2);
  assert.equal(clan(g).jail.length, 0, 'out after the jail time');
  console.log('arrest and bail ok');
}

// Hero: a Wanted squad knocks him down and arrests him (a channel); he stands greyed out at the
// HQ for heroJailSeconds, untouchable, with heat dropped to heroJailHeat, then walks out
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', 10, 1, { owner: 'player' })];
  h.hp = 60;
  clan(g).heat = 70;
  let downed = false, arrestTicks = 0;
  for (let i = 0; i < 20 * 120 && !h.jailed; i++) {
    g.step();
    if (h.downed) downed = true;
    if (Object.values(g.state.entities).some(o => o.execute?.target === h.id && o.execute.start !== null)) arrestTicks++;
    assert.ok(!h.dead, 'never knocked out by the police');
  }
  assert.ok(downed, 'knocked down first');
  assert.ok(h.jailed, 'hero jailed');
  assert.ok(arrestTicks >= P.arrestSeconds * 20 - 1, `arrest channel (${arrestTicks} ticks)`);
  assert.ok(clan(g).heat > P.heroJailHeat, `heat stays up while jailed (${clan(g).heat})`);
  const hq = door(g, 'police_hq');
  assert.ok(Math.hypot(h.x - hq.x, h.z - hq.z) < 4, 'beside the HQ');
  // nothing moves him or touches him while jailed
  const at = [h.x, h.z];
  g.step([{ id: h.id, type: 'move', right: 1, down: 0 }]);
  run(g, 2);
  assert.deepEqual([h.x, h.z], at, 'stays put');
  g.step([{ id: h.id, type: 'move', right: 0, down: 0 }]);   // let go of the key
  run(g, P.heroJailSeconds - 4);
  assert.ok(h.jailed, 'still in jail');
  let cooled = null;
  for (let i = 0; i < 20 * 3; i++) { g.step(); cooled ||= g.state.heatGains.find(x => x.reason === 'Out of jail'); }
  assert.ok(!h.jailed && !h.dead && h.hp === h.maxHp, 'out with full health');
  assert.ok(clan(g).heat <= P.heroJailHeat && cooled?.amount < 0, `heat drops to ${P.heroJailHeat} on release (${clan(g).heat})`);
  assert.ok(Math.hypot(h.x - hq.x, h.z - hq.z) < 2, `at the HQ door (${h.x.toFixed(1)},${h.z.toFixed(1)} vs ${hq.x},${hq.z}) ${h.anim} ${h.dead}`);
  console.log('hero arrest ok');
}

// His crew can break the arrest by hitting the officer; nobody arresting him: knocked out as usual
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', 10, 1, { owner: 'player' })];
  h.hp = 60;
  clan(g).heat = 70;
  let cop = null;
  for (let i = 0; i < 20 * 120 && !cop; i++) { g.step(); cop = Object.values(g.state.entities).find(o => o.execute?.target === h.id && o.execute.start !== null); }
  assert.ok(cop, 'arrest started');
  const t = g.spawn('swordsman', 'swordsman', cop.x + 1, cop.z, { owner: 'player', order: { kind: 'attack', target: cop.id } });
  let broke = false;
  for (let i = 0; i < 20 * 3 && !broke; i++) { g.step(); if (g.state.hits.some(x => x.t === cop.id && x.a === t)) broke = !cop.execute || cop.execute.start === null; }
  assert.ok(broke, 'a crew hit breaks the arrest');
  assert.ok(!h.jailed, 'not jailed yet');
  // police all gone: he is knocked out as usual and gets up at the clinic
  for (const o of Object.values(g.state.entities)) if (o.owner === 'police') delete g.state.entities[o.id];
  clan(g).heat = 0;
  g.state.entities[t].order = { kind: 'move', x: 0, z: 0 };
  run(g, 7);
  assert.ok(h.dead && !h.downed, 'knocked out as usual');
  run(g, 21);
  const clinic = g.doors.find(d => d.menu === 'clinic');
  assert.ok(!h.dead && Math.hypot(h.x - clinic.x, h.z - clinic.z) < 2, 'up at the clinic');
  console.log('arrest break ok');
}

// Raid window: no police at all
{
  const g = newGame();
  g.spawn('hero', 'ronin', -8, 1, { owner: 'player' });
  g.state.raidWindow = true;
  clan(g).heat = 95;
  run(g, 20);
  assert.equal(cops(g).length, 0, 'no police in the raid window');
  console.log('raid window ok');
}
// Lost him (60-119): the squad only knows where the hero is while it sees him; out of sight
// for lostSeconds (or indoors) they search the spot, then go back to patrolling
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', 20, 5, { owner: 'player', hp: 1e7 })];
  clan(g).heat = 70;
  run(g, 20);
  assert.equal(g.police.knownHero('player'), h, 'seen: hunted');
  // he gets away: far off, out of everyone's sight
  Object.assign(h, { x: -40, z: 40 });
  const spot = { ...g.police.track.player };
  run(g, P.lostSeconds - 2);
  assert.ok(g.police.knownHero('player'), 'still on him for a few seconds');
  let news = false;
  for (let i = 0; i < 20 * 3; i++) { g.step(); news ||= g.state.policeNews.some(n => n.kind === 'lost' && n.clan === 'player'); }
  assert.equal(g.police.knownHero('player'), null, 'lost him');
  assert.ok(news, "'lost' news for the screen");
  assert.ok(g.police.searchSpot('player'), 'searching');
  run(g, 6);
  const near = cops(g).filter(c => Math.hypot(c.x - spot.x, c.z - spot.z) < P.searchRadius + 3).length;
  assert.ok(near >= 2, `searching where they lost him (${near} near)`);
  assert.ok(cops(g).every(c => Math.hypot(c.x - h.x, c.z - h.z) > P.sight), 'not on his trail');
  run(g, P.searchSeconds);
  assert.equal(g.police.searchSpot('player'), null, 'search over');
  // seen again: the hunt starts over
  const c = cops(g)[0];
  Object.assign(h, { x: c.x + 4, z: c.z });
  run(g, 1);
  assert.equal(g.police.knownHero('player'), h, 'found again');
  // indoors: lost at once, and they stay outside
  const d = g.doors.find(x => x.label === 'Enter the Teahouse');
  Object.assign(h, { x: d.to.x, z: d.to.z, place: d.place });
  run(g, 1);
  assert.equal(g.police.knownHero('player'), null, 'indoors: lost');
  run(g, 15);
  assert.ok(cops(g).every(o => o.place === 'street'), 'they do not follow him in at Wanted');
  console.log('lost him ok');
}

// Most Wanted (120+): they always know where he is, never give up, and follow him indoors
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', 20, 5, { owner: 'player', hp: 1e7 })];
  clan(g).heat = 125;
  assert.equal(g.police.rules.tiers[g.police.tierOf('player')].name, 'Most Wanted');
  run(g, 20);
  Object.assign(h, { x: -40, z: 40 });
  run(g, P.lostSeconds + 5);
  assert.equal(g.police.knownHero('player'), h, 'never lose him');
  const d = g.doors.find(x => x.label === 'Enter the Teahouse');
  Object.assign(h, { x: d.to.x, z: d.to.z, place: d.place });
  let inside = 0;
  for (let i = 0; i < 20 * 60 && !inside; i++) { g.step(); inside = cops(g).filter(o => o.place === d.place).length; }
  assert.ok(inside >= 1, 'followed him indoors');
  assert.ok(cops(g).filter(o => o.place === d.place).every(o => o.angry?.player), 'still after him inside');
  // back out: they come out after him
  Object.assign(h, { x: 0, z: 1, place: 'street' });
  run(g, 20);
  assert.ok(cops(g).every(o => o.place === 'street'), 'followed him back out');
  console.log('most wanted ok');
}
// A knocked-out officer is replaced only after replaceSeconds, out of the HQ or the box,
// and the replacement patrols instead of charging the hero (unless Most Wanted)
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', -30, 30, { owner: 'player', hp: 1e7 })];
  clan(g).heat = 65;
  run(g, 20);
  assert.equal(cops(g).length, 4, 'full squad');
  const ko = cops(g)[0];
  ko.hp = 1;
  Object.assign(h, { x: ko.x + 1.5, z: ko.z });
  g.step([{ id: h.id, type: 'attack', target: ko.id }]);
  run(g, 3);
  assert.ok(ko.dead || !g.state.entities[ko.id], 'officer knocked out');
  clan(g).heat = 65;
  Object.assign(h, { x: -30, z: 30 });
  run(g, P.replaceSeconds - 5);
  assert.equal(cops(g).length, 3, 'one short until replaceSeconds');
  const before = new Set(cops(g).map(c => c.id));
  let fresh = null;
  for (let i = 0; i < 20 * 8 && !fresh; i++) { g.step(); fresh = cops(g).find(c => !before.has(c.id)); }
  assert.ok(fresh, 'replaced after replaceSeconds');
  const doors = [g.police.hq, g.police.box].map(b => b.door);
  assert.ok(doors.some(([x, z]) => Math.hypot(fresh.x - x, fresh.z - z) < 6), 'walks out of the HQ or the box');
  assert.ok(g.police.mind[fresh.id].fresh, 'replacement is fresh');
  // fresh one does not head for the hero while he is out of its sight
  const d0 = Math.hypot(fresh.x - h.x, fresh.z - h.z);
  run(g, 5);
  if (Math.hypot(fresh.x - h.x, fresh.z - h.z) > P.sight) assert.ok(Math.hypot(fresh.x - h.x, fresh.z - h.z) >= d0 - 8, 'patrols, not charging');
  console.log('replacements ok');
}
// A new squad patrols until the hero is in sight; at Most Wanted it goes straight for him
{
  const g = newGame();
  const h = g.state.entities[g.spawn('hero', 'ronin', -30, 30, { owner: 'player', hp: 1e7 })];
  clan(g).heat = 65;
  run(g, 25);
  assert.equal(cops(g).length, 4, 'squad out');
  assert.ok(cops(g).every(c => g.police.mind[c.id].fresh), 'all new officers are fresh');
  assert.ok(cops(g).every(c => Math.hypot(c.x - h.x, c.z - h.z) > P.sight), 'none came running at a far hero');
  clan(g).heat = 125;
  run(g, 30);
  assert.ok(cops(g).some(c => Math.hypot(c.x - h.x, c.z - h.z) < 4), 'Most Wanted: they come for him');
  console.log('new squad ok');
}
// Two officers beat two crew on their own (Tim 2026-10-18: police were too easy)
for (const kind of ['thug', 'swordsman', 'brute']) {
  const g = newGame();
  const h = g.spawn('hero', 'ronin', -8, 30, { owner: 'player' });
  const td = g.doors.find(x => x.label === 'Enter the Teahouse');
  Object.assign(g.state.entities[h], { x: td.to.x, z: td.to.z, place: td.place });
  const cops2 = [0, 1].map(i => g.spawn('junsa', 'police', i, 1, { owner: 'police', cop: true, clan: 'player', angry: { player: 1e9 } }));
  const crew = [0, 1].map(i => g.spawn(kind, kind, 3, 1 + i, { owner: 'player', order: { kind: 'attack', target: cops2[i] } }));
  const up = ids => ids.filter(id => { const u = g.state.entities[id]; return u && !u.dead && !u.downed; }).length;
  for (let i = 0; i < 20 * 90 && up(cops2) && up(crew); i++) {
    for (const id of crew) { const u = g.state.entities[id]; const c = cops2.find(c => up([c])); if (u && c && u.order?.kind !== 'attack') u.order = { kind: 'attack', target: c }; }
    g.step();
  }
  assert.ok(up(cops2) > 0 && up(crew) === 0, `2 officers beat 2 ${kind}s`);
}
console.log('tough police ok');
console.log('police tests passed');
