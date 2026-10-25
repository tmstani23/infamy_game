import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function make(kind) {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
  g.clans.addClan('player', { kind }); g.clans.addClan('rival');
  const hero = g.spawn('hero', kind === 'ninja' ? 'ninja_leader' : 'ronin', -8, 1, { owner: 'player', holdFire: true });
  const type = kind === 'ninja' ? 'ninja' : 'thug', model = kind === 'ninja' ? 'ninja_grunt' : 'thug';
  const crew = [-7, -7.5].map((x, i) => g.spawn(type, model, x, 1 + i * .5, { owner: 'player', order: { kind: 'station', x, z: 1 + i * .5 } }));
  const target = g.spawn('thug', 'thug', -6, 1, { owner: 'rival', hp: 1, order: { kind: 'stop' } });
  return { g, hero, crew, target, S: g.state.entities };
}
for (const kind of ['yakuza', 'ninja']) {
  const { g, hero, crew, target, S } = make(kind);
  g.step([{ id: hero, type: 'order', units: crew, kind: 'attack', target, resume: true, broadcast: true, followOnDefeat: [crew[0]] }]);
  for (let i = 0; i < 100 && !S[target].downed; i++) g.step();
  assert.ok(S[target].downed); g.step();
  assert.equal(S[crew[0]].order.kind, 'move', 'selected T unit holds after defeat');
  assert.equal(S[crew[1]].order.kind, 'move', 'unselected T unit also holds after defeat');
  const second = make(kind);
  second.S[second.target].hp = 10000;
  const command = { id: second.hero, type: 'order', units: [second.crew[0]], kind: 'attack', target: second.target, resume: true, broadcast: true, followOnDefeat: true };
  second.g.step([command]);
  second.g.step([{ ...command, kind: 'resume' }]);
  assert.equal(second.S[second.crew[0]].order.kind, 'station', 'T cancellation still restores old orders');
  const direct = make(kind);
  direct.g.step([{ id: direct.hero, type: 'order', units: [direct.crew[0]], kind: 'attack', target: direct.target, followOnDefeat: true }]);
  for (let i = 0; i < 100 && !direct.S[direct.target].downed; i++) direct.g.step();
  direct.g.step();
  assert.equal(direct.S[direct.crew[0]].order.kind, 'move', 'selected direct attack holds after defeat');
  const assisted = make(kind);
  assisted.S[assisted.crew[0]].order = { kind: 'follow', target: assisted.hero, slot: 0 };
  assisted.g.step([{ id: assisted.hero, type: 'attack', target: assisted.target, assist: true, units: [assisted.crew[0]] }]);
  for (let i = 0; i < 100 && !assisted.S[assisted.target].downed; i++) assisted.g.step();
  assisted.g.step();
  assert.equal(assisted.S[assisted.crew[0]].order.kind, 'move', 'right-click/Tab assistance holds after defeat');
  assert.equal(assisted.S[assisted.crew[1]].order.kind, 'station', 'unselected crew do not inherit the hero attack');
}
console.log('All-clan attack completion: direct/T/assisted units hold after defeat; cancellation preserves old duties');
