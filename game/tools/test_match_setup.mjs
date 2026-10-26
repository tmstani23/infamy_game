import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createBot } from '../src/sim/bot.js';
import { createNinjaBot } from '../src/sim/ninja_bot.js';
import { CLAN_CHOICES, DIFFICULTY_CHOICES } from '../src/sim/match_options.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const district = data('data/port_town.json'), bots = data('data/bots.json');
const make = () => createGame({ district, catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
const homes = { yakuza: 'inn', kuroda: 'izakaya', shinobi: 'longhouse' };
for (const choice of CLAN_CHOICES) for (const difficulty of DIFFICULTY_CHOICES) {
  const g = make();
  const { heroId, rivals } = setupMatch(g, { clan: choice.id, difficulty: difficulty.id, bots, spawns: district.spawns });
  const S = g.state;
  assert.equal(S.tick, 0, 'setup never advances the clock');
  assert.equal(Object.keys(S.clans).length, 3);
  assert.equal(rivals.length, 2);
  assert.equal(S.entities[heroId].model, choice.model);
  assert.equal(S.clans.player.kind, choice.kind);
  assert.equal(S.clans.player.color, choice.color);
  assert.deepEqual(S.match, { clan: choice.id, difficulty: difficulty.id });
  for (const identity of CLAN_CHOICES) {
    const id = identity.id === choice.id ? 'player' : identity.id;
    const owned = Object.values(S.businesses).filter(b => b.owner === id);
    assert.equal(owned.length, 1, 'HQ only; no clan gets a starting business');
    assert.equal(owned[0].room, homes[identity.id], 'each faction retains its intended physical home');
    assert.equal(owned[0].hideout, id);
    assert.equal(S.clans[id].ryo, 200);
    assert.equal(S.clans[id].queue.length, 0);
    const crew = g.clans.crewOf(id);
    assert.equal(crew.length, 1);
    assert.equal(crew[0].type, identity.kind === 'ninja' ? 'ninja' : 'thug');
    assert.equal(g.clans.crewCap(id), 3);
    assert.ok(g.nav.free(crew[0].x,crew[0].z));
    const hero = Object.values(S.entities).find(e => e.owner === id && e.type === 'hero');
    assert.equal(hero.model, identity.model);
    assert.ok(g.nav.findPath(crew[0].x,crew[0].z,hero.x,hero.z));
  }
  for (const r of rivals) assert.equal(r.rules, (r.kind === 'ninja' ? bots.shinobiLevels : bots.levels)[difficulty.id]);
  const brains = rivals.map(r => (r.kind === 'ninja' ? createNinjaBot : createBot)(g,r));
  let orders = 0;
  for (let i=0;i<20*12;i++) {
    const commands = brains.flatMap(b => b.tick()); orders += commands.length; g.step(commands);
  }
  assert.ok(orders > 0, `${choice.id}/${difficulty.id}: both AI profiles launch into live play`);
}
for (const test of [{setup:'ninja',ninja:true}, {setup:'bot',playerRyo:3000,botRyo:5000,playerOwns:'teahouse'}, {setup:'lantern',playerRyo:3000}]) {
  const g = make(), { options } = setupMatch(g,{clan:'kuroda',difficulty:'easy',bots,spawns:district.spawns,test});
  assert.equal(options.clan,test.ninja?'shinobi':test.setup==='bot'?'yakuza':'kuroda');
  assert.equal(g.state.clans.player.ryo,test.playerRyo??200);
  if (test.setup === 'bot') {
    assert.equal(g.state.clans.kuroda.ryo,5000);
    assert.equal(Object.values(g.state.businesses).find(b=>b.kind==='teahouse').owner,'player');
  } else for (const c of Object.values(g.state.clans)) assert.equal(c.ryo,c.id==='player'?(test.playerRyo??200):200);
  if(test.setup==='lantern') {
    assert.equal(g.clans.crewOf('player').length,1);
    assert.equal(Object.values(g.state.businesses).filter(b=>b.owner==='player').length,1,'lantern preset grants HQ only');
  }
}
for (const options of [{clan:'invalid',difficulty:'easy'}, {clan:'yakuza',difficulty:'invalid'}]) {
  const g = make();
  assert.throws(()=>setupMatch(g,{...options,bots}));
  assert.equal(Object.keys(g.state.clans).length,0,'invalid choices cannot partially initialize a match');
}
console.log('Start menu setup: all 9 clan/difficulty combinations, correct HQs/leaders, fair resources, both live AI brains, validation and test presets passed');
