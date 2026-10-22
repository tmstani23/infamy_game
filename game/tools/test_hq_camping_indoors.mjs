import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { hqCampingNoticeVisit } from '../src/hq_camping_notice.js';

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const game = createGame({ district: { ...data('port_town'), banditCamps: [] }, catalog: data('art'),
  cutouts: JSON.parse(readFileSync(new URL('../art/cutouts.json', import.meta.url))),
  interiors: data('interiors'), parts: data('interior_parts'), recipes: data('room_recipes'), units: data('units') });
game.clans.addClan('player'); game.clans.addClan('kuroda');
const rival = Object.values(game.state.businesses).find(b => b.hideout === 'kuroda');
const heroId = game.spawn('hero', 'ronin', ...rival.ring, { owner: 'player' });
const hero = game.state.entities[heroId];
const run = seconds => { for (let i = 0; i < seconds * 20; i++) game.step(); };
run(35);
assert.ok(hqCampingNoticeVisit(game.state, heroId)?.active, 'outdoor camping still activates its warning');
const infamy = game.state.clans.player.infamy;
const brewery = Object.values(game.state.businesses).find(b => b.kind === 'sake_brewery');
const entrance = game.doors.find(d => d.to && d.place === brewery.room && !d.ninja);
Object.assign(hero, { x: entrance.x, z: entrance.z });
game.step([{ id: heroId, type: 'use' }]);
assert.equal(hero.place, brewery.room, 'real brewery door sets the indoor place');
assert.equal(game.state.hqCamping.visits.find(v => v.clan === 'player').inside, false, 'entering indoors starts alarm decay');
assert.equal(hqCampingNoticeVisit(game.state, heroId), null, 'active decay warning is hidden indoors');
// Even overlapping coordinates cannot make an indoor unit count as outdoors.
Object.assign(hero, { x: rival.ring[0], z: rival.ring[1] });
run(35);
assert.equal(game.state.clans.player.infamy, infamy, 'indoor presence never adds camping infamy');
assert.equal(game.state.hqCamping.visits.find(v => v.clan === 'player'), undefined, 'indoor time clears the active alarm');
run(35);
assert.equal(game.state.clans.player.infamy, infamy, 'indoor presence cannot start a fresh alarm');
const crewId = game.spawn('thug', 'thug', ...rival.ring, { owner: 'player', order: { kind: 'stop' } });
run(35);
assert.ok(game.state.clans.player.infamy > infamy, 'crew actually outdoors still count while the hero is inside');
assert.equal(hqCampingNoticeVisit(game.state, heroId), null, 'outside crew cannot show a leave-area warning indoors');
hero.place = 'street';
assert.ok(hqCampingNoticeVisit(game.state, heroId)?.active, 'warning returns outdoors');
game.state.entities[crewId].place = brewery.room;
hero.place = brewery.room;
const afterCrew = game.state.clans.player.infamy;
run(35);
assert.equal(game.state.clans.player.infamy, afterCrew, 'all indoor clan members stop charges');
assert.equal(hqCampingNoticeVisit(game.state, 'missing'), null);
console.log('HQ camping indoor entry, trigger exclusion, decay, outdoor crew and warning visibility passed');
