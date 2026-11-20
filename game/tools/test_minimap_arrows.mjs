// Minimap guide arrows (Tim 2026-11-20): edge arrow placement and direction.
import assert from 'node:assert/strict';
import { edgeArrow } from '../src/minimap_icons.js';
const size = 180, c = 90;
assert.equal(edgeArrow(100, 80, size), null, 'inside the box: no arrow');
assert.equal(edgeArrow(c + 79, c, size), null, 'just inside the inset');
const r = edgeArrow(c + 400, c, size);
assert.ok(Math.abs(r.u - (size - 10)) < 1e-9 && Math.abs(r.v - c) < 1e-9 && Math.abs(r.a) < 1e-9, 'right: on the right edge, pointing right');
const d = edgeArrow(c, c + 300, size);
assert.ok(Math.abs(d.v - (size - 10)) < 1e-9 && Math.abs(d.a - Math.PI / 2) < 1e-9, 'below: pointing down');
const diag = edgeArrow(c - 500, c - 250, size);   // up-left, mostly left
assert.ok(Math.abs(diag.u - 10) < 1e-9 && diag.v > 10 && diag.v < c, 'diagonal sits on the left edge');
assert.ok(Math.abs(diag.a - Math.atan2(-250, -500)) < 1e-9, 'diagonal points at the target');
// turned view: world north (-z) lands up and right, so a target far north gives an arrow up-right
const S = 0.7071, kk = 1, at = (x, z) => [c + (x - z) * S * kk, c + (x + z) * S * kk];
const n = edgeArrow(...at(0, -1000), size);
assert.ok(n.u > c && n.v < c, 'north shows up and to the right');
console.log('minimap arrows ok');
