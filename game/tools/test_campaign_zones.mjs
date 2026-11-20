// Z1: campaign zones (sim/campaign_zones.js, data/campaign_zones.json). Run from the repo root:
//   node game/tools/test_campaign_zones.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCampaignZones } from '../src/sim/campaign_zones.js';

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const rules = data('campaign_zones.json'), world = data('world.json');
let towns = {};
const Z = createCampaignZones({ rules, world, settlements: () => towns });
const ids = rules.zones.map(z => z.id);

// data: six zones, every region used, touches are mutual
assert.equal(ids.length, 6);
for (const r of world.regions) assert.ok(rules.zones.some(z => z.regions.some(p => (p.id || p) === r.id)), `region ${r.id} is in a zone`);
for (const z of rules.zones) for (const t of z.touches) { assert.ok(Z.touches(t, z.id), `${z.id} and ${t} touch both ways`); }
assert.ok(!Z.touches('northern_thaw', 'southern_wilds'), 'north and south do not touch');
assert.deepEqual(rules.zones.find(z => z.id === 'sutra_heartland').touches.sort(), ids.filter(i => i !== 'sutra_heartland').sort(), 'the heartland touches every zone');

// every site is in exactly one zone; counts match the plan table
const per = {};
for (const s of world.sites) { const z = Z.zoneOfSite(s); assert.ok(ids.includes(z), `site ${s.id} has a zone`); assert.equal(Z.zoneAt(s.x, s.z), z, `site ${s.id}: point and region agree`); per[z] = (per[z] || 0) + 1; }
assert.deepEqual(per, { east_plains: 8, northern_thaw: 8, sutra_heartland: 7, southern_wilds: 9, red_desert: 14, western_reach: 14 });

// every map point has a zone (grid sweep), off the map has none; the split lines
for (let x = 25; x < world.size.w; x += 250) for (let z = 25; z < world.size.h; z += 250) assert.ok(ids.includes(Z.zoneAt(x, z)), `point ${x},${z}`);
assert.equal(Z.zoneAt(-5, 100), null); assert.equal(Z.zoneAt(NaN, 1), null);
assert.equal(Z.zoneAt(5249, 600), 'red_desert'); assert.equal(Z.zoneAt(5250, 600), 'northern_thaw');
assert.equal(Z.zoneAt(10499, 600), 'northern_thaw'); assert.equal(Z.zoneAt(10500, 600), 'east_plains');
assert.equal(Z.zoneAt(5249, 7000), 'western_reach'); assert.equal(Z.zoneAt(6000, 7000), 'sutra_heartland'); assert.equal(Z.zoneAt(7000, 7000), 'southern_wilds');

// castles: five sites, none in the heartland, the east one at the capital point
const C = Z.castles();
assert.equal(C.length, 5); assert.ok(!C.some(c => c.zone === 'sutra_heartland'));
for (const c of C) assert.equal(Z.zoneAt(c.x, c.z), c.zone, `castle of ${c.zone} stands in its zone`);
assert.equal(Z.zoneAt(world.capital.x, world.capital.z), 'east_plains');
assert.deepEqual(C.find(c => c.zone === 'east_plains'), { zone: 'east_plains', site: null, x: 13055, z: 2180, sea: 'south', blocksSites: ['S47'] });
assert.deepEqual([...Z.closedSites()].sort(), ['S37', 'S41', 'S43', 'S47', 'S55', 'S56']);
// Z5: each castle has its own spot near its site, a dock side, and keeps towns castleSpacing away
assert.deepEqual(C.find(c => c.zone === 'northern_thaw'), { zone: 'northern_thaw', site: 'S55', x: 5869, z: 513, sea: 'north', blocksSites: [] });
for (const c of C) { assert.ok(['north', 'east', 'south', 'west'].includes(c.sea)); assert.ok(Z.nearCastle(c.x + 300, c.z)); if (c.site) { const s = world.sites.find(x => x.id === c.site); assert.ok(Math.hypot(s.x - c.x, s.z - c.z) < 400, `${c.zone} castle stands near its picked site`); } }
assert.ok(!Z.nearCastle(7000, 4000));
for (const s of world.sites) if (Z.nearCastle(s.x, s.z)) assert.ok(Z.closedSites().has(s.id), `${s.id} by a castle is closed`);
assert.deepEqual(Z.castleSites().sort(), ['S41', 'S43', 'S55', 'S56']);

// holding a zone
const site = id => world.sites.find(s => s.id === id);
let n = 0;
const town = (owner, siteId, more = {}) => { const s = site(siteId), id = `t${++n}`; towns[id] = { id, owner, site: siteId, x: s.x, z: s.z, founded: 1, ...more }; return towns[id]; };
towns = { capital: { id: 'capital', capital: true, owner: 'a', x: world.capital.x, z: world.capital.z, founded: 0 } };
assert.equal(Z.holder('east_plains'), null, 'the capital is not a town');
const t1 = town('a', 'S10');
assert.equal(Z.holder('east_plains'), 'a'); assert.deepEqual(Z.held('a'), ['east_plains']);
const t2 = town('b', 'S28');
assert.equal(Z.holder('east_plains'), null, 'a rival town left: nobody holds it');
t2.owner = 'a';                                       // captured
assert.equal(Z.holder('east_plains'), 'a'); assert.equal(Z.count('a', 'east_plains'), 2); assert.ok(Z.full('a', 'east_plains')); assert.ok(!Z.full('b', 'east_plains'));
t2.owner = null;                                      // empty town: counts for nobody
assert.equal(Z.holder('east_plains'), 'a'); assert.equal(Z.count('a', 'east_plains'), 1);
t1.owner = null;
assert.equal(Z.holder('east_plains'), null, 'only empty towns: nobody');
town('b', 'S47', { castle: true });
assert.equal(Z.holder('east_plains'), null, 'a castle is not a town');
town('a', 'S11', { founded: undefined });
assert.equal(Z.holder('east_plains'), null, 'an unfounded record is not a town');
const sum = Z.summary().find(z => z.id === 'east_plains');
assert.deepEqual({ holder: sum.holder, towns: sum.towns, empty: sum.empty }, { holder: null, towns: {}, empty: 2 });
// a dead clan's towns count for nobody
{ towns = {}; town('a', 'S10'); town('x', 'S28');
  const Z2 = createCampaignZones({ rules, world, settlements: () => towns, isClan: id => id !== 'x' });
  assert.equal(Z2.holder('east_plains'), 'a'); }

// the 4 of 6 castle rule
towns = {};
town('a', 'S10'); town('a', 'S05'); town('a', 'S16');                    // east, north, heartland
assert.deepEqual(Z.siege('a', 'red_desert'), { ok: false, held: 3, need: 4, near: true });
town('a', 'S27');                                                        // + south: 4 zones
assert.ok(Z.siege('a', 'red_desert').ok, 'north and heartland touch the desert');
assert.ok(Z.siege('a', 'western_reach').ok);
towns = {}; town('a', 'S10'); town('a', 'S27'); town('a', 'S20'); town('a', 'S01');   // east, south, west, desert
assert.deepEqual(Z.siege('a', 'northern_thaw'), { ok: true, held: 4, need: 4, near: true });
assert.ok(Z.siege('a', 'red_desert').ok, "holding the castle's own zone counts as near");
towns = {}; town('a', 'S10'); town('a', 'S27'); town('a', 'S16'); town('a', 'S20');   // east, south, heartland, west
town('b', 'S16'.replace('16', '17'));                                                 // rival in the heartland
assert.deepEqual(Z.siege('a', 'northern_thaw'), { ok: false, held: 3, need: 4, near: true });
towns = {}; town('a', 'S27'); town('a', 'S20'); town('a', 'S10'); town('a', 'S16'); town('b', 'S10'.replace('10', '11'));
assert.equal(Z.siege('a', 'northern_thaw').held, 3);

console.log('test_campaign_zones: ok');
