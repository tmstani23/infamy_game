import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const fresh = (kind, ryo = 3000) => {
  const g = createGame(options());
  const m = setupMatch(g, { clan: kind, difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: ryo }, seed: 9 });
  const hero = g.state.entities[m.heroId], L = g.lieutenant, brains = makeBots(g, m.rivals);
  const mine = brains.find(b => b.config?.lieutenant && b.config.clan === 'player');
  const gate = g.doors.find(d => d.gate && d.place === 'world');
  const away = () => { Object.assign(hero, { place: 'world', x: gate.to.x, z: gate.to.z, hp: 1e6, maxHp: 1e6, order: null }); for (const u of g.clans.crewOf('player')) u.order = { kind: 'move', x: u.x, z: u.z, arrived: true }; g.step([]); };
  const run = (n, until = () => false) => { const sent = []; for (let i = 0; i < n && !until(); i++) { const out = mine.tick(); sent.push(...out); g.step(out); } return sent; };
  return { g, m, hero, L, mine, brains, away, run, clan: g.state.clans.player, S: g.state };
};
// Lieutenant raids (Tim 2026-11-08): with the boss away the captain buys a War Lantern, calls a Rally of the city
// groups, plants it at a rival business at night and the crew go in to hold the back room.
{
  const t = fresh('yakuza', 6000), U = t.g.settings.units.types, S = t.S;
  const target = Object.values(S.businesses).filter(b => !b.owner && !b.hideout && b.room && b.ring && t.g.businesses.rules[b.kind])[0];
  t.g.clans.setOwner(target.id, 'kuroda');
  const d = t.g.doors.find(x => x.to && x.place === t.L.hq('player').room);
  for (let i = 0; i < 5; i++) t.g.spawn('thug', U.thug.sprite, d.x + i * 0.5, d.z + 1, { owner: 'player', hp: U.thug.hp, deployment: { group: 'home', everAssigned: true, keepAtHQ: true } });
  for (let i = 0; i < 20; i++) t.g.step([]);
  t.away();
  t.g.step([{ type: 'time', night: true }]);
  const log = () => t.L.record('player').log.map(x => x.text);
  t.run(2400, () => log().some(x => /Bought a War Lantern/.test(x)));
  assert.ok(log().some(x => /Bought a War Lantern/.test(x)), `bought a lantern: ${t.clan.notice?.text}`);
  assert.ok(t.clan.ryo >= 1000, 'kept the raid reserve');
  if (!S.night) t.g.step([{ type: 'time', night: true }]);
  t.run(3000, () => log().some(x => /Raiding the/.test(x)));
  console.log(log().slice(-6).join(' | '));
  assert.ok(log().some(x => /Called a Rally to raid/.test(x)), 'called a Rally');
  assert.ok(log().some(x => /Raiding the/.test(x)), `planted the lantern: ${t.clan.notice?.text}`);
  const a = Object.values(S.attacks).find(x => x.clan === 'player');
  assert.ok(a, 'a raid is on');
  let inside = 0;
  t.run(2400, () => { const x = S.attacks[a.business]; if (x) inside = Math.max(inside, Object.values(S.entities).filter(u => u.owner === 'player' && u.place === x.room && !u.dead).length); return !S.attacks[a.business]; });
  console.log('most inside', inside, 'owner now', S.businesses[a.business].owner, t.clan.notice?.text);
  assert.ok(inside > 0, 'crew went in');
  // Shinobi lieutenants never raid
  const n = fresh('shinobi', 6000);
  assert.equal(n.L.gate(n.hero, { type: 'business', action: 'raid', business: target.id }).ok, false);
  console.log('test_lieutenant_raid: ok');
}
