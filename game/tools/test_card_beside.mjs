// Building card beside its menu (2026-11-20, src/card_beside.js): right of the menu, else left, else the right edge.
import assert from 'node:assert/strict';
import { besidePos, openMenu, MENU_IDS } from '../src/card_beside.js';

const view = { w: 1920, h: 1080 }, card = { w: 320, h: 300 };
// a centred war camp menu (690 wide): the card goes to its right, level with its top
assert.deepEqual(besidePos({ left: 615, right: 1305, top: 250 }, card, view), { left: 1315, top: 250 });
// no room on the right: to its left
assert.deepEqual(besidePos({ left: 900, right: 1700, top: 100 }, card, view), { left: 570, top: 100 });
// no room either side: against the right edge
assert.deepEqual(besidePos({ left: 100, right: 1700, top: 100 }, card, { w: 1800, h: 1080 }), { left: 1472, top: 100 });
// kept on screen at the bottom
assert.equal(besidePos({ left: 380, right: 720, top: 900 }, card, view).top, 1080 - 300 - 8);
// the open menu: the first shown one of the building menus
const els = { townwar: { hidden: false, offsetWidth: 600 }, warcamp: { hidden: true, offsetWidth: 0 } };
assert.equal(openMenu({ getElementById: id => els[id] || null }), els.townwar);
assert.equal(openMenu({ getElementById: () => null }), null);
assert.deepEqual(MENU_IDS, ['warcamp', 'townwar', 'garrisoncard']);
console.log('test_card_beside: ok');
