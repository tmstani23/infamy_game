// Checks health bar fill and colour, and that every unit's max health matches units.json:
// node game/tools/test_health_bars.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { healthBar } from '../src/render/health.js';
import { createGame } from '../src/sim/game.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
close(healthBar(200, 200).frac, 1);
close(healthBar(50, 200).frac, 0.25);
close(healthBar(0, 200).frac, 0);
close(healthBar(-5, 200).frac, 0);
const green = healthBar(1, 1).color, dying = healthBar(1, 100).color, half = healthBar(1, 2).color;
assert.ok(green[1] > green[0] && green[1] > 0.6, 'full = green');
assert.ok(dying[0] > dying[1] * 3 && dying[0] < 0.5, 'nearly dead = dark red');
assert.ok(half[0] > 0.6 && half[1] > 0.4, 'half = yellow-orange');

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json');
const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units });
g.clans.addClan('player'); g.clans.addClan('kuroda', { bot: true });
const S = g.state.entities;
const ids = ['hero', 'thug', 'brute', 'swordsman'].map((t, i) => g.spawn(t, t === 'hero' ? 'ronin' : t, -6 + i, 1, { owner: 'player' }));
for (const id of ids) { assert.equal(S[id].maxHp, units.types[S[id].type].hp); assert.equal(S[id].hp, S[id].maxHp); }
// a fight: the bar fraction always equals the real health share
const foe = g.spawn('brute', 'brute', -6, 2.2, { owner: 'kuroda' });
for (let i = 0; i < 200; i++) {
  g.step();
  for (const e of Object.values(S)) if (e.maxHp) close(healthBar(e.hp, e.maxHp).frac, Math.max(0, e.hp) / e.maxHp);
}
assert.ok(S[foe] === undefined || S[foe].hp < S[foe].maxHp, 'foe took damage');
console.log('health bar tests passed');
