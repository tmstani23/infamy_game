// Captain hiring mix (Tim 2026-11-10): with the boss away the captain cycles the clan's real units, buys a basic
// unit only while money is tight, and at the crew cap lets a basic crewman go once he can afford better.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const fresh = (kind, ryo) => {
  const g = createGame(options());
  const m = setupMatch(g, { clan: kind, difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: ryo }, seed: 9 });
  const S = g.state, hero = S.entities[m.heroId], L = g.lieutenant, brains = makeBots(g, m.rivals);
  const mine = brains.find(b => b.config?.lieutenant && b.config.clan === 'player');
  const gate = g.doors.find(d => d.gate && d.place === 'world');
  g.step([{ id: hero.id, type: 'lieutenant', budget: 2000, orders: { defend: true, retake: false, shakedown: false, sweep: false, contracts: false, hire: true, buy: false, jobs: false, steal: false, raid: false } }]);
  Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z, hp: 1e6, maxHp: 1e6, order: null }); g.step([]);
  const run = (n, until = () => false) => { for (let i = 0; i < n && !until(); i++) g.step(mine.tick()); };
  const log = () => L.record('player').log.map(x => x.text);
  const count = () => { const n = {}; for (const k of [...g.clans.crewOf('player').filter(u => !u.dead && !u.captain).map(u => u.type), ...S.clans.player.queue.map(q => q.unit)]) n[k] = (n[k] || 0) + 1; return n; };
  return { g, S, hero, L, run, log, count, clan: S.clans.player, U: g.settings.units.types };
};
const REAL = { yakuza: ['swordsman', 'archer', 'yakuza_enforcer'], kuroda: ['spearman', 'kuroda_rifleman', 'kuroda_enforcer'], shinobi: ['ninja', 'ninja_tanto', 'shinobi_geisha', 'shinobi_enforcer'] };
// plenty of ryo: one of each real unit in turn, never a thug or brute
for (const kind of Object.keys(REAL)) {
  const t = fresh(kind, 6000), cap = t.g.clans.crewCap('player'), had = t.count();
  t.run(6000, () => t.g.clans.crewCount('player') >= cap && !t.clan.queue.length);
  const n = t.count(), got = k => (n[k] || 0) - (had[k] || 0), each = REAL[kind].map(got);
  console.log(kind, JSON.stringify(n), `cap ${cap}`);
  assert.ok(each.every(x => x >= 1), `${kind}: hired every real unit (${each})`);
  assert.ok(Math.max(...REAL[kind].map(k => n[k] || 0)) - Math.min(...REAL[kind].map(k => n[k] || 0)) <= 1 || Math.max(...each) - Math.min(...each) <= 1, `${kind}: an even cycle (${each})`);
  assert.equal(got('thug') + got('brute'), 0, `${kind}: no basic units while he can afford better`);
}
// tight treasury: a thug as the fallback
{
  const t = fresh('yakuza', 6000), had = t.count();
  t.clan.ryo = 50 + t.g.clans.hirePrice('player', 'thug') + 5;
  t.run(1200, () => t.clan.queue.length > 0);
  assert.equal(t.clan.queue[0]?.unit, 'thug', `fallback thug when the treasury is tight: ${t.log().slice(-1)}`);
  assert.equal(t.count().thug, (had.thug || 0) + 1, 'one more thug');
}
// at the crew cap with thugs and money: one thug is let go, a real unit takes the place
{
  const t = fresh('yakuza', 6000), cap = t.g.clans.crewCap('player'), hq = t.L.hq('player');
  const d = t.g.doors.find(x => x.to && x.place === hq.room);
  while (t.g.clans.crewCount('player') < cap) t.g.spawn('thug', t.U.thug.sprite, d.x, d.z + 1, { owner: 'player', hp: t.U.thug.hp, deployment: { group: 'home', everAssigned: true, keepAtHQ: true } });
  const thugs = () => t.count().thug || 0, before = thugs();
  t.run(3000, () => t.log().some(x => /Let a thug go/.test(x)) && REAL.yakuza.some(k => t.count()[k]));
  console.log(t.log().slice(-4).join(' | '), JSON.stringify(t.count()));
  assert.ok(t.log().some(x => /Let a thug go/.test(x)), 'let a thug go');
  assert.ok(thugs() < before, 'fewer thugs');
  assert.ok(REAL.yakuza.some(k => t.count()[k]), 'a real unit hired in his place');
  assert.ok(t.g.clans.crewCount('player') + t.clan.queue.length <= cap, 'never over the cap');
}
console.log('lieutenant mix ok');
