// Hidden places and rumours (world variety P3, 2026-11-27, sim/hidden_places.js): wandering folk tell a rumour that
// marks an area holding the place; riding near makes it flash; reaching it pins it; bots never look; saves carry it.
// Run: node tools/test_hidden_places.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), W = data('data/wildlife.json'), HP = data('data/hidden_places.json');
// no folk module: the test puts its own scene in state.world.folk, so nothing else moves it
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json'), hidden: HP };

// the data: every place on the island, on land, inside a named region, with lines that name its landmark
const R = HP.rules;
assert.ok(HP.places.length >= 7, 'the seven guarded places');
for (const p of HP.places) {
  assert.ok(p.x > 0 && p.z > 0 && p.x < world.size.w && p.z < world.size.h, `${p.id} is on the island`);
  assert.ok(HP.kinds[p.kind], `${p.id} has a known kind`);
  assert.ok(p.lines?.length >= 2 && p.where, `${p.id} has rumour lines and a landmark`);
  const names = p.where.match(/[A-Z][a-z'-]+(?: (?:of the |of )?[A-Z][a-z'-]+)+/g) || [];
  assert.ok(names.length, `${p.id}: the landmark is a name on the map`);
  assert.ok(p.lines.every(l => names.some(n => l.includes(n))), `${p.id}: every line names its landmark (${names.join(', ')})`);
  assert.ok(world.sites.every(s => Math.hypot(s.x - p.x, s.z - p.z) > 200), `${p.id} is clear of town sites`);
}

const g = createGame(options);
const match = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options.district.spawns, test: { playerRyo: 5000 }, seed: 77 });
const S = g.state, hero = S.entities[match.heroId], me = hero.owner;
assert.ok(g.hidden?.enabled, 'hidden places are on in an island game');
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const casts = [];
const stepAll = n => { for (let i = 0; i < n; i++) { g.step([]); casts.push(...(S.casts || []).filter(c => /^hidden|folkSay/.test(c.kind))); } };
const put = (x, z) => Object.assign(hero, { place: 'world', area: 'world', x, z, path: null, order: null });
const crew = Object.values(S.entities).filter(e => e.owner === me && e.type !== 'hero');
for (const e of crew) Object.assign(e, { place: 'world', area: 'world', x: 50, z: 50 });   // far off in a corner
const P = HP.places[0], Q = HP.places[1];

// nothing known at the start
put(P.x + 2000, P.z + 2000); run(20);
assert.deepEqual(g.hidden.viewFor(me), [], 'nothing known yet');
// the goal card: hear a rumour first, nothing pinned on the map yet
let goal = g.goals.explore(me);
assert.equal(goal?.title, 'Find a hidden place', 'a goal sends you to find one');
assert.equal(goal.rows[0].done, false); assert.equal(goal.rows[1].at, null, 'no spot to point at before a rumour');

// 1. a wandering hermit tells a rumour as the hero passes: words over his head, a notice, an area marked round the place
const hx = Q.x + 900, hz = Q.z;   // the hermit sits nearest to Q
const hermitId = g.spawn('civilian', W.folk.scenes.hermit.models?.[0] || 'civilian', hx, hz, { place: 'world', area: 'world', folk: 'scT', holdFire: true });
S.world.folk = { scenes: { scT: { id: 'scT', kind: 'hermit', x: hx, z: hz, phase: 'herbs', members: [hermitId], m: {}, props: [] } }, rest: {}, n: 1 };
put(hx + R.folkTalkRange + 40, hz); stepAll(20);
assert.equal(g.hidden.viewFor(me).length, 0, 'no rumour from too far off');
put(hx + R.folkTalkRange - 20, hz); stepAll(20);
const told = g.hidden.viewFor(me);
assert.equal(told.length, 1, 'one rumour told');
assert.equal(told[0].id, Q.id, 'about the place nearest the hermit');
assert.equal(told[0].state, 'rumour');
assert.equal(told[0].x, undefined, 'a rumour never gives the spot itself');
assert.ok(Math.hypot(told[0].smudge.x - Q.x, told[0].smudge.z - Q.z) < told[0].smudge.r * 0.6, 'the place is well inside the marked area');
assert.ok(Math.hypot(told[0].smudge.x - Q.x, told[0].smudge.z - Q.z) > 1, 'the mark is not centred on the place');
assert.ok(casts.some(c => c.kind === 'folkSay' && c.a === hermitId && Q.lines.includes(c.text)), 'the hermit says the line');
assert.ok(S.clans[me].notice?.text.startsWith('Rumour:'), 'the rumour goes in the notice line');
assert.ok(casts.some(c => c.kind === 'hiddenRumour' && c.clan === me && c.place === Q.id));
goal = g.goals.explore(me);
assert.equal(goal.rows[0].done, true, 'rumour heard');
assert.deepEqual([goal.rows[1].at.x, goal.rows[1].at.z], [told[0].smudge.x, told[0].smudge.z], 'the goal points at the marked area');
assert.ok(goal.rows[1].how.includes(Q.where), 'and names the landmark');
// the same scene tells only once
stepAll(R.gapSeconds * 20 + 20);
assert.equal(g.hidden.viewFor(me).length, 1, 'one rumour per scene');

// 2. riding near flashes it once, rumour or not
casts.length = 0;
put(P.x + R.flashRange - 50, P.z); stepAll(20);
let v = g.hidden.viewFor(me).find(x => x.id === P.id);
assert.equal(v?.state, 'near', 'near: it shows on the minimap');
assert.equal(v.x, P.x);
assert.equal(casts.filter(c => c.kind === 'hiddenNear' && c.place === P.id).length, 1, 'one flash');
stepAll(40);
assert.equal(casts.filter(c => c.kind === 'hiddenNear' && c.place === P.id).length, 1, 'no second flash while near');

// 3. reaching it: found, pinned by kind, a notice, a milestone
put(P.x + R.findRange - 20, P.z); stepAll(20);
v = g.hidden.viewFor(me).find(x => x.id === P.id);
assert.equal(v.state, 'found');
assert.equal(v.label, HP.kinds[P.kind].label, 'named by kind');
assert.ok(casts.some(c => c.kind === 'hiddenFound' && c.place === P.id));
assert.match(S.clans[me].notice.text, /^Found:/);
assert.equal(S.clans[me].milestones.hiddenFound, 1);
assert.equal(g.hidden.found(me), 1);
// the rumoured place, reached: its smudge clears
put(Q.x, Q.z); stepAll(20);
v = g.hidden.viewFor(me).find(x => x.id === Q.id);
assert.equal(v.state, 'found');
assert.equal(v.smudge, undefined, 'the smudge clears once found');
assert.equal(g.hidden.found(me), 2);
assert.match(g.goals.explore(me).title, /2 of 7 found/, 'next goal counts the finds');
// no explore goal while the clan is at war
S.frontier ||= {}; S.frontier.wars ||= {}; S.frontier.wars.list ||= {}; S.frontier.wars.list.wT = { attacker: me, defender: 'x' };
assert.equal(g.goals.explore(me), null, 'no wandering mid-war');
delete S.frontier.wars.list.wT;

// 4. bots never look
const bot = Object.keys(S.clans).find(c => S.clans[c].bot);
if (bot) {
  const b = Object.values(S.entities).find(e => e.owner === bot && !e.dead);
  if (b) { Object.assign(b, { place: 'world', area: 'world', x: HP.places[2].x, z: HP.places[2].z }); run(20); }
  assert.deepEqual(g.hidden.viewFor(bot), [], 'a rival bot finds nothing');
}

// 5. saves carry it: plain data in state.world (the save writes state as JSON)
const g2 = createGame(options); g2.state.world = JSON.parse(JSON.stringify(S.world));
assert.equal(g2.hidden.found(me), 2, 'found places survive a save');

// 6. no folk scene nearby and nothing to tell: no rumour at all
assert.equal(g.hidden.nearestOpen(me, 0, 0), null, 'nothing open known after both were found');
console.log('test_hidden_places: ok');
