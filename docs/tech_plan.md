# Tech plan

Status: **Settled** (Tim OK'd it 2026-10-15). Steps 1 and 2 are done: the scene in `game/` now follows this layout.

## Stack

- Latest three.js, 0.186.1 as of 2026-10-15, with ES modules, loaded from a CDN through an import map. Plain JavaScript with no build step.
- `start_game.bat` runs `game/server.mjs`, a tiny static server with no packages, and opens the browser. Browsers block textures loaded from `file://`, so the game needs this server.
- Later: the Colyseus server runs the same simulation code in Node.

## Folder and module layout

| Path | Job |
|---|---|
| `game/src/sim/` | Game rules and state only: entities, movement, collision, later combat and AI. No three.js and no DOM, so the Colyseus server can run it too. |
| `game/src/render/` | three.js only: camera, ground, sprites, lighting, draw order, see-through cutaway. It reads the state and never changes it. |
| `game/src/input.js` | Turns keys and mouse into commands such as `move {right, down}` and later `attack` or `order`. |
| `game/src/main.js` | The loop that wires them together. |
| `game/data/` | Districts and the art catalog as JSON, so they are data and not code. |
| `game/art/` | Cut-out buildings, props and ground tiles made by `tools/cut_environment.py`. |
| `server/` | Later: the Colyseus room that runs `sim/`. |

## Scene and camera

- A fixed orthographic camera with the same angle and scale as the sprite exporter: elevation atan(0.5), looking from the south-east, 53.3 screen px per world unit at zoom 1. Because they match, sprites, painted art and the ground all line up.
- World units: the ronin is 2 tall. x runs to the screen's lower right and z to its lower left.
- The camera follows the hero and snaps to whole pixels so the art stays crisp. The mouse wheel zooms between 0.45x and 1.6x.

## Buildings and props on block proxies

- `tools/cut_environment.py` cuts each sheet cell into a transparent PNG and records the art's left, right and bottom points in `cutouts.json`.
- Each building gets an invisible footprint box worked out from those points: the left, bottom and right corners of the art are the corners of the box. The box is used for walking, draw order and the see-through test.
- The art is drawn on a flat quad facing the camera, pinned so that its footprint sits on the box.
- The catalog entry for each piece can override its scale and footprint, and lists its painted lamps (light sources) and fires (animated flame layer).
- The sheets draw every item at the same cell size, so a tree comes out as big as a log pile. Real size lives in the catalog, never in the images. Each prop has its own scale, set so the art reads right next to the 2-unit ronin (for example pine tree 0.95, firewood 0.42, iron chest 0.3), plus a footprint in world units. A new sheet therefore needs only catalog numbers, with no image editing.

## Sprites and draw order

- Characters use the exported sheets: rows S, SW, W, NW, N, NE, E, SE, 160px cells at 12 fps. The row comes from the movement direction, and the frame is chosen in the shader.
- Draw order is a per-frame topological sort over footprint boxes: A is drawn before B if A lies behind B on x or z. Only pairs that overlap on screen are compared. About 150 objects costs nothing.
- See-through: when the hero's feet, waist or head land on opaque art of something drawn in front of him, a soft hole opens in it around him.

## Day and night, lighting

- One shader for all painted art. Day is a light grade. At night it darkens toward moonlight blue, adds the 24 lamps nearest the camera, and keeps warm painted pixels (lit windows, lanterns) glowing.
- Glow halos and flames are additive quads drawn just after the object they belong to. Rain, mist and wet reflections come later as layers on top.

## District data format

`game/data/waterfront.json`:

```json
{ "bounds": [-46, -40, 46, 48],
  "ground": [["paving", -36, -1, 36, 3, 1]],
  "blockers": [[-90, -90, -3, -23]],
  "buildings": [{ "art": "teahouse", "x": -8, "z": 9, "business": "teahouse" }],
  "props": [["lantern_post", -30, -1.4]],
  "spawns": { "hero": [-8, 1] } }
```

Ground is painted rectangles with soft edges, blended in the shader from tiled textures. A later in-browser map editor can save this same file.

## Update loop and entities

- `sim` runs at a fixed 20 ticks a second. Rendering runs every frame and interpolates between ticks.
- State is plain data: `entities: { id: { type, x, z, dir, anim, hp, owner } }` plus businesses and clan money. Input becomes commands, and only `sim` applies them.
- Single player runs `sim` in the browser. In multiplayer the Colyseus server runs the same `sim` and keeps the real state, clients send commands, and the state is synced back into the same render code. Nothing in `render/` changes.

## Keeping art swappable

- Each piece of art is named once in the catalog. Replace a PNG with one of the same name, or rerun the cutter on new sheets.
- Characters are named `<model>_<anim>.png`. A new export shows up in the game without code changes.
- Nothing in the code depends on how a picture looks, only on its footprint and catalog entry.

## What step 1 changed (done 2026-10-15)

- `hero.js` moved the ronin and drew him in one place. It is now a `sim` unit and a `render/characters.js` sprite.
- `district.js` and `art.js` became `data/waterfront.json` and `data/art.json`.
- Movement used to run every frame. It now runs on the fixed 20-tick loop, and the screen slides units smoothly between ticks.

## First build steps

1. Split the current scene into `sim/` and `render/`, and move the district and catalog into JSON. The game looks and plays the same afterward.
2. Fixed-tick sim with interpolation, and movement as commands.
3. Doors and interiors for the teahouse, warehouse and den, built from templates.
4. Recruit crew at the teahouse, then follow and right-click orders.
5. One rival bot clan, and the night raid on the den.
6. Then Colyseus: run `sim` on a server for a few friends.

## Interiors (2026-10-15)
Interiors are real 3D on a cell grid so every piece lines up with the camera; see `docs/interiors_spec.md`. Rooms are laid out by `sim/interiors.js` buildRoom3d and drawn by `render/interior3d.js`. The teahouse is hand-made (`data/interiors.json`); the den and warehouse are made by the room generator (`sim/generate.js`, `data/room_recipes.json`, plan in `docs/room_generator_plan.md`) from seeds Tim picked on 2026-10-16. The painted wall-piece rooms were removed.
