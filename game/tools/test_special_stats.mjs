// Every war unit with a special gets a hover with numbers (Tim 2026-11-18: Loose the dogs showed no damage or stats).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPECIALS } from '../src/sim/special_cast.js';
import { specialNumbers, specialHover } from '../src/special_stats.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const F = data('data/frontier.json'), U = data('data/units.json');
const seen = new Set();
for (const [key, e] of Object.entries(F.war.units)) {
  const types = typeof e.type === 'string' ? [e.type] : Object.values(e.type || {});
  for (const t of types) {
    const u = U.types[t];
    assert.ok(u, `${key}: no unit type ${t}`);
    for (const [id, S] of Object.entries(SPECIALS)) {
      if (!S.has(u, { type: t })) continue;
      seen.add(id);
      const n = specialNumbers(id, u);
      assert.match(n, /\d/, `${t} ${id}: no numbers`);
      assert.doesNotMatch(n, /[%×°]/, `${t} ${id}: special characters`);
      assert.ok(specialHover(id, S.name, 'About.', u).startsWith(`${S.name}: About. `), `${t} ${id}: hover`);
    }
  }
}
for (const id of Object.keys(SPECIALS)) assert.ok(seen.has(id), `no war unit has ${id}`);
assert.match(specialNumbers('dogs', U.types.dog_handler), new RegExp(`${U.types.dog_handler.dogs.damage} damage`));
assert.equal(specialNumbers('dogs', {}), '');
console.log('special stats: ok');
