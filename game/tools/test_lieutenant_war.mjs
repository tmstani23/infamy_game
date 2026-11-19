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
// War Mode (Tim 2026-11-19): in a frontier war the lieutenant holds what the clan has. No new businesses, no
// War Lantern or raid except to win back a business a rival took since the war began. Shakedowns and Sweeps go on.
{
  const t = fresh('yakuza', 6000), S = t.g.state, L = t.L;
  const biz = Object.values(S.businesses).filter(b => !b.owner && !b.hideout && b.room && b.ring && t.g.businesses.rules[b.kind]);
  const [mineA, theirs, free] = biz;
  t.g.clans.setOwner(mineA.id, 'player'); t.g.clans.setOwner(theirs.id, 'kuroda');
  t.away();
  const boss = t.hero, gate = c => L.gate(boss, { ...c, by: 'lieutenant' });
  // peacetime: buys and raids pass the War Mode check
  assert.equal(L.warHold('player'), false);
  assert.ok(!/War Mode/.test(gate({ type: 'business', action: 'buy', business: free.id, expand: true }).why));
  // a war on (either side): hold
  S.frontier ||= {}; S.frontier.wars ||= { list: {}, cooldown: {}, history: [] };
  S.frontier.wars.list.w1 = { id: 'w1', town: 't1', attacker: 'kuroda', defender: 'player', started: S.tick, state: 'active' };
  assert.equal(L.warHold('player'), true);
  assert.match(gate({ type: 'business', action: 'buy', business: free.id, expand: true }).why, /War Mode/);
  assert.ok(!/War Mode/.test(gate({ type: 'deployment', action: 'shakedown', business: theirs.id }).why), 'Shakedowns go on');
  assert.match(gate({ type: 'business', action: 'raid', business: theirs.id }).why, /win back/);
  assert.match(gate({ type: 'business', action: 'lantern', business: 'x' }).why, /win back/, 'no lantern with nothing lost');
  // a business lost before the war is not a war loss
  assert.equal(theirs.lost, undefined, 'theirs now: ' + theirs.owner + ' ' + theirs.id + ' ' + mineA.id);
  // a rival takes ours during the war: now that one may be raided, and a lantern bought for it
  t.g.step([]);
  t.g.clans.setOwner(mineA.id, 'kuroda');
  assert.equal(mineA.lost?.clan, 'player');
  assert.ok(L.lostInWar('player', mineA));
  assert.ok(!/War Mode/.test(gate({ type: 'business', action: 'raid', business: mineA.id }).why));
  assert.match(gate({ type: 'business', action: 'raid', business: theirs.id }).why, /win back/);
  assert.ok(!/War Mode/.test(gate({ type: 'business', action: 'lantern', business: 'x' }).why));
  // won back: the record clears
  t.g.clans.setOwner(mineA.id, 'player');
  assert.equal(mineA.lost, undefined);
  // switched off by hand: back to normal
  t.g.step([{ id: boss.id, type: 'lieutenant', warMode: false }]);
  assert.equal(L.record('player').warMode, false);
  assert.equal(L.warHold('player'), false);
  t.g.step([{ id: boss.id, type: 'lieutenant', warMode: true }]);
  // the war ends: hold ends
  delete S.frontier.wars.list.w1;
  assert.equal(L.warHold('player'), false);
  // brain: during a war the captain never walks off to buy a new business
  // a real town (the war tick ends a war whose town is gone)
  const town = Object.values(S.frontier.settlements || {})[0] || (S.frontier.settlements ||= {}, S.frontier.settlements.tw = { id: 'tw', name: 'Test', x: 0, z: 0, owner: 'kuroda' });
  S.frontier.wars.list.w2 = { id: 'w2', town: town.id, attacker: 'player', defender: 'kuroda', started: S.tick, state: 'active' };
  const sent = t.run(1200);
  assert.ok(S.frontier.wars.list.w2, 'the test war is still on');
  assert.ok(!sent.some(c => c.expand), 'no new business buys in a war');
  assert.ok(!sent.some(c => c.action === 'lantern' || (c.type === 'deployment' && c.purpose === 'raid')), 'no raid in a war with nothing lost: ' + JSON.stringify(sent.filter(c => c.action === 'lantern' || c.purpose === 'raid').slice(0, 2)) + JSON.stringify(Object.values(S.businesses).filter(x => x.lost)));
  console.log('lieutenant war mode ok');
}
