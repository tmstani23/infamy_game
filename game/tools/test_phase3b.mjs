// Selected command scope, indoor/raid behavior and execution protection. Node only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { createCrewInput } from '../src/crew_input.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function setup(indoors = false, raid = false) {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'), units: data('data/units.json') });
  g.clans.addClan('player'); g.clans.addClan('rival');
  const business = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
  const room = g.rooms.find(r => r.name === business.room);
  const place = indoors ? room.name : 'street', x = indoors ? room.spawn.x : -6, z = indoors ? room.spawn.z : 1;
  const hero = g.spawn('hero', 'ronin', x, z, { owner: 'player', place, hp: 1e5, maxHp: 1e5 });
  const spawn = (owner, dx, order) => g.spawn('thug', 'thug', x + dx, z, { owner, place, hp: 1e5, maxHp: 1e5, order });
  const a = spawn('player', -.5, { kind: 'follow', target: hero });
  const b = spawn('player', -1, { kind: 'stop' });
  const foe = spawn('rival', .9, { kind: 'stop' });
  const other = spawn('rival', 2, { kind: 'stop' });
  if (raid) {
    business.owner = 'player';
    g.state.attacks[business.id] = { room: place, phase: 'hold', mode: 'raid', clan: 'rival', defender: 'player', business: business.id,
      away: 0, hold: { x: x + 100, z, r: .1 }, holdLeft: 9999 };
  }
  return { g, S: g.state.entities, hero, a, b, foe, other, room };
}
const events = globalThis.addEventListener, doc = globalThis.document;
try {
  {
    const { g, S, hero, a, b, foe } = setup();
    g.step([{ id: hero, type: 'attack', target: foe, assist: true }]);
    assert.equal(S[a].order.kind, 'follow', 'missing selected IDs never means all crew');
    g.step([{ id: hero, type: 'attack', target: foe, assist: true, units: [foe, hero] }]);
    assert.equal(S[a].order.kind, 'follow'); assert.equal(S[b].order.kind, 'stop', 'invalid selections cannot recruit crew');
  }
  for (const [indoors, raid] of [[false, false], [true, false], [true, true]]) {
    const { g, S, hero, a, b, foe, other, room } = setup(indoors, raid), handlers = {}, queue = [];
    globalThis.addEventListener = (k, fn) => (handlers[k] ||= []).push(fn);
    globalThis.document = { body: { style: {} } };
    const view = { setSelected() {}, buildingAt: () => null,
      unitToScreen: (x, z) => ({ x: x * 100, y: z * 100 }), screenToGround: (x, y) => ({ x: x / 100, z: y / 100 }) };
    const input = createCrewInput({ game: g, view, heroId: hero, send: c => queue.push(c), box: { style: {} } });
    const flush = () => g.step(queue.splice(0));
    const click = (id, ctrlKey = false) => {
      const p = view.unitToScreen(S[id].x, S[id].z);
      for (const fn of handlers.mousedown) fn({ button: 2, ctrlKey, clientX: p.x, clientY: p.y, target: { closest: () => null } });
    };
    input.select([a]); click(foe); flush();
    assert.equal(S[a].order.target, foe); assert.equal(S[b].order.kind, 'stop', 'unselected crew ignores hero attacks, including indoors/raids');
    // Switching groups preserves the former group's target while the new group attacks another.
    input.select([b]); click(other); flush();
    assert.equal(S[a].order.target, foe); assert.equal(S[a].order.assist, undefined);
    // Stop is deliberately passive until explicitly ordered; Ctrl is an explicit crew order.
    click(other, true); flush(); assert.equal(S[b].order.target, other);
    assert.equal(S[a].order.target, foe, 'Ctrl attack touches selected crew only');
    input.select([]); click(other, true); assert.equal(queue.length, 0, 'empty Ctrl attack never falls back to hero or all crew');
    input.followMe(); assert.equal(queue.length, 0, 'unselected crew receives no follow command');
    input.select([b]); input.followMe(); flush(); assert.equal(S[b].order.target, hero);
    assert.equal(S[a].order.target, foe, 'follow command leaves unselected attack in place');
    const indoor = g.spawn('thug', 'thug', room.spawn.x, room.spawn.z, { owner: 'player', place: room.name, order: { kind: 'stop' } });
    input.select([b]); input.crewAttack();
    assert.deepEqual(queue.find(c => c.type === 'order').units, [b], 'T commands only selected crew indoors and outdoors');
    flush(); assert.equal(S[indoor].order.kind, 'stop', 'unselected garrison is untouched');
    // A forged broadcast cannot pull indoor crew out either.
    if (!indoors) { g.step([{ id: hero, type: 'order', units: [indoor], kind: 'attack', target: foe, broadcast: true }]); assert.equal(S[indoor].order.kind, 'stop'); }

    // Start a fresh execution with standing enemies in melee range.
    const down = g.spawn('thug', 'thug', S[hero].x + .4, S[hero].z, { owner: 'rival', place: S[hero].place, hp: 0, downed: true });
    g.step([{ id: hero, type: 'execute', target: down }]);
    const execution = S[hero].execute, began = execution.start;
    assert.ok(Number.isFinite(began));
    input.select([a]); click(other); flush();
    assert.equal(S[hero].execute, execution); assert.equal(execution.start, began);
    assert.equal(S[hero].attackTarget, undefined); assert.equal(S[hero].swing, undefined);
    assert.equal(S[a].order.target, other, 'right-click during execution attacks with selected crew only');
    const left = { button: 0, clientX: -10000, clientY: -10000, target: { closest: () => null } };
    handlers.mousedown.forEach(fn => fn(left)); handlers.mouseup.forEach(fn => fn(left)); flush();
    input.tab(); flush(); assert.equal(S[hero].execute, execution, 'Tab and left selection preserve the channel');
    g.step([{ id: hero, type: 'order', units: [a], kind: 'move', x: S[a].x - 1, z: S[a].z },
      { id: hero, type: 'stopattack', units: [a] }, { id: hero, type: 'execute', target: down }]);
    assert.equal(S[hero].execute, execution, 'crew move, stopattack and repeated execute never reset the channel');
    input.select([]); click(other); flush(); assert.equal(S[hero].execute, execution);
    assert.equal(S[hero].attackTarget, undefined, 'empty selected attack never queues a hero attack');
    const loot = g.spawn('thug', 'thug', S[hero].x - 2, S[hero].z, { owner: 'rival', place: S[hero].place, dead: true, loot: 50 });
    g.step([{ id: hero, type: 'loot', target: loot, units: [] }, { id: hero, type: 'loot', target: loot }]);
    assert.equal(S[hero].execute, execution, 'empty Ctrl-loot and hero loot never replace execution');
    assert.equal(S[hero].lootTarget, undefined);
    // Explicit empty crew operations cannot fall back to the hero.
    g.step([{ id: hero, type: 'execute', target: down, units: [] }, { id: hero, type: 'ability', key: 'Q', x: S[hero].x + 2, z: S[hero].z }]);
    assert.equal(S[hero].execute, execution);
    let heroHits = 0;
    for (let i = 0; i < 90 && !S[down].dead; i++) { flush(); heroHits += g.state.hits.filter(h => h.a === hero && h.t !== down).length; }
    assert.ok(S[down].dead, 'execution completes through all selection/attack commands');
    assert.equal(heroHits, 0, 'hero never switches to attacking the selected enemy');
    Object.assign(S[down], { dead: false, downed: true, hp: 0, downedAt: g.state.tick });
    g.step([{ id: hero, type: 'execute', target: down }]); input.cancelAction(); flush();
    assert.equal(S[hero].execute, undefined, 'Escape cancel command interrupts execution');
    g.step([{ id: hero, type: 'execute', target: down }]);
    g.step([{ id: hero, type: 'move', right: 1, down: 0 }]);
    assert.equal(S[hero].execute, undefined, 'hero movement still interrupts execution');
  }
  console.log('3B selected attack/follow scope, outdoor-only T, group order preservation and protected execution outdoors/indoors/raids ok');
} finally { globalThis.addEventListener = events; globalThis.document = doc; }
