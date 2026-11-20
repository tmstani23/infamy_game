// Z3 (Tim 2026-11-19): what the World map says of each campaign zone (src/zone_map.js zoneMapState): the holder you
// know of, your towns of the cap, known castles and the goal row. Run: node game/tools/test_zone_map.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zoneMapState } from '../src/zone_map.js';
import { createCampaignZones } from '../src/sim/campaign_zones.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), rules = data('data/campaign_zones.json');
const zones = createCampaignZones({ rules, world });
const clans = { player: { name: 'Yakuza clan', color: '#24978c' }, kuroda: { name: 'Kuroda clan', color: '#b02424' }, shinobi: { name: 'Shinobi clan', color: '#7a3fb0' } };
const siteIn = (zone, k = 0) => world.sites.filter(s => zones.zoneOfSite(s) === zone && !zones.closedSites().has(s.id))[k];
const town = (id, owner, zone, k = 0) => { const s = siteIn(zone, k); return { id, owner, site: s.id, x: s.x, z: s.z, founded: 1 }; };
for (const z of rules.zones) assert.ok(Array.isArray(z.labelAt) && zones.zoneAt(z.labelAt[0], z.labelAt[1]) === z.id, `${z.id} label stands inside its zone`);
const S = { a: town('a', 'player', 'east_plains'), b: town('b', 'player', 'east_plains', 1), c: town('c', 'kuroda', 'northern_thaw'), d: town('d', 'player', 'southern_wilds'), e: town('e', 'shinobi', 'southern_wilds', 1),
  f: town('f', 'shinobi', 'western_reach'),
  castle_east_plains: { id: 'castle_east_plains', owner: 'player', castle: {}, capital: true, x: 13055, z: 2125 }, castle_northern_thaw: { id: 'castle_northern_thaw', owner: 'kuroda', castle: {}, capital: true, x: 5891, z: 568 },
  castle_western_reach: { id: 'castle_western_reach', owner: 'shinobi', castle: {}, capital: true, x: 3411, z: 7461 } };
const row = (st, id) => st.rows.find(r => r.id === id);
// all discovered
let st = zoneMapState({ rules, world, settlements: S, clans, clan: 'player' });
assert.equal(st.rows.length, 6);
assert.deepEqual([row(st, 'east_plains').status, row(st, 'east_plains').mine, row(st, 'east_plains').text], ['you', 2, 'Held by you']);
assert.equal(row(st, 'northern_thaw').text, 'Held by the Kuroda clan'); assert.equal(row(st, 'northern_thaw').color, '#b02424');
assert.equal(row(st, 'southern_wilds').text, 'Contested'); assert.equal(row(st, 'southern_wilds').mine, 1);
assert.equal(row(st, 'sutra_heartland').text, 'Free');
assert.equal(st.castles.length, 3); assert.equal(st.castles.find(c => c.mine).name, 'Your castle'); assert.ok(st.castles.some(c => c.name === 'Kuroda castle'));
assert.deepEqual([st.goal.held, st.goal.need, st.goal.total], [1, 4, 6]); assert.equal(st.goal.text, 'Hold 4 of 6 zones, one next to a rival castle');
// nothing discovered: rivals unseen, your own zones still true
st = zoneMapState({ rules, world, settlements: S, clans, clan: 'player', known: () => false });
assert.equal(row(st, 'northern_thaw').text, 'No towns known'); assert.equal(row(st, 'northern_thaw').color, null);
assert.equal(row(st, 'western_reach').text, 'No towns known');
assert.equal(row(st, 'east_plains').text, 'Held by you');
assert.equal(row(st, 'southern_wilds').text, 'Contested', 'with a town there you know you do not hold it');
assert.equal(st.castles.length, 1);
// no zones data: nothing
assert.equal(zoneMapState({ rules: null, world, settlements: S, clans, clan: 'player' }), null);
console.log('zone map ok');
