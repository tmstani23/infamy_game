// Quiet capital alerts on the island (2026-11-25): the captain's play-by-play stays hidden while the boss
// is out, big events show as "Back in the capital:", and watching the city shows everything as if home.
import assert from 'node:assert/strict';
import { createNewsCallouts } from '../src/news_callouts.js';

const hero = { owner: 'me', place: 'world' };
const state = { tick: 0, news: [], entities: { h: hero }, clans: { me: { name: 'Mine' }, foe: { name: 'Foes' } }, businesses: {}, deployment: { sectors: [] } };
let watch = false; const calls = [];
const ui = createNewsCallouts({ game: { state, vision: { canSee: () => true } }, heroId: 'h', presentation: { map: false }, callout: t => calls.push(t),
  minimap: { ping() {} }, gameMap: { ping() {} }, view: {}, watching: () => watch });
const run = news => { calls.length = 0; state.news = news; ui.update(); return [...calls]; };
const play = [{ kind: 'doorsOpen', raider: 'me', business: 'b' }, { kind: 'backRoom', state: 'contested', raider: 'me', defender: 'foe' }];

assert.deepEqual(run(play), [], 'captain play-by-play hidden on the island');
assert.deepEqual(run([{ kind: 'raidWon', raider: 'me', defender: 'foe', name: 'Sake Brewery' }]), ['Back in the capital: your clan successfully raided Foes\'s Sake Brewery!'], 'captain win shows');
assert.deepEqual(run([{ kind: 'lanternDown', raider: 'me', defender: 'foe' }]), ['Back in the capital: your War Lantern was destroyed'], 'captain raid failing shows');
assert.deepEqual(run([{ kind: 'businessAttack', clan: 'me', name: 'Sake Brewery', raider: 'foe' }]), ['Back in the capital: your Sake Brewery is under attack!'], 'rival raid on the city shows');
assert.deepEqual(run([{ kind: 'raidWon', raider: 'foe', defender: 'me', name: 'Sake Brewery' }]), ['Back in the capital: Foes successfully raided your Sake Brewery!'], 'losing a business shows');
assert.deepEqual(run([{ kind: 'raidWon', raider: 'foe', defender: 'other', name: 'Bath' }]), [], 'other clans\' raids stay quiet');

watch = true;
assert.equal(run(play).length, 2, 'watching the city shows the play-by-play');
assert.ok(!run([{ kind: 'raidWon', raider: 'me', defender: 'foe', name: 'Sake Brewery' }])[0].startsWith('Back in'), 'no Capital: prefix while watching');

watch = false; hero.place = 'street';
assert.deepEqual(run([play[0]]), ['The doors are open: get inside!'], 'home: shown as before');
console.log('Away callouts: captain play-by-play quiet on the island, big events and rival raids shown, watching shows all');
