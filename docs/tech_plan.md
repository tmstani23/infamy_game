# Tech plan

Status: **Settled** (Tim OK'd it 2026-10-15). Build steps 1 to 4 are done (2026-10-16); the scene in `game/` follows this layout.

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

## First build steps

1. Done (2026-10-15): split the scene into `sim/` and `render/`, district and catalog in JSON.
2. Done (2026-10-15): fixed-tick sim with interpolation, movement as commands.
3. Done (2026-10-16): doors and 3D interiors for the teahouse, warehouse and den.
4. Done (2026-10-16): recruit crew at the teahouse, follow and right-click orders, combat.
5. One rival bot clan, and the night raid on the den.
6. Then Colyseus: run `sim` on a server for a few friends.

## Interiors (2026-10-15)
Interiors are real 3D on a cell grid so every piece lines up with the camera; see `docs/interiors_spec.md`. Rooms are laid out by `sim/interiors.js` buildRoom3d and drawn by `render/interior3d.js`. The teahouse is hand-made (`data/interiors.json`); the den and warehouse are made by the room generator (`sim/generate.js`, `data/room_recipes.json`, plan in `docs/room_generator_plan.md`) from seeds Tim picked on 2026-10-16. The painted wall-piece rooms were removed.

## Approved shell/audio playtest fixes (2026-10-27)

Implemented/Node-adapter checked in Phase 5D (2026-10-27); [overall phases](deployment_sector_plan.md#playtest-fixes-follow-on-approved-2026-10-27-not-implemented).

- [x] **#1 — Implemented with capability limits:** Escape closes game UI without leaving fullscreen; verify browser capability before promising behavior.
- [x] **#11 — Implemented with capability limits:** investigate audio loudness; locally save Master/Effects/Mute settings, with menu extensible to general settings later.
- [x] **#18 — Implemented with capability limits:** suppress page text selection, native dragging and context menu on gameplay surfaces. Browser-owned AI/mini overlays may require browser settings and are not assumed controllable by game code.
- [x] Focused Node capability/settings-persistence/input checks passed as recorded below.
- [ ] Tim audio/fullscreen/interaction playtest.

Phase 5D checkpoint (2026-10-27, reported by Build coordinator): `fullscreen.js` requests `navigator.keyboard.lock(['Escape'])` on fullscreen entry, unlocks on exit and retains Alt+Enter. Only Escape is captured and normal events reach game UI. Unsupported/denied capture is disclosed in tooltip; the browser's long-Escape escape hatch cannot be overridden. Browser-owned AI overlays remain outside game control. Implementation was checked against [Chrome fullscreen guidance](https://developer.chrome.com/blog/better-full-screen-mode) and [Keyboard Lock documentation](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock); no browser capability test is claimed.

`audio_settings.js`/`game_settings.js` provide Settings modal with locally saved Master/Effects/Mute and Test sound. The prior fixed 0.6 master/eighteen-range rolloff was quiet. Initial master default one, Effects bus multiplier 1.5, radius twenty-four and compressor tame combined peaks; camera/place isolation remains. K/mute uses the same settings and immediately silences existing voices. Server serves correct Ogg/WAV MIME types.

`game_shell.js` suppresses context menu, text selection and native dragging on gameplay surfaces while allowing editable inputs; CSS disables game text selection. New `test_game_shell` passed supported/missing keyboard-lock adapters, exit unlock, game/editable input suppression, actual audio bus gains, preview/immediate mute and local persistence. Syntax checks passed; no browser tests. Phase 6 integration remains pending; no commit/push requested.

## HUD drag-release correction (2026-10-28)

Tim reported a target frame that kept dragging after mouse release, preventing locking. Frame handlers stopped mouseup bubbling before the old window handler; HUD now captures release before frame handlers. Drag/resize also ends on lock, window blur, missing-button move or reset. Personal layout remains untouched.

New `test_hud_drag` reproduces stopped mouseup using Node capture/bubble adapters and checks release/lock/resize/blur/reset/persistence. Build coordinator reports eight scripts passed: HUD drag, indoor stealth, Ninja, indoor crew, door pursuit, unit frames, target controls and hidden-contract bonus; modified-source syntax/diff checks clean. No browser/screenshots/manual visual approval claimed. Tim drag/lock retest remains pending.

Selection docking follow-up (2026-10-28): `selection_dock.js` reuses live selection DOM/state/handlers inside Deployment or standalone map, restores HUD parent/order/style on close, and disables HUD drag/locks only while docked without overwriting saved layout. Reported Node docking/HUD regressions passed; visual retest pending. [Current transfer/card behavior](deployment_sector_plan.md#playtest-follow-up-transfercardscleanup-2026-10-28).

Audio backlog (Tim, 2026-10-28; not implemented): prioritize stronger weapon-hit impacts (slashes are acceptable), distinctive ability effects, execution and generic use/interaction sounds. Suno Sounds was discussed as a candidate source only; no assets generated/downloaded or audio changes in this batch.
