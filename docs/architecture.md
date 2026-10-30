# Architecture

How the game is built today (2026-10-17). Short on purpose: details live in the linked docs.

- Build plan and conventions: [tech_plan.md](tech_plan.md)
- 3D rooms: [interiors_spec.md](interiors_spec.md), [room_generator_plan.md](room_generator_plan.md)
- Crew, hiring, orders: [crew_recruiting_plan.md](crew_recruiting_plan.md)
- Deployment membership, sectors and transfer commands: [deployment_sector_plan.md](deployment_sector_plan.md) (`sim/sectors.js`, `sim/deployment.js`, `sim/assignments.js`, `sim/deployment_rally.js`, `sim/shinobi_assignments.js`, `sim/diversion.js`, `sim/deployment_ai.js`, `deployment_map_geometry.js`; 1A–5B and 2026-10-27 follow-on built, thirty final checks passed, visual review pending).
- Fighting: [combat_spec.md](combat_spec.md)
- Canonical gameplay stats/read-only hero snapshots: `sim/stats.js`; character UI `character_panel.js`/`.css`, passive icons in `action_bar.js`. [Stat/page ownership](combat_spec.md#hero-character-page-authorized-2026-10-27) (built 2026-10-27, visual review pending).
- Focused deployment UI: `deployment_panel.js` reexports `deployment_panel_ui.js`; `stable_list.js` preserves roster nodes, `grouped_crew.js` groups command pips, and `sim/deployment_feedback.js` owns authoritative result receipts. [Playtest build record](deployment_sector_plan.md#playtest-phase-6-final-integration-passed-2026-10-27).
- Target visibility memory: `target_memory.js`; [controls](controls.md#approved-playtest-controls-2026-10-27). Shell/settings: `game_shell.js`, `fullscreen.js`, `audio_settings.js`, `game_settings.js`; [capability/audio owner](tech_plan.md#approved-shellaudio-playtest-fixes-2026-10-27).
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
| Movement, camera, zoom, day/night | [tech_plan.md](tech_plan.md), [controls.md](controls.md) | `state.night` and the `time` command in `sim/game.js`, `sim/geometry.js`, `input.js`, `render/view.js`, `render/iso.js`, `render/shading.js` |
| District map and outdoor art | [tech_plan.md](tech_plan.md), [buildings.md](buildings.md), [business_raids_plan.md](business_raids_plan.md) 0a | `data/port_town.json` (default; `?district=waterfront` loads the old map), `sim/geometry.js` (`shapeBlockers`), `data/art.json`, `render/scenery.js`, `tools/cut_environment.py` |
| Interiors and room generator | [interiors_spec.md](interiors_spec.md), [room_generator_plan.md](room_generator_plan.md) | `sim/interiors.js`, `sim/generate.js`, `render/interior3d.js`, `data/interiors.json`, `data/interior_parts.json`, `data/room_recipes.json`, `game/tools/test_rooms.mjs` |
| Crew hiring and orders | [crew_recruiting_plan.md](crew_recruiting_plan.md) | `sim/clans.js`, `sim/nav.js`, `sim/game.js` (orders: follow, move, station, attack, attackmove, heal, stop), `hire_menu.js`, `crew_input.js`, `data/units.json`, `game/tools/test_crew.mjs` |
| Combat | [combat_spec.md](combat_spec.md) | `sim/game.js` (attacks, damage, knockouts, downed and execute, carry-off), `sim/clans.js` (clinic), `crew_input.js` (attack, attack-move), `clinic_menu.js`, `render/health.js`, `render/hitfx.js`, `game/tools/test_combat.mjs`, `test_downed.mjs`, `test_clinic_townsfolk.mjs` |
| Abilities and effects | [combat_spec.md](combat_spec.md) F, G | `sim/game.js` (abilities), `action_bar.js`, `render/abilityfx.js`, `render/vfx.js`, `render/bloom.js`, `game/tools/test_abilities.mjs` |
| Heat | [combat_spec.md](combat_spec.md) H | `state.clans[x].heat` and `state.heatGains` in `sim/game.js`, `heat_badge.js` |
| Fog of war and minimap | [combat_spec.md](combat_spec.md) H | `sim/vision.js`, `render/fog.js`, `minimap.js`, `game/tools/test_vision.mjs` |
| Police | [police_spec.md](police_spec.md) | `sim/police.js`, `data/police.json`, `police_menu.js`, `game/tools/test_police.mjs` |
| Building panel | [buildings.md](buildings.md) | `building_panel.js`, `data/buildings.json` |
| Businesses and attacks | [business_raids_plan.md](business_raids_plan.md) | `sim/businesses.js` (`canBuy`, dawn payouts via `police.payoutShare`, house guards with `e.guard` = business id, attacks in `state.attacks`, mode `'raid'` with warmup/hold and `a.lantern`; `mayEnter`, `crewSlots`, `canKnock`; lantern knock-down `attack.knock {by, start, hp, x, z}`), `clan.lanterns`, crew order kind `enter` `{room, k, n}` (turned into station by `enterStep`), `render/sound.js` `bell()`, `business` command, `sim/clans.js` (`crewOf`, `clan.color`), `render/banners.js` (banners and War Lanterns), `building_panel.js`, `settings.json` `businesses`, `game/tools/test_businesses.mjs`, `test_attack.mjs` |
| Ninja clan | [ninja_clan_plan.md](ninja_clan_plan.md) | `sim/stealth.js`, `sim/contracts.js`, `contract_menu.js`, `units.json` `models.ninja_leader`, `rules.stealth`, `rules.contracts`, village in `data/port_town.json`, `?test=ninja` |
| Territory and season | [territory.md](territory.md) | `sim/territory.js`, `game_map.js`, `settings.json` `territory` / `season`, `quarters` in `data/port_town.json`, `game/tools/test_territory.mjs` |
| Rival bot clan | [rival_bot_plan.md](rival_bot_plan.md) | `sim/bot.js` (`createBot`, `BOT_DEFAULTS`), `data/bots.json`, hideouts in `data/port_town.json` + `rules.hideout`, `game/tools/test_bot.mjs`, `test_bot_game.mjs` |
| Alerts | [business_raids_plan.md](business_raids_plan.md) | `state.news` (sim; kinds `bossDown`, `bossArrested`, `lanternDown`, `crewOut`, `backRoom`), `main.js` `callout()`, `#callout` in `index.html` |
| Test switches | [test_params.md](test_params.md) | `test_params.js` (single source, `DEV`) |
| Crew command strip | [controls.md](controls.md) | `crew_bar.js` (buttons above the crew pips on the action bar) |
| Unit frames | [controls.md](controls.md) | `unit_frames.js`: your frame and the target frame, small squares top middle under the alerts, each movable/resizable with its lock (`hud_layout.js`; Reset layout restores them). Target = lone left-clicked unit, else the hero's attack target, else the Tab target; border colour by side. `game/tools/test_unit_frames.mjs` |
| HUD layout | [controls.md](controls.md) | `hud_layout.js`, `data/ui_layout.json` (saved by a PUT to `server.mjs`, localStorage fallback) |
| Weapon glow | [combat_spec.md](combat_spec.md) G | `data/weapon_glow.json`, the exporter's glow pass, `render/shading.js` `weaponGlowMaterial`, `render/characters.js` glow quad |
| Night bandits | [combat_spec.md](combat_spec.md) I | `sim/bandits.js`, `data/bandits.json`, `game/tools/test_bandits.mjs` |
| Townsfolk | [civilians_plan.md](civilians_plan.md) | `sim/civilians.js`, `data/civilians.json`, `pois` in `data/port_town.json`, `game/tools/test_civilians.mjs` |
| Selection panel and portraits | [controls.md](controls.md) | `selection_panel.js`, `portraits.js`, `game/tools/test_selection_panel.mjs`, `test_picking.mjs` |
| Sprites and art pipeline | [art_direction.md](art_direction.md), [cast_tracker.md](cast_tracker.md) | `tools/export_sprites.mjs`, `look_tests/sprite_render_test.html`, `render/characters.js` |

Test URL parameters (`?fog=0`, `?rival=den` ...) are listed in [test_params.md](test_params.md).

Code paths are under `game/src/` unless they start with `data/` (`game/data/`), `game/tools/` or `tools/`.

## Modules

**Sim** (`game/src/sim`, plain JS, runs in Node, no three.js or DOM)

| File | Job |
|---|---|
| `combat.js` | Targeting, engage, swings, rng, heat, `hit` and carry-off (split from game.js 2026-10-29). |
| `crew_orders.js` | Follow offsets, `giveOrder`, `crewOut` / `crewGoal`, `moveTo`. |
| `crew_step.js` | `crewStep`: crew duties, pursuit, indoor duty and doors each tick. |
| `loot_execute.js` | Looting bodies, executes, `botExecute`. |
| `hero_abilities.js` | Hero Q/E/R/F, the dash and buff upkeep. |
| `util.js` | Shared sim helpers (`alive`, `dist`, `secs`, `noticeFor`) used across the sim (phase 7, 2026-10-29). |
| `settings.js` | `applySettings` lays `data/settings.json` over the detail data files in `createGame`. |
| `game.js` | **Split 2026-10-29 (1,815 to 894 lines):** keeps setup, shared predicates (`hostile` / `fair` / `sees` / `wild` / `cop` / `civ`), doors (`DOOR_RADIUS` exported), spawn, `step` and the API. Each split module exports `createX({deps})`, wired in game.js before its return; game.js keeps one-line forwarders under the old names. Older detail: |
| `game.js` | The rules: state, `step(commands)`, movement, doors, orders, combat, knockouts, looting (`loot` command `{id, type: 'loot', target, units?}`, `startLoot`/`lootStep`; ryo to the looter's clan), Rally heal ticks (buff `heal`/`ticksLeft`/`nextHeal`, `healBuffs()`). `TICK_RATE = 20`. Day/night clock `state.clock` `{day, left}`; `state.dawn` / `state.dusk` fire on automatic flips and on N (Node tests run without settings, so no clock). Test rival thugs at the den only with `?enemies=N` (`main.js`). |
| `clans.js` | Clan money, businesses held, crew cap, hire queue and prices (numbers from `units.json`). |
| `nav.js` | Pathfinding for crew: walk grid from blockers, A*, then straightened paths. Each room has its own grid (`ROOM_NAV`; `navOf` in `game.js` picks the grid). |
| `police.js` | Police clan: tiers by heat, patrols and hunts, arrests, jail, bribes. Every spawn starts fresh (`mind.fresh`): it patrols until it sees the hero. Officers come out of the HQ or any box (`boxes`). |
| `geometry.js` | Shared math: camera angle, pixels per unit, 8 directions, footprints, placing scenery from the map. |
| `interiors.js` | Lays out 3D rooms on the grid (walls, props, blockers, checks). Rooms sit far off the street map in the same world. |
| `generate.js` | Room generator: building type + seed gives a room in the same format as `interiors.json`. |
| `vision.js` | Fog of war: each clan's explored and visible areas, `canSee`; sight 18 for units, 10 for owned businesses. |
| `civilians.js` | Townsfolk: trips between map spots, day/night schedule, fear and fleeing, witnesses. |
| `territory.js` | Territory and the season: areas around owned businesses (`ownerAt`, `inOwn`), home-turf bonuses, quarters held, intruder alerts, season score and end (`territory.md`). |
| `stealth.js` | Hidden status for ninja: detection ranges (dark, lit, indoors, running), reveal, lantern snuffs, back windows. |
| `contracts.js` | Shinobi contract board: jobs each dawn, fair draw, progress, pay and Renown. |
| `bandits.js` | Night bandits: walk in from the map edges, wander, fight back when hit, leave a lootable body with ryo. |

**Render** (`game/src/render`, three.js, reads state, never changes it)

| File | Job |
|---|---|
| `draw_order.js` | Draw order for the street: cached sort of static scenery, only moving things re-sorted each frame (`game/tools/test_draw_sort.mjs`). `main.js` keeps a lean previous-tick snapshot for smoothing. |
| `hq_fire.js` | Animated flames on a raided HQ. |
| `view.js` | Foot ring colours per unit category. Owns the scene, camera (follows the hero; arrow keys pan it, Home snaps back; screen-only, not game state), zoom, day/night; draws the state each frame. |
| `scenery.js` | Ground blend and the painted building/prop cut-outs on invisible footprint boxes; draw order sorting. |
| `characters.js` | 8-direction sprite sheets for units, weapon glow quad; `dispose()` frees units that leave the map. `INDOOR_SIZE` sets the indoor draw scale (now 1). |
| `fog.js` | Draws the fog of war (`?fog=0` turns it off). |
| `interior3d.js` | Builds real 3D rooms (walls, floors, furniture) from the sim's room layout. |
| `shading.js` | Shared shaders: night grade, lantern lights, see-through cutaway, interior materials. |
| `iso.js` | The fixed isometric camera as three.js vectors. |
| `abilityfx.js` | Ability effects (dash after-images, seals, rings, lanterns), buff auras, bandit coin burst. |
| `abilityfx_assets.js` | Shared ability-effect geometries, palettes, outline shader and lantern textures (split from abilityfx.js 2026-10-29; Kuroda and Shakedown effects live in `kurodafx.js` / `shakedownfx.js`). |
| `vfx.js` | Shared effect pieces: sparkles, glints, embers, petals. |
| `bloom.js` | Bloom on effects only. |
| `hitfx.js` | Damage numbers, hit flash, slash trails, sparks, screen shake. |
| `health.js` | Health bars over every unit. |
| `sound.js` | Combat sounds. |

**Input and HUD** (`game/src`, browser only, they only send commands)

| File | Job |
|---|---|
| `main.js` | Wires everything together and runs the loop above. |
| `news_callouts.js` | `createNewsCallouts`: per-tick `state.news` callouts and pings (split from main.js 2026-10-29). |
| `top_bar.js` | `createTopBar`: Rally and Unstuck buttons, jail banner, heat/ryo badges, season score (split from main.js). Both are created before the loop; `.update()` runs each frame. |
| `input.js` | Keyboard to commands (WASD hero move) and view keys. |
| `crew_input.js` | RTS mouse control: select, right-click move/attack/follow, attack-move. Selection is screen-only. |
| `hire_menu.js` | Teahouse hire panel and the crew HUD line; sends `hire` commands. |
| `action_bar.js` | Hero health, ability slots and cooldowns, buffs, crew pips (click a name to select, double-click to jump the camera). |
| `building_panel.js` | Panel for a clicked building (data from `data/buildings.json`). |
| `police_menu.js` | Bribe and bail menus. |
| `hud_layout.js` | Movable, resizable HUD panels (saved in `data/ui_layout.json`). |
| `selection_panel.js` | Panel for the selected crew or townsperson, above the action bar. |
| `portraits.js` | Portraits for the panels. |
| `clinic_menu.js` | Clinic menu: heal and revive (below the minimap, like the hire menu). |
| `heat_badge.js` | Heat badge and heat notices. |
| `ryo_badge.js` | Ryo and ryo gains (`state.ryoGains`); the top-left line now shows crew only. |
| `minimap.js` | Minimap: move the view, send or station crew. |
| `contract_menu.js` | Contract board menu (`#contracts`) at the village shrine. |
| `game_map.js` | Full game map (M): territory, businesses, police, units, quarters and the season score; the game keeps running. |
| `fps.js` | FPS readout (P). |

**Other**

- `game/index.html`: page, HUD elements, the controls panel (? key), three.js import map (pinned version from a CDN).
- `game/server.mjs`: tiny static web server (run by `start_game.bat`); also saves the HUD layout on PUT.
- `game/tools/`: Node checks (`test_crew`, `test_combat`, `test_rooms`, `test_abilities`, `test_health_bars`, `test_downed`, `test_civilians`, `test_selection_panel`, `test_clinic_townsfolk`, `test_picking`, `test_bandits`, `test_vision`, `test_police`, `test_indoor_orders`, `test_port_town`, `test_settings`, `test_businesses`, `test_attack`, `test_building_panel`, `test_raid`, `test_defend`, `test_unit_frames`, `test_bot`, `test_bot_game`, `test_territory`, `test_clinic_unhit`, `test_crew_lock`, `test_knock_target`, `test_ninja`, `test_ninja_bot`, all `.mjs`; 30 in all) and the room preview page `rooms.html`.

## Data files (`game/data`)

| File | Holds |
|---|---|
| `port_town.json` | The default district map (2x port town, 2026-10-19): `bounds`, ground zones, `blockShapes` minus `walkShapes` (water, canal; turned into walls by `geometry.shapeBlockers`), buildings and props (`flip` mirrors one), doors, spawns, which room each building opens into, townsfolk spots (`pois`), map `edges` and district `noPoliceAreas` (the forest ring). The weight map follows the district bounds; the street camera pan is clamped to the bounds (indoors still 45 from the hero, `render/view.js`). |
| `waterfront.json` | The old smaller district (`?district=waterfront`). |
| `art.json` | Art catalog: sizes, footprints and scale for every sprite and cut-out, so art can be swapped without code changes. |
| `units.json` | Unit stats and clan rules (start ryo, cap, prices, HP, regen, downed and clinic rules). |
| `civilians.json` | Townsfolk types and tuning. |
| `bandits.json` | Night bandit rules (caps, `lootSeconds`) and ryo per type. |
| `police.json` | Police tiers and rules. |
| `settings.json` | Game settings (2026-10-19): townsfolk, bandits, police officers per tier, jail, bribe, heat, costs, crew cap, `dayNight`. Overrides the detail files; later a settings menu and the multiplayer host's choices. |
| `buildings.json` | Building panel info. |
| `ui_layout.json` | Saved HUD layout. |
| `weapon_glow.json` | Weapon glow colours and strength per character. |
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

## Map presentation lifecycle (2026-10-29)

`presentation_mode.js` coordinates map/world presentation in `main.js` without pausing simulation. Map-open frames retain sim/AI/audio/news/commands but skip world rendering/bloom, animation/particles/nameplates, camera-pan/fog GPU work, small minimap and hidden action-bar paints. Transient FX are cleared through existing bounded pools; scene resources stay allocated. World events/interpolation snapshots are skipped while hidden. Close resynchronizes snapshot/fog to current sim state, avoiding stale FX replay and delayed ownership celebrations.

`map_raster.js` shares terrain per game through a WeakMap, reuses typed shading/territory buffers and tracks dirty cells to skip unchanged uploads. Deployment overlay keeps one honeycomb/border canvas, rasterizes ripple at 8 Hz and invalidates on size/zoom/selection/presence; markers retain normal map rate. Contacts are observed every sim tick even with the map closed; detailed roster snapshots are lazy. UI updates cache at 10 Hz with immediate selection/feedback changes, stable text and no hidden duplicate-roster paints. Ping queues expire and cap at 64. Transfer/selection rules are unchanged.

DEV diagnostic `window.infamy.mapPerformance()` exposes mode, opens/closes, world/map frame counts and times, raster draws/cell paints/times/buffer bytes/pings, overlay paints/cache bytes, portrait count and renderer geometry/texture counts. These counters distinguish presentation work/resource counts from actual browser RAM. [Reported Node checks, microbenchmark limits and pending manual checklist](playtest_followup_plan.md#1-map-performance-first). No live FPS/memory/visual sign-off is claimed.

## Phase 8 section 1 real-time loop checkpoint (2026-10-29)

`fixed_step_clock.js` bounds 20 Hz catch-up to ten steps/frame and one-second elapsed input, discards excess whole ticks while preserving fractional interpolation, and pauses without accumulating debt. DEV diagnostics expose `.clock` in `infamy.mapPerformance()`. Simulation event observation remains per tick; UI painting runs once/frame. Heat/ryo observers queue tick events without repeated zero-tick-frame playback; score refresh uses elapsed intervals. Map room lookup/crew buckets are cached, snapshots/Deployment refresh at 2 Hz with immediate input/receipt invalidation, and big-map idle canvas work is skipped. [Focused check coverage, deliberate extreme-stall limit and pending manual validation](playtest_followup_plan.md#1-real-time-sim--mapdeployment-lag-do-first).

Section 1 zone-selection follow-up (2026-10-29): invalidate/coalesce click-chain paints to the next frame; hover tooltip changes no longer repaint the map. Heavy honeycomb bitmap is independent of selection/time, with a cheap opacity pulse and separate selected border; zoom/size/presence still invalidate its one bounded canvas. Zone tabs/summary use cancelable 900 ms selection flashes. AI behavior is unchanged. [Focused checks, startup profiling limits and pending browser confirmation](playtest_followup_plan.md#1-real-time-sim--mapdeployment-lag-do-first).
