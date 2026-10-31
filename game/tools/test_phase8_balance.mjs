// Phase 8 section 4 balance (Tim 2026-10-30): payouts -40% with diminishing returns after the
// 4th business, property-clan Renown, one raid per rival per night. Run: node tools/test_phase8_balance.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...settings, dayNight: { auto: false }, territory: { ...settings.territory, quarterBonus: 0 } },   // no quarter bonus in the sums
});
g.clans.addClan('player', { name: 'Your clan' });
g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
const clan = g.state.clans.player;

// six businesses: the 4 best-paying pay full, then 90%, 81%
const small = Object.values(g.state.businesses).filter(b => !b.hideout && b.ring && g.businesses.rules[b.kind]?.payout).slice(0, 6);
assert.equal(small.length, 6, 'six businesses on the map');
const pays = small.map(b => g.businesses.rules[b.kind].payout).sort((a, b) => b - a);
for (const b of small) b.owner = 'player';
clan.ryo = 0;
g.step([{ type: 'time', night: true }]);
g.step([{ type: 'time', night: false }]);
assert.equal(clan.ryo, pays[0] + pays[1] + pays[2] + pays[3] + Math.round(pays[4] * 0.9) + Math.round(pays[5] * 0.81), 'diminishing payouts');
console.log('diminishing payouts ok');

// property-clan Renown from last tick's news; Shinobi earn none from this path
g.state.news.push({ kind: 'raidWon', raider: 'player', defender: 'kuroda', business: small[0].id });
g.state.news.push({ kind: 'sectorCleared', clan: 'player', sector: 's1', ryo: 200 });
g.step();
assert.equal(clan.renown, 80, 'raid win + sector clear Renown');
assert.ok(g.state.news.some(n => n.kind === 'renown' && n.clan === 'player' && n.amount === 75));
console.log('property Renown ok');

// one raid per rival per night
for (const b of small) b.owner = 'kuroda';
g.step([{ type: 'time', night: true }]);
(g.state.raidsTonight ||= {}).player = ['kuroda'];
const hero = g.spawn('hero', 'ronin', small[1].ring[0], small[1].ring[1], { owner: 'player' });
clan.lanterns = 1;
assert.match(g.businesses.canRaid(hero, small[1].id).why, /Already raided/);
g.step([{ type: 'time', night: false }]); g.step([{ type: 'time', night: true }]);
assert.doesNotMatch(g.businesses.canRaid(hero, small[1].id).why, /Already raided/, 'reset at dusk');
console.log('raid limit ok');
