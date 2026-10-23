// Node-only checks for painted interior artwork and generated room placement.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildRoom3d } from '../src/sim/interiors.js';
import { generateRoom } from '../src/sim/generate.js';
import { placePiece } from '../src/sim/geometry.js';

const data = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const parts = data('interior_parts'), recipes = data('room_recipes'), art = data('art');
const cutouts = JSON.parse(readFileSync(new URL('../art/cutouts.json', import.meta.url)));
const plain = structuredClone(parts);
for (const def of Object.values(plain.props)) delete def.painted;

// Every generated type has one valid wall finish; ornamental bay art stays separate.
for (const type of Object.keys(recipes).filter(k => !k.startsWith('_'))) {
  const finish = parts.roomFinishes[type];
  assert.ok(parts.materials[finish], `${type}: missing wall finish`);
  const { room } = generateRoom(type, recipes[type].picked[0], recipes, parts);
  assert.equal(room.template.generated.type, type);
}

// Both wall orientations: the same collision/loot data, exactly one visual representation.
for (const [type, paintedWall] of [['tansu', 'west'], ['sake_shelf', 'north']]) {
  for (const wall of ['north', 'west']) {
    const template = {
      size: [12, 12], floor: 'tatami',
      walls: { north: ['plaster', 'plaster', 'plaster', 'plaster', 'shoji_door', 'plaster'] },
      door: { side: 'north', bay: 4 }, props: [{ type, wall, at: 2 }],
    };
    const room = buildRoom3d('art-test', template, parts, 300, 0, { quiet: true });
    const old = buildRoom3d('art-test', template, plain, 300, 0, { quiet: true });
    assert.deepEqual(room.problems, []);
    assert.deepEqual(room.blockers, old.blockers);
    assert.equal(room.props[0].def.loot, old.props[0].def.loot);
    assert.equal(room.pieces.length, wall === paintedWall ? 1 : 0);
    assert.equal(!!room.props[0].cutout, wall === paintedWall);
    for (const piece of room.pieces) {
      const placed = placePiece(piece, art, cutouts);
      assert.ok(placed && placed.depth && placed.indoor);
      assert.equal(placed.solid, null, 'room parts own collision, not the sprite catalog');
      assert.ok(existsSync(new URL(`../${placed.item.file}`, import.meta.url)));
      const blocker = room.blockers.at(-1);
      for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) assert.ok(Math.abs(placed.foot[key] - blocker[key]) < 1e-9);
    }
  }
}

// New floor/top cutouts preserve collisions, loot and lamp definitions, and keep 3D fallbacks.
for (const type of ['tea_set', 'cash_box', 'rice_sacks', 'sake_keg', 'andon', 'hibachi', 'counter']) {
  const def = parts.props[type];
  for (const rot of [0, 90]) {
    const props = def.rule === 'top'
      ? [{ type: 'tea_table', at: [2, 2] }, { type, at: [2.5, 3], rot }]
      : [def.rule === 'wall' ? { type, wall: rot ? 'west' : 'north', at: 2 } : { type, at: [2, 2], rot }];
    const template = { size: [12, 12], floor: 'tatami',
      walls: { north: ['plaster', 'plaster', 'plaster', 'plaster', 'shoji_door', 'plaster'] },
      door: { side: 'north', bay: 4 }, props };
    const room = buildRoom3d(type, template, parts, 300, 0, { quiet: true });
    const old = buildRoom3d(type, template, plain, 300, 0, { quiet: true });
    assert.deepEqual(room.problems, []);
    assert.deepEqual(room.blockers, old.blockers);
    const prop = room.props.at(-1);
    assert.equal(!!prop.cutout, def.painted.rotations.includes(rot));
    assert.deepEqual(prop.def.light, old.props.at(-1).def.light);
    assert.equal(prop.def.loot, old.props.at(-1).def.loot);
    if (type === 'tea_set') assert.equal(prop.y, parts.props.tea_table.surface);
    for (const piece of room.pieces) {
      const placed = placePiece(piece, art, cutouts);
      assert.ok(placed.roomProp && placed.depth);
      assert.equal(placed.solid, null);
      assert.ok(existsSync(new URL(`../${placed.item.file}`, import.meta.url)));
    }
  }
}

for (const type of ['tenements', 'bathhouse']) for (let seed = 1; seed <= 100; seed++) {
  const { room, problems } = generateRoom(type, seed, recipes, parts);
  assert.deepEqual(problems, [], `${type} ${seed}`);
  if (type === 'tenements') {
    const beds = room.props.filter(p => p.type === 'futon');
    assert.ok(beds.length >= 3);
    assert.ok(beds.every(p => p.rot === 0 && p.cutout === 'futon' && p.artAngle === -3));
    assert.equal(room.pieces.filter(p => p.name === 'futon' && p.angle === -3).length, beds.length);
  } else {
    const screens = room.props.filter(p => p.type === 'shoji_partition').sort((a, b) => a.rect.x0 - b.rect.x0);
    assert.ok(screens.length >= 3);
    assert.ok(screens.every(p => p.rect.z0 === screens[0].rect.z0 && p.rot === 0));
    assert.equal(screens[0].rect.x0, 0);
    for (let i = 1; i < screens.length; i++) assert.equal(screens[i].rect.x0, screens[i - 1].rect.x1);
    assert.ok(room.size[0] - screens.at(-1).rect.x1 >= 3);
    const washing = room.props.filter(p => p.type === 'bath_bucket_stool');
    assert.ok(washing.length >= 2 && washing.length <= 3);
    assert.equal(new Set(washing.map(p => p.rect.z0)).size, 1);
    assert.ok(washing.every(p => Math.abs(p.rect.z0 - screens[0].rect.z1 - 0.6) < 1e-6));
    const screenCenter = (screens[0].rect.x0 + screens.at(-1).rect.x1) / 2;
    const washCenter = (Math.min(...washing.map(p => p.rect.x0)) + Math.max(...washing.map(p => p.rect.x1))) / 2;
    assert.ok(Math.abs(washCenter - screenCenter) < 1e-6);
  }
}

// Lattice windows retain the same keep-clear rule as paper windows.
for (const type of ['shop', 'pawnshop', 'manor', 'customs_house']) {
  const { room, problems } = generateRoom(type, recipes[type].picked[0], recipes, parts);
  assert.deepEqual(problems, []);
  assert.ok(room.walls.some(w => w.bays.includes('lattice_window')));
  for (const p of room.props.filter(p => p.rule === 'wall')) {
    const side = p.rot === 0 ? 'north' : 'west';
    const wall = room.walls.find(w => w.side === side);
    const a = side === 'north' ? p.rect.x0 : p.rect.z0;
    const b = side === 'north' ? p.rect.x1 : p.rect.z1;
    for (let i = Math.floor(a / parts.wall.bay); i * parts.wall.bay < b; i++) assert.ok(!parts.bays[wall.bays[i]].window);
  }
}

// Approved office, shop, bath and training cutouts must resolve to real images.
const newProps = ['inspection_table', 'ledger_stack', 'records_shelf', 'customs_notice_board',
  'merchandise_shelf', 'pawn_display', 'soaking_tub', 'bath_bucket_stool',
  'towel_shelf', 'weapon_rack', 'practice_dummy', 'brewing_vat',
  'shop_dry_goods_shelf', 'shop_textile_shelf', 'pawn_valuables_display',
  'brewery_bottle_shelf', 'brewery_ceramic_shelf', 'manor_reception_table', 'manor_reception_chair',
  'manor_reception_chair_back',
  'manor_armor_display', 'manor_scroll_cabinet'];
for (const name of newProps) {
  assert.equal(parts.props[name].cutout, name);
  assert.ok(cutouts[`interior/${name}`], `${name}: missing cutout metadata`);
  const piece = placePiece({ name, x: 300, z: 0, indoor: true, roomProp: true, depth: true }, art, cutouts);
  assert.ok(piece?.depth && piece.solid === null);
  assert.ok(existsSync(new URL(`../${piece.item.file}`, import.meta.url)));
}

const tenements = generateRoom('tenements', 1, recipes, parts).room;
assert.equal(tenements.props.filter(p => p.type === 'futon').length, 6);
assert.equal(tenements.props.filter(p => p.type === 'shoji_partition').length, 4);
const bath = generateRoom('bathhouse', 1, recipes, parts).room;
assert.deepEqual(bath.blockers, buildRoom3d('bathhouse', bath.template, plain, 0, 0, { quiet: true }).blockers);
for (const name of ['soaking_tub', 'bath_bucket_stool', 'towel_shelf']) {
  const piece = bath.pieces.find(p => p.name === name);
  assert.deepEqual(piece.artAnchor, parts.props[name].painted.anchor);
  assert.deepEqual(placePiece(piece, art, cutouts).center, parts.props[name].painted.anchor);
}
assert.equal(bath.pieces.find(p => p.name === 'towel_shelf').shear, 0.16);
const alignedRun = (room, names, gap = 0) => {
  const row = room.props.filter(p => names.includes(p.type)).sort((a, b) => a.rect.x0 - b.rect.x0);
  assert.equal(row.length, names.length);
  assert.equal(new Set(row.map(p => p.rect.z0)).size, 1);
  for (let i = 1; i < row.length; i++) assert.ok(Math.abs(row[i].rect.x0 - row[i - 1].rect.x1 - gap) < 1e-6);
  return row;
};
const shopShelfTypes = ['merchandise_shelf', 'shop_dry_goods_shelf', 'shop_textile_shelf'];
for (let seed = 1; seed <= 100; seed++) {
  const { room: shop, problems } = generateRoom('shop', seed, recipes, parts);
  assert.deepEqual(problems, [], `shop ${seed}`);
  const shopShelves = shop.props.filter(p => shopShelfTypes.includes(p.type));
  assert.equal(shopShelves.length, 6, `shop ${seed}: missing shelf`);
  const shopRows = [...new Set(shopShelves.map(p => p.rect.z0))].sort((a, b) => a - b)
    .map(z => shopShelves.filter(p => p.rect.z0 === z).sort((a, b) => a.rect.x0 - b.rect.x0));
  assert.equal(shopRows.length, 2, `shop ${seed}: expected two rows`);
  for (const row of shopRows) {
    assert.equal(row.length, 3);
    assert.equal(new Set(row.map(p => p.type)).size, 3);
    for (let i = 1; i < row.length; i++) assert.ok(Math.abs(row[i].rect.x0 - row[i - 1].rect.x1) < 1e-6);
  }
  assert.deepEqual(shopRows[0].map(p => p.rect.x0), shopRows[1].map(p => p.rect.x0));
  assert.ok(shopRows[1][0].rect.z0 - shopRows[0][0].rect.z1 >= 2);
}
const pawnshop = generateRoom('pawnshop', 1, recipes, parts).room;
alignedRun(pawnshop, ['pawn_display', 'pawn_valuables_display', 'merchandise_shelf'], 0.5);
const brewery = generateRoom('sake_brewery', 1, recipes, parts).room;
alignedRun(brewery, ['brewery_bottle_shelf', 'brewery_ceramic_shelf'], 1);
assert.ok(!brewery.props.some(p => p.type === 'sake_shelf'));
for (let seed = 1; seed <= 100; seed++) {
  const { room, problems } = generateRoom('sake_brewery', seed, recipes, parts);
  assert.deepEqual(problems, [], `sake_brewery ${seed}`);
  const mainEnd = room.template.zones.find(z => z.name === 'main').rect[3];
  const kegs = room.props.filter(p => p.type === 'sake_keg' && p.rect.z1 <= mainEnd);
  const west = kegs.filter(p => p.rect.x0 < 2).sort((a, b) => a.rect.z0 - b.rect.z0);
  const east = kegs.filter(p => p.rect.x1 > room.size[0] - 2).sort((a, b) => a.rect.z0 - b.rect.z0);
  assert.equal(kegs.length, west.length + east.length, `sake_brewery ${seed}: loose keg`);
  for (const row of [west, east]) {
    assert.ok(row.length >= 2 && row.length <= 3, `sake_brewery ${seed}: incomplete side row`);
    assert.equal(new Set(row.map(p => p.rect.x0)).size, 1);
    for (let i = 1; i < row.length; i++) assert.ok(Math.abs(row[i].rect.z0 - row[i - 1].rect.z1 - 0.7) < 1e-6);
  }
}
const manor = generateRoom('manor', 1, recipes, parts).room;
for (const name of ['manor_reception_table', 'manor_reception_chair', 'manor_reception_chair_back', 'manor_armor_display', 'manor_scroll_cabinet'])
  assert.ok(manor.props.some(p => p.type === name), `manor missing ${name}`);
const receptionTable = manor.props.find(p => p.type === 'manor_reception_table');
const farChair = manor.props.find(p => p.type === 'manor_reception_chair');
const nearChair = manor.props.find(p => p.type === 'manor_reception_chair_back');
assert.ok(Math.abs(farChair.rect.z1 - receptionTable.rect.z0) < 1e-6);
assert.ok(Math.abs(nearChair.rect.z0 - receptionTable.rect.z1) < 1e-6);
assert.ok(Math.abs(farChair.cx - receptionTable.cx) < 1e-6);
assert.ok(Math.abs(nearChair.cx - receptionTable.cx) < 1e-6);
assert.equal(manor.props.filter(p => p.type === 'zabuton').length, 0);
const customs = generateRoom('customs_house', 1, recipes, parts).room;
for (const name of ['inspection_table', 'ledger_stack', 'records_shelf', 'customs_notice_board'])
  assert.ok(customs.props.some(p => p.type === name), `customs house missing ${name}`);
assert.equal(customs.props.filter(p => p.type === 'inspection_table').length, 2);
assert.ok(!customs.props.some(p => p.type === 'counter'));
assert.ok(customs.props.filter(p => p.type === 'tansu').every(p => p.rect.z0 >= customs.size[1] - 6));
assert.ok(customs.props.filter(p => ['crates', 'rice_sacks', 'barrels'].includes(p.type)).length <= 3);
const dojo = generateRoom('dojo', 13, recipes, parts).room;
for (const name of ['weapon_rack', 'practice_dummy']) assert.ok(dojo.props.some(p => p.type === name));
assert.ok(!dojo.props.some(p => ['crates', 'rice_sacks', 'barrels', 'dynamite_crate'].includes(p.type)));

// Surface decorations must survive the generator's relocation pass and never add blockers.
for (const type of ['teahouse', 'manor']) for (let seed = 1; seed <= 100; seed++) {
  const { room, template, problems } = generateRoom(type, seed, recipes, parts);
  assert.deepEqual(problems, [], `${type} ${seed}`);
  const alcoves = room.props.filter(p => p.type === 'tokonoma');
  const vases = room.props.filter(p => p.type === 'vase');
  assert.equal(vases.length, alcoves.length);
  for (const vase of vases) {
    assert.equal(vase.stands, false);
    assert.equal(vase.y, parts.props.tokonoma.surface);
    assert.ok(alcoves.some(a => vase.cx >= a.rect.x0 && vase.cx <= a.rect.x1 && vase.cz >= a.rect.z0 && vase.cz <= a.rect.z1));
    assert.ok(room.pieces.some(p => p.name === 'vase' && p.lift === vase.y));
  }
  const withoutVases = { ...template, props: template.props.filter(p => p.type !== 'vase') };
  assert.deepEqual(room.blockers, buildRoom3d(type, withoutVases, parts, 0, 0, { quiet: true }).blockers);
}

for (const [type, seed] of [['gambling_den', 4], ['manor', 1]]) {
  const { room, problems } = generateRoom(type, seed, recipes, parts);
  assert.deepEqual(problems, []);
  assert.ok(room.walls.some(w => !w.low && w.bays.includes('red_art')), `${type}: dragon panel absent`);
}
for (const material of Object.values(parts.materials)) {
  assert.ok(existsSync(new URL(`../art/interior3d/${material.file}.png`, import.meta.url)), material.file);
}
console.log('Painted interiors: orientations, collision/loot/light preservation, art files, window clearance, and 600 furnished layouts passed.');
