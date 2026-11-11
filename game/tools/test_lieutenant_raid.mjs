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
  // the owner starts knocking the War Lantern down (Tim 2026-11-10): the raiders go for him and the channel breaks
  {
    const foeBoss = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === 'kuroda');
    const knocker = S.entities[t.g.spawn('thug', U.thug.sprite, a.lantern.x + 0.5, a.lantern.z, { owner: 'kuroda', hp: 1e5, maxHp: 1e5, holdFire: true })];
    t.run(60);   // the raiders gather at the door
    let broke = 0, started = 0;
    for (let k = 0; k < 3 && S.attacks[a.business]?.phase === 'warmup'; k++) {
      Object.assign(knocker, { x: a.lantern.x + 0.5, z: a.lantern.z, order: null });
      t.g.step([{ id: foeBoss.id, type: 'business', action: 'knock', business: a.business }]);
      if (!S.attacks[a.business]?.knock) break;
      started++;
      t.run(95, () => !S.attacks[a.business]?.knock);   // the channel takes knockSeconds (5 s = 100 ticks)
      if (S.attacks[a.business] && !S.attacks[a.business].knock) broke++;
    }
    assert.ok(started > 0, 'the owner started knocking the lantern down');
    assert.ok(S.attacks[a.business], `the raid is still on: ${t.clan.notice?.text}`);
    assert.equal(broke, started, 'every knock-down was interrupted by the raiders');
    t.g.removeUnit?.(knocker.id); if (S.entities[knocker.id]) { knocker.dead = true; knocker.diedAt = S.tick; }
    console.log('raiders break the knock-down:', broke, 'of', started);
  }
  let inside = 0;
  t.run(3600, () => { const x = S.attacks[a.business]; if (x) inside = Math.max(inside, Object.values(S.entities).filter(u => u.owner === 'player' && u.place === x.room && !u.dead).length); return !S.attacks[a.business]; });
  console.log('most inside', inside, 'owner now', S.businesses[a.business].owner, t.clan.notice?.text);
  assert.ok(inside > 0, 'crew went in');
  // they stay in and hold the back room until it is theirs (Tim 2026-11-10: they used to walk straight back out)
  assert.equal(S.businesses[a.business].owner, 'player', `the raid is won: ${t.clan.notice?.text}`);
  assert.doesNotMatch(t.clan.notice?.text || '', /full inside|Lantern planted|RALLY/, 'no boss prompts from the captain\'s raid');
  // a rival clan with its boss away (Tim 2026-11-10): its captain runs the same raid, against a business of yours
  {
    const r = fresh('yakuza', 3000), S2 = r.S, heroOf = id => Object.values(S2.entities).find(e => e.type === 'hero' && e.owner === id);
    const rival = Object.keys(S2.clans).find(id => id !== 'player' && S2.clans[id].bot && S2.clans[id].kind !== 'ninja' && heroOf(id) && r.brains.some(b => b.config?.lieutenant && b.config.clan === id));
    assert.ok(rival, 'a rival clan with a lieutenant');
    const brain = r.brains.find(b => b.config?.lieutenant && b.config.clan === rival), boss = heroOf(rival);
    const mineB = Object.values(S2.businesses).filter(b => !b.owner && !b.hideout && b.room && b.ring && r.g.businesses.rules[b.kind])[0];
    r.g.clans.setOwner(mineB.id, 'player');
    S2.clans[rival].ryo = 6000;
    const hq = r.L.hq(rival), d2 = r.g.doors.find(x => x.to && x.place === hq.room);
    for (let i = 0; i < 5; i++) r.g.spawn('thug', U.thug.sprite, d2.x + i * 0.5, d2.z + 1, { owner: rival, hp: U.thug.hp, deployment: { group: 'home', everAssigned: true, keepAtHQ: true } });
    for (let i = 0; i < 20; i++) r.g.step([]);
    Object.assign(boss, { place: 'world', x: r.g.gate.island[0], z: r.g.gate.island[1], hp: 1e6, maxHp: 1e6, order: null }); r.g.step([]);
    Object.assign(r.hero, { hp: 1e6, maxHp: 1e6 });
    r.g.step([{ type: 'time', night: true }]);
    const rlog = () => r.L.record(rival).log.map(x => x.text);
    const go = (n, until) => { for (let i = 0; i < n && !until(); i++) { if (!S2.night) r.g.step([{ type: 'time', night: true }]); r.g.step(brain.tick()); } };
    go(9000, () => rlog().some(x => /Raiding the/.test(x)));
    assert.ok(rlog().some(x => /Raiding the/.test(x)), `the rival captain planted a lantern: ${rlog().slice(-5).join(' | ')}`);
    const ra = Object.values(S2.attacks).find(x => x.clan === rival);
    assert.ok(ra, 'a rival raid is on');
    go(3600, () => !S2.attacks[ra.business]);
    assert.equal(S2.businesses[ra.business].owner, rival, 'the rival captain won the raid');
    console.log('rival captain raid: ok', S2.businesses[ra.business].kind);
  }
  // defending with the boss away (Tim 2026-11-10): a rival plants a War Lantern at one of ours, our crew knock it down
  {
    const d3 = fresh('yakuza', 3000), S3 = d3.S, foeBoss = Object.values(S3.entities).find(e => e.type === 'hero' && e.owner === 'kuroda');
    const ours = Object.values(S3.businesses).filter(b => !b.owner && !b.hideout && b.room && b.ring && d3.g.businesses.rules[b.kind])[0];
    d3.g.clans.setOwner(ours.id, 'player');
    const dd = d3.g.doors.find(x => x.to && x.place === d3.L.hq('player').room);
    for (let i = 0; i < 4; i++) d3.g.spawn('thug', U.thug.sprite, dd.x + i * 0.5, dd.z + 1, { owner: 'player', hp: U.thug.hp, deployment: { group: 'home', everAssigned: true } });
    for (let i = 0; i < 20; i++) d3.g.step([]);
    d3.away();
    d3.g.step([{ type: 'time', night: true }]);
    S3.clans.kuroda.lanterns = 1;
    Object.assign(foeBoss, { place: 'street', x: ours.ring[0], z: ours.ring[1], hp: 1e6, maxHp: 1e6, holdFire: true });
    d3.g.step([{ id: foeBoss.id, type: 'business', action: 'raid', business: ours.id }]);
    assert.ok(S3.attacks[ours.id]?.lantern, `a rival lantern stands at ours: ${S3.clans.kuroda.notice?.text}`);
    Object.assign(foeBoss, { x: ours.ring[0] + 40, z: ours.ring[1] + 30 });   // walks off, out of the way
    d3.run(880, () => !S3.attacks[ours.id]);
    assert.ok(!S3.attacks[ours.id] && S3.businesses[ours.id].owner === 'player', `our crew knocked the lantern down in time: ${d3.L.record('player').log.slice(-3).map(x => x.text).join(' | ')}`);
    console.log('captain defence knocks the lantern down: ok');
  }
  // Shinobi lieutenants never raid
  const n = fresh('shinobi', 6000);
  assert.equal(n.L.gate(n.hero, { type: 'business', action: 'raid', business: target.id }).ok, false);
  console.log('test_lieutenant_raid: ok');
}
