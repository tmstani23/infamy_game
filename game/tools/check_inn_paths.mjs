// Focused clearance check for the hand-planned inn. Run with: node game/tools/check_inn_paths.mjs
import { readFileSync } from 'node:fs';
import { generateRoom } from '../src/sim/generate.js';
import { createNav, ROOM_NAV } from '../src/sim/nav.js';

const data = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url)));
const room = generateRoom('inn', 1, data('room_recipes.json'), data('interior_parts.json')).room;
const nav = createNav(room.blockers, {
  minX: room.origin.x, minZ: room.origin.z,
  maxX: room.origin.x + room.size[0], maxZ: room.origin.z + room.size[1],
}, { ...ROOM_NAV, pad: ROOM_NAV.pad * (room.template.characterScale || 1) });
const check = (label, x, z) => {
  const path = nav.findPath(room.spawn.x, room.spawn.z, x, z);
  if (!nav.free(x, z) || !path) failures.push(`${label} (${x.toFixed(1)},${z.toFixed(1)}; free=${nav.free(x, z)})`);
};
const failures = [...room.problems];
const cell = ROOM_NAV.cell;
const width = Math.round(room.size[0] / cell), height = Math.round(room.size[1] / cell);
const seen = new Uint8Array(width * height);
const startX = Math.floor((room.spawn.x - room.origin.x) / cell);
const startZ = Math.floor((room.spawn.z - room.origin.z) / cell);
const queue = [[startX, startZ]];
seen[startZ * width + startX] = 1;
for (let head = 0; head < queue.length; head++) {
  const [x, z] = queue[head];
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= width || nz >= height || seen[nz * width + nx]) continue;
    if (!nav.free(room.origin.x + (nx + 0.5) * cell, room.origin.z + (nz + 0.5) * cell)) continue;
    seen[nz * width + nx] = 1;
    queue.push([nx, nz]);
  }
}
for (const door of room.interiorDoors) {
  const offset = 0.9;
  if (door.rect.x1 - door.rect.x0 < door.rect.z1 - door.rect.z0) {
    check(`${door.id} west`, door.x - offset, door.z);
    check(`${door.id} east`, door.x + offset, door.z);
  } else {
    check(`${door.id} north`, door.x, door.z - offset);
    check(`${door.id} south`, door.x, door.z + offset);
  }
}
for (const zone of room.zones) {
  let free = 0, reached = 0;
  for (let z = Math.floor((zone.minZ - room.origin.z) / cell); z < Math.ceil((zone.maxZ - room.origin.z) / cell); z++)
    for (let x = Math.floor((zone.minX - room.origin.x) / cell); x < Math.ceil((zone.maxX - room.origin.x) / cell); x++) {
      if (x < 0 || z < 0 || x >= width || z >= height) continue;
      const px = room.origin.x + (x + 0.5) * cell, pz = room.origin.z + (z + 0.5) * cell;
      if (!nav.free(px, pz)) continue;
      free++;
      if (seen[z * width + x]) reached++;
    }
  if (!free || reached < free * 0.9)
    failures.push(`${zone.name}: only ${free ? Math.round(reached / free * 100) : 0}% of open floor reachable`);
}
if (failures.length) {
  console.error(`Inn clearance failed: ${failures.join('; ')}`);
  process.exitCode = 1;
} else console.log(`Inn seed 1: all ${room.interiorDoors.length} interior doorways and over 90% of each of ${room.zones.length} rooms reachable at ${ROOM_NAV.pad * (room.template.characterScale || 1)} world-unit padding.`);
