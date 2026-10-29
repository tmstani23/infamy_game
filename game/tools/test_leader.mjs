// Phase 6 (Tim 2026-10-29): ganging up on the season leader (sim/leader.js): bounties, underdog help.
// Run: node game/tools/test_leader.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
g.clans.addClan('player', { name: 'Yakuza' });
g.clans.addClan('kuroda', { bot: true, faction: 'kuroda' });
g.clans.addClan('shinobi', { bot: true, kind: 'ninja' });
const L = g.leader.rules, C = g.state.clans;
let scores = { player: 0, kuroda: 0, shinobi: 0 };
g.territory.standings = () => Object.entries(scores).map(([clan, score]) => ({ clan, score })).sort((a, b) => b.score - a.score);
const tick = () => g.step();
// no clear leader: nothing
scores = { player: 3, kuroda: 2, shinobi: 0 }; tick();
assert.equal(g.leader.leader(), null, 'one point ahead is not leading');
// Kuroda lead: a raid on them pays the raider, the Shinobi never earn
scores = { player: 2, kuroda: 10, shinobi: 1 }; tick();
assert.equal(g.leader.leader(), 'kuroda');
let ryo = C.player.ryo, sryo = C.shinobi.ryo;
g.state.news.push({ kind: 'raidWon', raider: 'player', defender: 'kuroda' }, { kind: 'shakedownSuccess', clan: 'player', defender: 'kuroda' },
  { kind: 'raidWon', raider: 'shinobi', defender: 'kuroda' });
tick();
assert.equal(C.player.ryo, ryo + L.raid + L.shakedown, 'raid + Shakedown bounty');
assert.equal(C.shinobi.ryo, sryo, 'Shinobi earn no bounty');
// underdog: cheaper hires, faster respawn
assert.ok(g.leader.underdog('player') && g.leader.underdog('shinobi') && !g.leader.underdog('kuroda'));
const full = g.clans.hirePrice('kuroda', 'spearman') ?? g.clans.hirePrice('kuroda', 'thug');
scores = { player: 9, kuroda: 10, shinobi: 1 }; tick();
const evenPrice = g.clans.hirePrice('player', 'thug');
scores = { player: 2, kuroda: 10, shinobi: 1 }; tick();
assert.equal(g.clans.hirePrice('player', 'thug'), Math.round(evenPrice * (1 - L.underdogHireDiscount)), 'underdog hire discount');
assert.equal(g.leader.respawnFactor('player'), 1 - L.underdogRespawnFaster);
assert.ok(full > 0);
// Shinobi lead: downing their boss / crew pays property clans
scores = { player: 2, kuroda: 1, shinobi: 12 }; tick();
ryo = C.player.ryo;
g.leader.downed({ owner: 'player' }, { owner: 'shinobi', type: 'hero' });
g.leader.downed({ owner: 'player' }, { owner: 'shinobi', type: 'ninja' });
g.leader.downed({ owner: 'player' }, { owner: 'kuroda', type: 'thug' });
assert.equal(C.player.ryo, ryo + L.shinobiBoss + L.shinobiCrew, 'Shinobi leader bounties');
ryo = C.player.ryo;
g.state.news.push({ kind: 'raidWon', raider: 'player', defender: 'shinobi', hq: true }); tick();
assert.equal(C.player.ryo, ryo + L.shinobiHQ, 'Shinobi HQ raid bounty');
console.log('leader ok');
