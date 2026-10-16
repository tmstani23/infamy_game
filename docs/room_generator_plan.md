# Room generator plan

Status: built 2026-10-16 in phases (Tim said go the same day). Each step is ticked below when it is done and synced to Tim's folder, so a fresh session can pick up from here. It follows the rules in `docs/interiors_spec.md`.

## Progress

- [x] 1. Inner walls and zones (done 2026-10-16: `inner` and `zones` in room data, checked in `sim/interiors.js`, drawn by `buildInnerWall` in `render/interior3d.js`, documented in the spec; the teahouse has none, so the game is unchanged)
- [x] 2. Recipes and den/warehouse prop models (done 2026-10-16: `game/data/room_recipes.json` for all three types; 3D models in `render/interior3d.js` and entries in `interior_parts.json`; gambling mat texture unwarped by `tools/make_interior_textures.py`; checked in a test room, not yet used by the game)
- [x] 3. Generator, checks and Node tests (done 2026-10-16: `game/src/sim/generate.js` `generateRoom(type, seed, recipes, parts)`; walkway flood-fill on a quarter-cell grid; `node game/tools/test_rooms.mjs` passes 100/100 seeds for all three types, about 2 ms a room)
- [x] 4. Preview page, then Tim picks seeds (Tim picked 2026-10-16: teahouse 2, 6, 11; den 4, 8, 12; warehouse 2, 5, 12, saved as `picked` in `room_recipes.json`. Page: `game/tools/rooms.html`, open at http://localhost:8137/game/tools/rooms.html while the game runs; `index.html?room=gambling_den&seed=3` starts inside a generated room.)
- [x] 5. Den and warehouse use generated rooms; old painted wall pieces removed (done 2026-10-16: waterfront den = gambling_den seed 4, warehouse = seed 2; the teahouse stays the hand-made one Tim approved. The painted-room code is gone from `sim/interiors.js`, `render/scenery.js`, `render/shading.js` and `view.js`; the old wall PNGs in `game/art/interior/` are no longer used)

Next: nothing planned. Possible follow-ups: put the other picked seeds on new buildings as the district grows, more props or texture sets per type for variety, and brighten the warehouse if Tim finds it too dark.

## What it does

- **In:** a building type (`teahouse`, `gambling_den`, `warehouse`, ...), a size, and a seed number.
- **Out:** a room in the same format as `game/data/interiors.json`, which the game already draws, plus a list of problems (an empty list means it passed).
- The same seed always gives the same room, so a building keeps its interior. Each building type gets about 3 good seeds to start.
- It is plain code with no three.js (`game/src/sim/generate.js`), so the multiplayer server can run it too.

## Recipes: one per building type

A new data file, `game/data/room_recipes.json`, describes each type without code:

```json
"gambling_den": {
  "size": { "min": [12, 10], "max": [18, 14] },
  "floor": "tatami",
  "walls": { "fill": ["red", "red", "plaster"], "windows": [0, 1] },
  "door": ["doorway"],
  "back_room": { "depth": [4, 6], "props": ["cash_box", "tansu"] },
  "props": [
    { "type": "gambling_mat", "count": [2, 3], "with": "zabuton x4" },
    { "type": "counter", "count": 1, "rule": "wall" },
    { "type": "andon", "count": [2, 4], "place": "corners" },
    { "type": "red_lantern", "count": [2, 4], "place": "over furniture" },
    { "type": "hibachi", "count": [0, 1] }
  ]
}
```

Counts are ranges, and the seed picks a value in each range. Changing a recipe changes every room of that type, with no code changes.

## Keeping the look

The generator only decides layout: sizes, bay types, doors and which props go where. How walls, wood, floors and lanterns look comes from the shared drawing code and materials ("Look rules" in `docs/interiors_spec.md`), so generated rooms look like the teahouse with no extra work. Recipes cannot add beams or tall front posts, because those pieces do not exist in the parts list.

## Steps for one room

1. **Size:** pick even width and depth inside the recipe's range.
2. **Walls:** fill each back-wall bay from the recipe's mix and add 0 or 1 windows per wall. Front walls stay low.
3. **Door:** pick a back-wall bay away from the corners, and mark the 2 x 2.5 cells in front of it as kept clear.
4. **Back room (if the recipe has one):** split off the far end with an inner wall cut low like the front walls, with one doorway bay. Raids use it as the "hold the back room" target, and its loot props go there.
5. **Props, biggest first:** wall pieces (alcove, counter, shelves), then the main furniture with its cushions, then lamps in corners, lanterns over furniture, and small things on surfaces (a tea set on every tea table, a cash box in the back room). Each prop tries random free spots that follow its rule, and is skipped after 30 failed tries.
6. **Walkway check:** flood-fill the floor cells from the door. Every table, mat, counter and the back room's doorway must be reachable, with paths at least 1 cell wide so the crew can follow. If not, drop the last prop and retry.
7. **Final check:** run the same checks the game runs on load (overlaps, door clear, hanging props, things on surfaces). A room that fails is thrown away and the next seed is tried.

## What the game needs added

- **Inner walls:** the spec and renderer grow one feature, a partition wall along x or z with bay types and a doorway, drawn low like the front walls. The sim adds it to the blockers like the outer walls.
- **Zones:** each room lists named areas (`main`, `back_room`) as cell rectangles. Raids, guard stations and loot spots read these instead of guessing.
- **Picking a room:** buildings in the district file get `"interior": { "type": "gambling_den", "seed": 2 }`. A hand-made room in `interiors.json` still works and wins over a generated one.

## Seeing and choosing variations

- A small preview page (`game/tools/rooms.html`) shows a grid of generated rooms from above for any type, seed 1 to 12. You pick the ones you like, and their seeds go into the district file.
- `?room=gambling_den&seed=3` in the game URL puts the ronin straight into that room for a closer look.

## Order of work

1. Inner walls and zones in the spec, sim and renderer (needed for the den's back room).
2. Recipes for the teahouse, den and warehouse, plus 3D models for the den and warehouse props (gambling mat, counter, shelves, cash box, crates, barrels, sacks).
3. The generator and its checks, with tests that run in Node over 100 seeds per type.
4. The preview page. You pick 3 seeds per building.
5. Swap the old den and warehouse to generated rooms and remove the old painted wall pieces.

## Limits

- Rooms are rectangles split by straight inner walls, with no L-shapes or second floors yet. Stairs can be a prop that leads nowhere until upper floors exist.
- Variety comes from layout and prop choice, not new art. More variety later means more prop models or texture sets per building type.
