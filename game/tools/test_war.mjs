// F6 war, checkpoint 1: planting the war camp banner is the declaration. One war per town, the
// banner band round the town's build ring, the cooldown after a war, and save/load of war records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), frontier: { ...frontier, dev: true } });
function match(mode) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
  return { g, hero: g.state.entities[m.heroId] };
}
const W = frontier.war, dayTicks = Math.round((settings.dayNight.daySeconds + settings.dayNight.nightSeconds) * 20);
assert.ok(W && W.circleRadius === 900 && W.cooldownDays === 6, 'war data block');

const { g, hero } = match('campaign');
const war = g.frontier.war, fw = g.frontier.world;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
assert.ok(rival, 'a rival clan exists');

// two open plains far from the capital and from each other
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: frontier.founding.startStock, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);   // the hub gives both towns their grid
const ring = frontier.tiers.list[0].ring, inner = ring + W.band.inner, outer = ring + W.band.outer;
assert.deepEqual(war.band(enemy), [inner, outer], 'Camp tier band 300 to 450');

const put = (x, z) => Object.assign(hero, { x, z, place: 'world' });
war.active();   // old saves get the empty war records on first use
const snap = () => JSON.stringify(g.state.frontier.wars);
const plant = (town, x, z) => { g.step([{ id: hero.id, type: 'frontier', action: 'plantBanner', town, x, z }]); return g.state.frontier.receipts.find(r => r.action === 'plantBanner'); };
const rejected = (why, re, town, x, z) => { const before = snap(), r = plant(town, x, z); assert.ok(r && !r.ok && re.test(r.reason), `${why}: ${r?.reason}`); assert.equal(snap(), before, `${why}: nothing changed`); };
const ex = enemy.x, ez = enemy.z, mid = (inner + outer) / 2;

put(ex + mid, ez);
rejected('own town', /your own town/, 'myTown', ex + mid, ez);
rejected('capital', /capital/, Object.values(g.state.frontier.settlements).find(s => s.capital).id, ex + mid, ez);
rejected('no such town', /No such town/, 'nowhere', ex + mid, ez);
rejected('no spot', /Choose a spot/, 'enemyTown');
put(ex + inner - 40, ez);
rejected('too close', /Too close/, 'enemyTown', ex + inner - 20, ez);
put(ex + outer + 20, ez);
rejected('too far', /Too far/, 'enemyTown', ex + outer + 20, ez);
put(ex + mid, ez);
rejected('banner far from hero', /too far from the hero/, 'enemyTown', ex, ez + mid);
put(ex + W.circleRadius + 50, ez);
rejected('hero outside the circle', /Come within/, 'enemyTown', ex + W.circleRadius + 40, ez);
put(ex + mid, ez); hero.place = 'street';
rejected('not on the island', /out on the island/, 'enemyTown', ex + mid, ez);
// a crew member cannot plant it
{
  put(ex + mid, ez);
  const before = snap();
  const crew = g.spawn('grunt', 'grunt', hero.x + 1, hero.z, { owner: 'player', place: 'world' });
  const id = typeof crew === 'object' ? crew.id : crew;
  g.step([{ id, type: 'frontier', action: 'plantBanner', town: 'enemyTown', x: ex + mid, z: ez }]);
  assert.equal(snap(), before, 'only a hero plants a banner');
}

// the real thing
put(ex + mid, ez);
{ const before = snap(); assert.ok(war.check(hero, 'enemyTown', { x: ex + mid, z: ez + 10 }).ok, 'read-only check passes'); assert.equal(snap(), before, 'check changes nothing'); }
const ok = plant('enemyTown', ex + mid, ez + 10);
assert.ok(ok?.ok, ok?.reason);
const rec = war.warOn('enemyTown');
assert.ok(rec && rec.attacker === 'player' && rec.defender === rival && rec.state === 'active' && rec.x === Math.round(ex + mid) && rec.z === Math.round(ez + 10));
assert.match(g.state.clans[rival].notice?.text || '', /declared war on enemyTown/, 'the defender is told');
assert.equal(war.warsAt(ex, ez).length, 1, 'the hall is inside the war circle');
assert.equal(war.warsAt(ex + W.circleRadius + 5, ez).length, 0, 'outside the circle');
assert.equal(war.warsOf(rival).length, 1);
rejected('one war per town', /already at war/, 'enemyTown', ex + mid, ez - 30);

// save and load keep the war
{
  const save = makeSave(g);
  const g2 = createGame(options());
  setupMatch(g2, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
  loadSave(g2, JSON.parse(JSON.stringify(save)));
  assert.deepEqual(g2.frontier.war.warOn('enemyTown'), JSON.parse(JSON.stringify(rec)), 'war survives save/load');
}

// ending a war starts the cooldown
g.step([{ id: hero.id, type: 'frontier', action: 'devEndWar', war: rec.id }]);
assert.equal(war.warOn('enemyTown'), null);
assert.equal(g.state.frontier.wars.history.at(-1).id, rec.id);
assert.equal(war.cooldownDays('enemyTown'), W.cooldownDays);
rejected('cooldown', /under truce for 6 more days/, 'enemyTown', ex + mid, ez);
g.state.tick += dayTicks * (W.cooldownDays - 1);
rejected('cooldown last day', /1 more day\b/, 'enemyTown', ex + mid, ez);
g.state.tick += dayTicks;
const again = plant('enemyTown', ex + mid, ez);
assert.ok(again?.ok, `after the cooldown: ${again?.reason}`);

// several wars at once: a second enemy town
const third = spots[1];
fw.settlement('myTown');   // (the player's own town stays out of it)
const enemy2 = addTown('enemyTown2', rival, [third[0] + 0, third[1] + 1700 > world.size.h ? third[1] - 1700 : third[1] + 1700]);
g.step([]);
put(enemy2.x + mid, enemy2.z);
const second = plant('enemyTown2', enemy2.x + mid, enemy2.z);
if (second?.ok) assert.equal(war.warsOf('player').length, 2, 'two wars at once');
else assert.match(second.reason, /cannot be built|resource/, `second war only blocked by ground: ${second.reason}`);

// Classic has no wars
{
  const c = match('classic');
  const r = c.g.frontier?.war.check(c.hero, 'x', { x: 0, z: 0 });
  if (r) assert.match(r.reason, /campaign/);
}
g.frontier.world.checkInvariants();
console.log('test_war: ok');
