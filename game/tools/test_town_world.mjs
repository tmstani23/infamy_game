// Frontier E5: a founded town is drawn from its record, and its economy runs the same whether or
// not its chunks are loaded (cost follows what is active, never how many towns exist).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { placePiece } from '../src/sim/geometry.js';
import { drawableTowns, townSignature, townProps } from '../src/town_props.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const frontier = data('data/frontier.json'), catalog = data('data/art.json'), cutouts = data('art/cutouts.json');
const options = () => ({ district: data('data/port_town.json'), catalog, cutouts,
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier });

// every art name in townArt is a real building cutout
for (const [type, art] of Object.entries(frontier.townArt)) {
  if (type.startsWith('_')) continue;
  // zone:<letter> keys draw zoned cells (housing/farm/work), not buildings
  if (type.startsWith('zone:')) assert.ok(frontier.townArt._zones[type.slice(5)], `${type} is a zone`);
  else assert.ok(frontier.buildings[type] || frontier.war?.buildings?.[type] || type === 'war_banner', `${type} is a town or war camp building`);
  assert.ok(placePiece({ name: art, x: 0, z: 0, flip: false }, catalog, cutouts), `${type} -> ${art} has art`);
}

function game(heroAt) {
  const g = createGame(options());
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 1000 } });
  const hero = g.state.entities[m.heroId];
  Object.assign(hero, { x: heroAt[0], z: heroAt[1], place: 'world' });
  const w = g.frontier.world;
  w.addTown({ id: 'tw', name: 'T', region: null, owner: 'player', x: 3000, z: 3000, site: null, traits: { soil: 2, water: 2, defense: 2, nodes: { forest: 2 } },
    pop: 6, stock: { food: 80, timber: 200, stone: 30 }, buildings: [{ type: 'town_hall', cell: 0 }, { type: 'farm', cell: 1 }, { type: 'lumber_camp', cell: 2 }] });
  return { g, hero, w };
}

// drawing: dirt -> construction site -> built
{
  const { g, w } = game([3000, 3000]);
  const t = w.settlement('tw'), snap = () => drawableTowns(structuredClone(g.state.frontier), 'player');
  // queue a stockade through the command path and watch it go from dirt to frame to building
  const hero = Object.values(g.state.entities).find(e => e.type === 'hero');
  g.step([{ id: hero.id, type: 'frontier', action: 'queue', settlement: 'tw', building: 'stockade' }]);
  let props = townProps(snap(), frontier.townArt, frontier.townLights);
  assert.ok(props.filter(p => p.art === 'stone_lantern').length >= 4, 'lanterns beside the finished buildings');
  assert.deepEqual(props.filter(p => !p.dirt && p.art !== 'stone_lantern' && p.art !== frontier.townLights.automatic.art).map(p => [p.art, p.opacity]), [['manor', 1], ['haystack', 1], ['sawmill', 1]]);
  // ground patches and crop rows are dirt decals too; a project footprint's key ends in :dirt
  const footprint = p => p.dirt && p.key.endsWith(':dirt');
  assert.equal(props.filter(footprint).length, 1, 'the unbuilt project is a dirt footprint');
  const sig0 = townSignature(snap());
  g.step([{ id: hero.id, type: 'frontier', action: 'authorize', project: t.projects[0].id }]);
  let sawFrame = false, sig1 = sig0;
  for (let i = 0; i < 20 * 400 && t.projects.length; i++) {
    g.step([]);
    if (t.projects[0]?.progress > 0 && !sawFrame) { sawFrame = true; props = townProps(snap(), frontier.townArt); assert.ok(props.some(p => p.key.includes(':frame') && (frontier.townArt._buildPhases || ['house_construction_1', 'house_construction_2']).includes(p.art)), 'work done = construction-site frame (Tim 2026-11-05)'); sig1 = townSignature(snap()); }
  }
  assert.ok(sawFrame && t.projects.length === 0, 'the stockade got built');
  props = townProps(snap(), frontier.townArt);
  assert.ok(props.some(p => p.art === frontier.townArt.stockade && p.opacity === 1) && !props.some(footprint), 'finished = normal');
  assert.notEqual(sig0, sig1); assert.notEqual(sig1, townSignature(snap()));
  const [x0, z0] = [t.x, t.z], hall = props.find(p => p.art === 'manor');
  assert.deepEqual([hall.x, hall.z], [x0, z0], 'town hall stands on the spot');
}

// economy: same numbers with the hero in the town and far away; chunks follow the hero only
{
  const run = heroAt => { const { g } = game(heroAt); g.areas.update(Object.values(g.state.entities)); const at = g.areas.activeIds().length;
    for (let i = 0; i < 20 * 120; i++) g.step([]); g.areas.update(Object.values(g.state.entities));
    return { stock: structuredClone(g.frontier.world.settlement('tw').stock), pop: g.frontier.world.settlement('tw').pop, ids: g.areas.activeIds(), econ: g.state.frontier.econTick, at }; };
  const near = run([3000, 3000]), away = run([9000, 6500]);
  assert.deepEqual(near.stock, away.stock, 'same stock with or without chunks loaded');
  assert.equal(near.pop, away.pop); assert.equal(near.econ, away.econ);
  const townChunk = `${Math.floor(3000 / 250)}`;
  assert.ok(near.ids.length > 0 && away.ids.length > 0);
  assert.notDeepEqual(near.ids, away.ids, 'walking away unloads the town\'s chunks');
}
console.log('test_town_world: ok');
