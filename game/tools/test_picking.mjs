// Checks mouse picking of units (src/crew_input.js bodyDistance) against a stand-in
// orthographic iso view: node game/tools/test_picking.mjs
import assert from 'node:assert/strict';
import { bodyDistance } from '../src/crew_input.js';

// iso-ish orthographic camera: 30 px per unit across, height lifts things 34 px per unit
const S = 30, H = 34, view = {
  project: (x, y, z) => ({ x: 600 + (x - z) * S, y: 400 + (x + z) * S * 0.5 - y * H }),
  unitToScreen(x, z) { return this.project(x, 0.9, z); },
  screenToGround(px, py) { const a = (px - 600) / S, b = (py - 400) / (S * 0.5); return { x: (a + b) / 2, z: (b - a) / 2 }; },
};
const e = { x: 3, z: 1 };
const feet = view.project(3, 0, 1), centre = view.unitToScreen(3, 1), head = view.project(3, 1.8, 1);
assert.ok(bodyDistance(view, e, centre.x, centre.y) < 1, 'centre');
assert.ok(bodyDistance(view, e, feet.x, feet.y) < 1, 'feet count');
assert.ok(bodyDistance(view, e, head.x, head.y) < 1, 'head counts');
// the old pick (a circle round the centre) missed the head of a unit this size
assert.ok(Math.hypot(head.x - centre.x, head.y - centre.y) > 18, 'head is far from the centre');
assert.ok(bodyDistance(view, e, centre.x + 40, centre.y) > 30, 'beside it does not count');
assert.ok(bodyDistance(view, e, head.x, head.y - 60) > 30, 'well above it does not count');
console.log('picking tests passed');
