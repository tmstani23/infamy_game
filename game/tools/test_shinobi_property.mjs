import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const g = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'),
  interiors: read('data/interiors.json'), parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'),
  units: read('data/units.json'), settings: { ...read('data/settings.json'), dayNight: { auto: false } } });
g.clans.addClan('p', { kind: 'ninja', ryo: 5000 });
g.clans.addClan('r');
const clan = g.state.clans.p;
const b = Object.values(g.state.businesses).find(b => b.kind === 'shop');
const id = g.spawn('hero', 'ninja_leader', ...b.ring, { owner: 'p', holdFire: true });
const h = g.state.entities[id];
const command = action => g.step([{ id, type: 'business', action, business: b.id }]);
assert.equal(g.businesses.canBuy(id, b.id).ok, false);
command('buy'); assert.equal(b.owner, null); assert.equal(clan.ryo, 5000);
g.step([{ type: 'time', night: true }]);
assert.equal(g.businesses.canAttack(id, b.id).ok, false);
command('attack'); assert.equal(g.state.attacks[b.id], undefined);
b.owner = 'r'; clan.lanterns = 1;
assert.equal(g.businesses.canRaid(id, b.id).ok, false);
command('raid'); assert.equal(g.state.attacks[b.id], undefined); assert.equal(clan.lanterns, 1);
// A raid restored from an older state must not bypass the capture prohibition.
Object.assign(h, { place: b.room, x: 0, z: 0 });
g.state.attacks[b.id] = { mode: 'raid', business: b.id, room: b.room, clan: 'p', defender: 'r', phase: 'hold',
  hold: { x: 0, z: 0, r: 3 }, holdLeft: 1, away: 0 };
g.businesses.tick();
assert.equal(b.owner, 'r'); assert.equal(g.state.attacks[b.id], undefined);
assert.ok(!g.state.news.some(n => n.kind === 'raidWon'));
// Invalid historical ownership is not an income source, either.
b.owner = 'p';
g.step([{ type: 'time', night: false }]);
assert.equal(clan.ryo, 5000, 'Shinobi receive no business dawn payout');
console.log('Shinobi cannot buy, attack/capture or raid/capture property; old active raid and invalid dawn payout cannot bypass rules');
