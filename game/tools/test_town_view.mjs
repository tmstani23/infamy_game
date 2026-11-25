// View a town (Tim 2026-11-25): only your own founded frontier towns can be viewed, rival towns and the capital cannot;
// the confirm and banner name the town; with no DOM the module is inert.
import assert from 'node:assert/strict';
import { viewableTown, confirmHtml, bannerHtml, createTownView } from '../src/town_view.js';
import { WATCH_BLOCKED } from '../src/city_watch.js';
const state = { frontier: { settlements: {
  a: { id: 'a', name: 'Kanaya', owner: 'player', x: 100, z: 200 },
  b: { id: 'b', name: 'Rival Town', owner: 'bot1', x: 300, z: 400 },
  c: { id: 'c', name: 'Capital', owner: 'player', capital: true, x: 0, z: 0 },
  d: { id: 'd', name: 'Site town', owner: 'player', site: 's9' },
  e: { id: 'e', name: 'Lost', owner: 'player', site: 'nowhere' },
} } };
const sites = { s9: { id: 's9', x: 50, z: 60 } };
assert.deepEqual(viewableTown(state, sites, 'player', 'a'), { id: 'a', name: 'Kanaya', x: 100, z: 200 });
assert.equal(viewableTown(state, sites, 'player', 'b'), null, 'rival town: no view');
assert.deepEqual(viewableTown(state, sites, 'bot1', 'b')?.x, 300, 'each player views its own towns');
assert.equal(viewableTown(state, sites, 'player', 'c'), null, 'the capital is Watch the city, not View');
assert.deepEqual(viewableTown(state, sites, 'player', 'd'), { id: 'd', name: 'Site town', x: 50, z: 60 }, 'spot from its site');
assert.equal(viewableTown(state, sites, 'player', 'e'), null, 'no known spot');
assert.equal(viewableTown(state, sites, null, 'a'), null);
assert.match(confirmHtml('A<b>'), /View A&lt;b&gt;\?/);
assert.match(confirmHtml('X'), /data-tv="view"[^]*data-tv="cancel"/);
assert.match(bannerHtml('Kanaya'), /Viewing Kanaya[^]*Return to hero/);
assert.ok(WATCH_BLOCKED.has('order') && WATCH_BLOCKED.has('deployment'));
const off = createTownView({ game: { state }, view: {}, heroId: 'h' });
assert.equal(off.isOn(), false); assert.equal(off.start('a'), false);
assert.deepEqual(off.filterCommands([{ type: 'order' }]), [{ type: 'order' }]);
console.log('town view ok');
