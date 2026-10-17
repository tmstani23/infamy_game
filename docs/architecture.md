# Architecture

How the game is built today (2026-10-16). Short on purpose: details live in the linked docs.

- Build plan and conventions: [tech_plan.md](tech_plan.md)
- 3D rooms: [interiors_spec.md](interiors_spec.md), [room_generator_plan.md](room_generator_plan.md)
- Crew, hiring, orders: [crew_recruiting_plan.md](crew_recruiting_plan.md)
- Fighting: [combat_spec.md](combat_spec.md)
- Keys: [controls.md](controls.md)

## The one rule

The **sim** owns all game state and every rule. Players and bots change the game only by sending the same **command messages** (`move`, `use`, `hire`, `order`). The screen only reads the state and draws it; nothing gameplay-relevant is decided in the browser. This is what lets a Colyseus server run the same sim later for multiplayer, with the game still fully playable single-player against bots.

## How the pieces talk

```
 game/data/*.json ─────────────┐ (loaded once at start)
                               v
 keyboard/mouse ─> input ─> commands ─> SIM (game/src/sim) ─> state
 (input.js, crew_input.js,      ^        20 ticks per second     │
  hire_menu.js)                 │                                │ read only
                  bots ─────────┘                                v
                                       RENDER (game/src/render) draws every frame,
                                       sliding units between the last two ticks
```

Multiplayer later: the sim box moves to the server; browsers send commands up and get state back. Nothing else changes.

## Main loop (`game/src/main.js`)

1. Load all JSON in `game/data` plus `game/art/cutouts.json`.
2. `createGame()` builds the sim; clans and units are spawned (the player's hero, plus stand-in rival thugs at the den until the bot clan exists).
3. `createView()` builds the three.js scene from the sim's scenery, rooms and doors.
4. Every frame: add elapsed time; while a full tick (1/20 s) has built up, copy the state as `prev` and call `game.step(commands)` with the hero's move command plus any queued clicks and keys. Then `view.render(state, prev, alpha)` draws, blending positions between `prev` and `state` so movement looks smooth at any frame rate.

## Features: where the docs and code are

| Feature | Spec doc | Main code |
|---|---|---|
| Movement, camera, zoom, day/night | [tech_plan.md](tech_plan.md), [controls.md](controls.md) | `sim/game.js`, `sim/geometry.js`, `input.js`, `render/view.js`, `render/iso.js`, `render/shading.js` |
| District map and outdoor art | [tech_plan.md](tech_plan.md) | `data/waterfront.json`, `data/art.json`, `render/scenery.js`, `tools/cut_environment.py` |
| Interiors and room generator | [interiors_spec.md](interiors_spec.md), [room_generator_plan.md](room_generator_plan.md) | `sim/interiors.js`, `sim/generate.js`, `render/interior3d.js`, `data/interiors.json`, `data/interior_parts.json`, `data/room_recipes.json`, `game/tools/test_rooms.mjs` |
| Crew hiring and orders | [crew_recruiting_plan.md](crew_recruiting_plan.md) | `sim/clans.js`, `sim/nav.js`, `sim/game.js` (orders), `hire_menu.js`, `crew_input.js`, `data/units.json`, `game/tools/test_crew.mjs` |
| Combat | [combat_spec.md](combat_spec.md) | `sim/game.js` (attacks, damage, knockouts), `crew_input.js` (attack, attack-move), `render/characters.js` (health bars), `game/tools/test_combat.mjs` |
| Sprites and art pipeline | [art_direction.md](art_direction.md), [cast_tracker.md](cast_tracker.md) | `tools/export_sprites.mjs`, `look_tests/sprite_render_test.html`, `render/characters.js` |

Code paths are under `game/src/` unless they start with `data/` (`game/data/`), `game/tools/` or `tools/`.

## Modules

**Sim** (`game/src/sim`, plain JS, runs in Node, no three.js or DOM)

| File | Job |
|---|---|
| `game.js` | The rules: state, `step(commands)`, movement, doors, orders, combat, knockouts. `TICK_RATE = 20`. |
| `clans.js` | Clan money, businesses held, crew cap, hire queue and prices (numbers from `units.json`). |
| `nav.js` | Street pathfinding for crew: walk grid from blockers, A*, then straightened paths. |
| `geometry.js` | Shared math: camera angle, pixels per unit, 8 directions, footprints, placing scenery from the map. |
| `interiors.js` | Lays out 3D rooms on the grid (walls, props, blockers, checks). Rooms sit far off the street map in the same world. |
| `generate.js` | Room generator: building type + seed gives a room in the same format as `interiors.json`. |

**Render** (`game/src/render`, three.js, reads state, never changes it)

| File | Job |
|---|---|
| `view.js` | Owns the scene, camera (follows the hero; arrow keys pan it, Home snaps back; screen-only, not game state), zoom, day/night; draws the state each frame. |
| `scenery.js` | Ground blend and the painted building/prop cut-outs on invisible footprint boxes; draw order sorting. |
| `characters.js` | 8-direction sprite sheets for units, health bars. |
| `interior3d.js` | Builds real 3D rooms (walls, floors, furniture) from the sim's room layout. |
| `shading.js` | Shared shaders: night grade, lantern lights, see-through cutaway, interior materials. |
| `iso.js` | The fixed isometric camera as three.js vectors. |

**Input and HUD** (`game/src`, browser only, they only send commands)

| File | Job |
|---|---|
| `main.js` | Wires everything together and runs the loop above. |
| `input.js` | Keyboard to commands (WASD hero move) and view keys. |
| `crew_input.js` | RTS mouse control: select, right-click move/attack/follow, attack-move. Selection is screen-only. |
| `hire_menu.js` | Teahouse hire panel and the ryo / crew HUD line; sends `hire` commands. |

**Other**

- `game/index.html`: page, HUD elements, three.js import map (pinned version from a CDN).
- `game/server.mjs`: tiny static web server (run by `start_game.bat`).
- `game/tools/`: Node checks of the sim (`test_crew.mjs`, `test_combat.mjs`, `test_rooms.mjs`) and the room preview page `rooms.html`.

## Data files (`game/data`)

| File | Holds |
|---|---|
| `waterfront.json` | The district map: ground zones, buildings, props, doors, spawns, which room each building opens into. |
| `art.json` | Art catalog: sizes, footprints and scale for every sprite and cut-out, so art can be swapped without code changes. |
| `units.json` | Unit stats and clan rules (start ryo, cap, prices, HP, regen). |
| `interiors.json` | Hand-made rooms (the approved teahouse). |
| `interior_parts.json` | Room parts, materials and placement rules. |
| `room_recipes.json` | Generator recipes per building type and Tim's picked seeds. |

## Outdoors and indoors

Both live in one world with the same coordinates and the same sim rules, so crew, fights and later raids behave the same inside and out.

- **Outdoors:** buildings and props are painted 2D cut-outs (cut from art sheets into `game/art`) standing on invisible footprint boxes that the sim uses for collision. Buildings turn see-through when the hero is behind them.
- **Indoors:** rooms are real 3D geometry on a 1-unit grid, placed far off the street map. Pressing Space at a door moves the hero there. Sprites are depth-tested against the 3D furniture.
- Characters are always 2D sprite sheets rendered from 3D models at the same fixed camera angle.

## Asset pipeline (short)

Concept image (Gemini) -> 3D model (Tencent Hunyuan) -> rig and animations (Mixamo) -> sprite sheets via `tools/export_sprites.mjs` (8 directions, weapons from `assets/models/items` baked in) -> `assets/sprites`, which the game loads directly. Environment sheets are cut by `tools/cut_environment.py`; interior textures by `tools/make_interior_textures.py`. Full details: [art_direction.md](art_direction.md), [cast_tracker.md](cast_tracker.md), and the README.
