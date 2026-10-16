# Interiors spec

Status (2026-10-16): every room is built this way. The teahouse is hand-made in `game/data/interiors.json`; the den and warehouse come from the room generator (`docs/room_generator_plan.md`). The older painted wall-piece rooms are gone.

## Why 3D

The camera has one fixed angle, so if every wall and piece of furniture is a real 3D shape on a grid, nothing can come out slightly rotated. Painted cut-outs each carry their own drawing angle, which is what made the old tables, mats and screen look off. Interiors are therefore simple 3D shapes (boxes and turned profiles) painted with textures cut from the art sheets, under the same camera and lamp light as the street. Characters stay sprites; they get proper depth so they pass behind tables, screens and the low front walls. When the hero is hidden, a faint silhouette shows where he is.

## Grid and sizes

| Thing | Size |
|---|---|
| Cell | 1 world unit (the ronin is 2 tall, so a cell is about 85 cm) |
| Tatami mat | 2 x 1 cells, laid in 2 x 2 blocks turned a quarter in every other block |
| Wall bay | 2 cells long, framed by wooden posts |
| Wall height | 3.0 (back walls), 0.6 (front walls, cut so you can see in) |
| Door-height beam | 2.2 |
| Wall thickness | 0.2, standing just outside the floor |
| Positions | Any multiple of 0.5 cells |

All of these live in `game/data/interior_parts.json` under `wall`.

## Walls and doors

- The room's floor runs from (0, 0) to its size. North is the low-z wall and west the low-x wall; both are full height. South and east face the camera and are cut low.
- Each wall is a list of bay types, one per 2-cell bay: `plaster`, `window`, `shoji_door`, `doorway`, `planks`, `red`. A list shorter than the wall repeats. Front walls default to plain bays.
- The door is one door bay (`shoji_door` or `doorway`) in a back wall. The 2 x 2.5 cells in front of it must stay clear. Pressing E on the ring in front of it leaves the building.
- Room sides must be whole bays, so sizes are even numbers of cells.

## Inner walls and zones

- An inner wall splits a room: `"inner": [{ "along": "x", "at": 7, "door": 1 }]`. `along` is the direction it runs (`x` = from the west wall to the east wall at z = `at`; `z` = from north to south at x = `at`). It runs the whole width or depth, is cut low (0.6) like the front walls with the same wooden cap, and bay `door` is an open doorway with a low threshold. `fill` picks the bay type for the rest (default `plaster`).
- It blocks walking like the outer walls. The 2 x 2 cells around its doorway must stay clear, and nothing standing may cross it.
- Zones name areas of the room in cells: `"zones": [{ "name": "main", "rect": [0, 0, 12, 7] }, { "name": "back_room", "rect": [0, 7, 12, 10] }]` (`rect` = x0, z0, x1, z1). Raids, guard posts and loot spots read these. A room with no zones gets one `main` zone covering the floor.
- Hanging props may also hang within a cell of an inner wall.

## Ceiling and hanging things

- The ceiling is cut away like the front walls, so nothing is drawn above the rooms. Its height is the wall height (3.0).
- Hanging props (lanterns) hang at 1.95 on a thin cord that runs up to a small hook at ceiling height. That is head height, so they block walking and go over furniture or within a cell of a wall.

## Look rules (settled with Tim, 2026-10-16)

These live in the shared drawing code (`render/interior3d.js`, `render/shading.js`) and the shared materials in `data/interior_parts.json`, not in any room's data. Every room, hand-made or generated, gets them automatically, and a room file cannot turn them off.

- No ceiling, cross beams or tall posts on the near side. The front walls are cut low (0.6) with a wooden cap.
- All frames, posts, sills, base strips and caps use the wood grain cut from the plank tile (`timber`), running along each piece.
- Tatami borders are thin and muted brown, never black, and the seams are faint.
- Shading along wall bottoms and the floor edge is soft.
- Lanterns hang on a thin, light rope-coloured cord up to a small hook at ceiling height.
- Every tea table gets a tea set. This one is a generator rule (see `docs/room_generator_plan.md`), since props are placed per room.


Each prop has a footprint in cells (`size`, for the unturned prop: length along x, depth along z), an optional `solid` box that blocks walking, and a placement `rule`:

| Rule | Meaning | Placed with |
|---|---|---|
| `floor` | Stands anywhere on the floor | `"at": [x, z]` (footprint's corner), optional `"rot"`: 0, 90, 180 or 270 |
| `wall` | Back against a wall | `"wall": "west"`, `"at"`: cells along that wall |
| `ceiling` | Hangs from the ceiling over furniture or near a wall | `"at": [x, z]` |
| `top` | Stands on something with a `surface` (a table, the alcove) | `"at": [x, z]` inside that thing |

Floor props can also stand on a surface: if the centre of a prop lands on something with a `surface`, it sits on top of it (the vase in the alcove).

Current props: `tea_table` (2 x 3 with two cushions), `zabuton` (cushion), `tokonoma` (alcove, 4 x 1, wall), `byobu` (folding screen, 3 x 1), `andon` (floor lamp), `hibachi` (brazier), `red_lantern` (hanging), `tea_set` (top), `vase` (still a painted cut-out).

Den and warehouse props (2026-10-16): `gambling_mat` (4 x 4 with four cushions), `counter` (4 x 2, wall, room behind it for the keeper), `sake_shelf` (2 x 1, wall), `cash_box` and `tansu` (chest of drawers, 2 x 1, wall), both marked `loot`, `sake_keg`, `rice_sacks`, `crates`, `barrels` (2 x 2 stacks), `warehouse_shelves` (4 x 1, wall) and `dynamite_crate` (`loot`). The `cargo_door` bay is a heavy sliding plank door. A wall list can set `"near"` to give the low front walls the same fill as the far walls (red for the den, planks for the warehouse).

## Checks

`sim/interiors.js` checks every room when it loads and lists problems in the browser console: footprints outside the room or overlapping, a door that is not a door bay or is blocked, `top` props with nothing under them, hanging props in the open, walls that are not whole bays, props crossing an inner wall or blocking its doorway, and zones outside the room. A generator uses the same checks to throw away bad layouts.

## Room data

Rooms live in `game/data/interiors.json`. A 3D room has `"build": "3d"`:

```json
"teahouse": {
  "build": "3d", "size": [12, 10], "floor": "tatami",
  "walls": { "north": ["window", "plaster", "plaster", "shoji_door", "plaster", "window"],
             "west": ["plaster", "plaster", "plaster", "plaster", "window"] },
  "door": { "side": "north", "bay": 3 },
  "props": [
    { "type": "tokonoma", "wall": "west", "at": 1 },
    { "type": "tea_table", "at": [3, 3] },
    { "type": "tea_set", "at": [3.5, 4] },
    { "type": "red_lantern", "at": [3.5, 4] }
  ]
}
```

## Generating variations

`game/src/sim/generate.js` writes this same format, so generated rooms need no new drawing code. A building in the district file points at one with `"interior": { "type": "gambling_den", "seed": 4 }`; `"interior": "teahouse"` uses the hand-made room of that name. Recipes are in `game/data/room_recipes.json`, the preview is `game/tools/rooms.html`, and `node game/tools/test_rooms.mjs` checks 100 seeds per type. How it works:

1. Pick a size from the building type's range (even numbers).
2. Fill the back walls with bays from the type's list, then pick one door bay.
3. Place props by priority: wall pieces first (alcove, shelves, counter), then the main furniture (tables with cushions, gambling mats), then lamps in corners, then lanterns over tables, then small things on surfaces (a tea set on every tea table).
4. Run the checks. Retry anything that fails, and keep a walkway from the door to every table.
5. Use a seed, so the same building always gets the same room.

## Art

- `tools/make_interior_textures.py` cuts the textures from `textures1.png`, `interiors1.jpg`, `interiors2.jpg` and the tatami tile into `game/art/interior3d/`. To swap art, replace a PNG there or change its box in the script.
- `materials` in `interior_parts.json` sets each surface's texture, size on the wall (`tile`), colour (`tint`), brightening (`gain`), how much texture detail shows (`detail`) and self-light for paper and coals (`glow`).
- A new prop needs a data entry in `interior_parts.json` and a small shape function in `game/src/render/interior3d.js` (`MODELS`). A prop can instead name a painted `cutout` from `data/art.json`, as the vase does.
