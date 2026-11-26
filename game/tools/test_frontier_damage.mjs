// Frontier effect (2026-11-24): every hero hits frontierDamage times harder on the island (place world); city unchanged; crew unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const units = data('data/units.json'), F = units.types.hero.frontierDamage;
assert.ok(F > 1, 'hero frontierDamage set');
const g = createGame({ district:data('data/waterfront.json'), catalog:data('data/art.json'), cutouts:data('art/cutouts.json'),
  interiors:data('data/interiors.json'), parts:data('data/interior_parts.json'), recipes:data('data/room_recipes.json'), units });
g.clans.addClan('player', { faction:'yakuza', kind:'yakuza' }); g.clans.addClan('rival', { faction:'shinobi', kind:'ninja', bot:true });
const spawn = (type, model, owner) => g.state.entities[g.spawn(type, model, 0, 0, { owner, holdFire:true, order:{kind:'stop'} })];
for (const [h, name] of [[spawn('hero', 'ronin', 'player'), 'player hero'], [spawn('hero', 'ninja_leader', 'rival'), 'rival hero']]) {
  const city = g.stats.damage(h);
  h.place = 'world';
  assert.equal(g.stats.damage(h), city * F, `${name} hits ${F}x on the island`);
  assert.ok(g.stats.snapshot(h).rows.find(r => r.key === 'normalHit').sources.some(s => s.startsWith('Frontier')), `${name} sheet names Frontier`);
  h.place = 'street';
  assert.equal(g.stats.damage(h), city, `${name} unchanged in the city`);
}
const t = spawn('thug', units.types.thug.sprite, 'player'), td = g.stats.damage(t);
t.place = 'world'; assert.equal(g.stats.damage(t), td, 'crew unchanged on the island');
// rival bots wear what they win (2026-11-24); the player's gear still goes to the bag
{
  const I = g.itemServices, rv = g.state.clans.rival.inventory, pv = g.state.clans.player.inventory;
  I.grant('rival', 'honed_weapon'); assert.equal(rv.equipment.weapon, 'honed_weapon', 'bot wears a shop weapon into an empty slot');
  I.grant('rival', 'heirloom_yakuza'); assert.equal(rv.equipment.weapon, 'heirloom_yakuza', 'bot swaps up to an heirloom');
  assert.ok(rv.bag.includes('honed_weapon'), 'old weapon goes to the bag');
  I.grant('rival', 'honed_weapon'); assert.equal(rv.equipment.weapon, 'heirloom_yakuza', 'never swaps down');
  I.grant('rival', 'wolf_fang_charm'); assert.equal(rv.equipment.accessory, 'wolf_fang_charm');
  I.grant('player', 'wolf_fang_charm'); assert.ok(!pv.equipment.accessory && pv.bag.includes('wolf_fang_charm'), 'player equips by hand');
}
console.log('test_frontier_damage ok');
