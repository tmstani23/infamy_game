# Art direction

## The look (Settled)

- Night, lantern light, rain, wet streets with reflections, mist.
- **Stylized, cool and beautiful over realistic**, but still grounded. Anime-leaning.
- Not blocky or "basic shapes".
- Fixed isometric camera over the city (see Look and camera below).
- **See-through**: buildings between the camera and the action fade so the street stays visible.

## UI look (Settled, 2026-11-23)
- Style target: the lantern town panel mock (project files ui_audit/mock/town_panel_and_bar_v5.png); it replaces the war camp panel mock.
- Materials instead of boxes: lacquer and timber frame, dyed cloth header with the clan crest, wood body, washi paper notes with red seals, brass and dark wood buttons with press depth, dark shelves holding the game's own painted props.
- Serif type throughout (Shippori Mincho B1); no spaced small caps, no thin rule lines, no pills.
- Ability icons are painted tiles (36, 128 px, rounded corners), clan crests painted ivory and gold on the clan cloth; both made from art_prompts/icons_and_crests/prompts.md.
- HUD meters sit in a sunk track with a brass rim and a moss green fill; key hints are small vermilion seals.

## Effects (Settled, 2026-11-23)
- Every visual effect stays somewhat see-through, so it reads as animation and not flat 2D art (Tim).

## What the look tests showed

**Lantern street** (`look_tests/lantern_street.html`)
- Proved three.js can hit the mood: rain lit by the lanterns, puddle reflections, mist, bloom and colour grading all run in a browser.
- The anime layer works: soft cel bands, blue shadows instead of black, ink outlines, a richer colour grade. A slider blends it with the realistic base.
- Weak points: buildings and people built from code shapes read as "basic shapes", and the people looked bad.

**Voxel character** (`look_tests/voxel_character.html`)
- One ronin about 160 cubes tall (about 1 cm cubes), sculpted from smooth shapes and then converted to cubes. Animated by moving parts, no rigging tools needed.
- Silhouette, clothing and the walk read well. The face is the weak point at this cube size.
- Kept as an example. Voxel is not decided.

## Research notes (how stylized games get their look)

- Keep physically based lighting underneath and stylize on top through palette, grading and atmosphere (the Ghost of Tsushima approach).
- Toon shading: a few soft light bands, shadows pushed toward blue, a little noise on band edges so it feels drawn.
- Outlines as a screen pass using surface direction and depth, thinning with distance.
- Anime backgrounds get their beauty from a strong light and dark split, saturated colour that avoids pure black and white, gradient skies, and one clear focal point.

## Art pipeline (Settled, 2026-10-14; replaces the 2026-10-13 plan)

- **Fixed-camera isometric sprites rendered from 3D by script.** The camera does not rotate; buildings fade when a character walks behind them.
- All art is **placeholder** and will be redone before selling, so the pipeline must keep art swappable.
- **Island ground painting:** the island's ground, trails and props are built from layered rules, not hand-painted maps; see [world_painting.md](world_painting.md) (mock: `images/frontier/ground_painting_mock.jpg`). Ground textures and lake strips come from `assets/environment` via `node tools/import_island_ground.mjs` (sources listed in `world_paint.json`).

### Characters (proven end to end with the ronin, 2026-10-14)

1. **Concept image** in ChatGPT or Gemini, with `hero1.png` attached as the style reference. Prompts are in `assets/character_prompts.md`. Front view, A-pose, empty hands.
2. **3D model** on Tencent HY 3D Global (https://3d.hunyuanglobal.com/): Image-to-3D at 50k faces, 20 free a day.
3. Download the **OBJ zip with textures**. Tencent's FBX has a skeleton that Mixamo rejects.
4. **Mixamo** auto-rig with the Standard skeleton.
5. Export from Mixamo as FBX:
   - one **with-skin** file per character in `assets/models` (for example `ronin.fbx`);
   - **without-skin** animations in `assets/animations`, grouped into sets by subfolder (list in `cast_tracker.md`, Animation sets). They all use the same Mixamo skeleton, so any animation works on any character; the export script pairs each model with its set.
6. Render with `look_tests/sprite_render_test.html` (live preview of all 8 directions), then export and pack with `node tools/export_sprites.mjs . <model> --pack` (see `README.md`, Exporting sprites). Packing gates (2026-11-01): for changed models the single-model repack replaces the full re-audit and catalog step; old sheets are archived automatically. A full audit is only for catalog-wide policy changes. Gutter trial: the shield guard (`koruda_enforcer`) is on a 4 px gutter (81 to 61 MiB; `packed_sheets` accepts margin 2 or more); extend to all models if there is no edge bleed when zoomed out. Repacking one model takes about 5 s.
7. Result: one **8-direction spritesheet** per character and animation in `assets/sprites/<model>_<animation>.png`, plus verified packed pages in `assets/sprites_packed/catalog_v1/` for the current runtime. Rows top to bottom are S, SW, W, NW, N, NE, E, SE; default frames are 160px at 12 fps (the character is the same size as in the earlier 128px sheets; the extra room keeps lunges and falls inside the cell). Root motion is removed so each frame stays centered, and the feet sit at the same point in every cell.

**Original-sheet retirement plan (2026-11-01; not approved for implementation):** Keep `assets/sprites/` active for `?sprites=original` comparison and runtime load-failure fallback. Before retiring it, check every roster animation and its glows, buffs, trails and death effects indoors and outside at near/far zoom; compare long-match browser memory and failure behavior; and verify a complete restorable archive with hashes. A separate approved checkpoint would remove the comparison switch and legacy runtime fallback, archive source sheets outside the active runtime without destroying them, and update exporter, test and doc references. No export, move or deletion is part of this plan.

### Buildings and props (Settled)

- AI-painted isometric sheets (`assets/environment`), drawn on **invisible three.js block proxies** for collision, depth and fading.
- Night darkens them and adds lantern glow. Flames (torches, campfires) are a **separate animated layer**, not the painted ones.
- Ground is tiled from the texture sheets.
- Frontier island art (W3.8/W3.9): generate the 25 sources listed in `assets/image_prompts.md`, then run `tools/import_island_art.mjs` for family-only alpha normalization and prop/ground outputs. `sim/island_art.js` deterministically assigns chunk-owned pieces; `render/world_ground.js` uses bounded streaming and disposes chunk masks. Fitting and art scale still require in-game review; see the [frontier checkpoint](frontier_campaign_plan.md#world-map-scale-and-visual-reference-revised-sketch-2026-11-01).

### Effects (Settled)

- Abilities use an existing Mixamo animation plus code or sprite VFX.
- Night lighting, rain, mist and wet reflections stay live effects on top of the sprites.
- Weapon glow (2026-10-18): faint per-weapon glow layer; see `combat_spec.md` section G.
- Unit circles (2026-11-01): turning-arc magic circles (shader in `render/view.js`) replace the flat team rings, dimmer.
- Spotting enemies (2026-11-19, `render/characters.js`, `render/view.js`): health bars over units are coloured by side: yours (hero, crew, workers) green, enemies red; everyone else (townsfolk, calm bandits, police not after you) keeps the green to red health shading. Enemy nameplates have a red border; the crest keeps the clan colour. Team rings get thicker, brighter and slightly bigger as you zoom out past 0.6, fully at the furthest island zoom.
- Door rings (2026-10-17): a notched outer ring, a turning dashed inner ring, ember glow and a sweeping highlight; each ring sits 1 step out from its door.

### Animals and vehicles (2026-11-06)

- Mixamo can't rig animals. Path: concept image, then Tencent for the 3D model, then rig and animate headless in the cloud with `assets/models/source/animal_rigs/quad_rig.py` (Blender as a Python module: `pip install bpy`), then the usual 8-direction sprite export.
- Vehicles: generate the wheels and the animals as separate images, because Tencent fuses wheels into the body.
- Concepts live in `assets/concepts/mounts_vehicles/`.
- Horse walk (2026-11-07): the leg pose keeps the original fold (front cannon -F, pastern -0.6F). The front-leg swing is time-compressed to the first 70% of its swing window, then held planted, so the front legs match the back legs' cadence. Applied in the walk clips of mare, mare_saddled, calico, rickshaw_horse and omnibus .glb (`assets/models/mounts`, gitignored). Gallop unchanged.
- Calico rig (2026-11-08): built by `assets/models/source/animal_rigs/calico_rig.py`, not `quad_rig.py`, because the Tencent mesh is bent and leaning. It finds the feet by k-means, shears the legs under the body, straightens the chest, neck and head, re-rolls the bones, re-weights, and makes walk and gallop with the mare's `make()` values. The 0.7 front-leg walk warp is applied with `animal_rigs/front_walk_warp.py` (`python front_walk_warp.py calico.glb walk`). Framing: 288 px cells, cellWorld 5.4 (same as the mare).

### Frontier angled art (2026-11-06)

- The ground grid shows on screen at 24.1° (camera elevation atan(0.5), yaw 45). Angled wall and fence art matches it: along world x the line falls to the right, along z it rises to the right. Fix a slope with a vertical shear; make the other axis by mirroring.
- Stockade walls run along the two grid axes only; no vertical pieces.
- Art keys: buildings `stable`, `coach_house`, `frontier_watchtower`, `palisade`, `gatehouse`, `mine`; walls and gates `palisade_wall_x`/`_z`, `gate_x`/`_z`, `gate_v1`, `gate_v5`, `palisade_wall_v1`, `palisade_wall_v5` (`game/art/buildings/`, `game/art/cutouts.json`). Cut by `tools/add_frontier_sheet2_art.py`. Replaced views: `to_delete/2026-11-06_frontier_angled_views/`.

### Superseded

- The 2026-10-13 plan used free 3D building packs (Kasuga) and local Hunyuan3D. It was replaced by the painted sheets above and Tencent's web version, which has textures.
- Tim's 2026-10-12 lean toward a fixed isometric camera with generated 2D sprites (Sudden Strike quality) became the pipeline above.

## Assets layout (Settled, 2026-10-14)

| Path | What it is |
|---|---|
| `assets/concepts/` | Character concept images, one per character |
| `assets/environment/` | Buildings, props and ground texture sheets (`props1_cut.png` is props1 with the white background removed) |
| `assets/models/` | Rigged with-skin FBX per character; `models/source/` holds the raw Tencent exports |
| `assets/animations/` | Mixamo animations (without skin), in sets by subfolder |
| `assets/sprites/` | Exported spritesheets |
| `assets/image_prompts.md`, `assets/character_prompts.md` | Image-generation prompts for reuse |

## Look and camera (Settled, 2026-10-13)

- "Cool and sleek, not bright, boxy or dull."
- **Dota 2 as the base**: muted dark palette, painterly, rim light, colour accents. Plus anime touches. **No heavy ink outlines.**
- Camera like an RTS: Dota or League distance, or a bit further, outdoors; League distance inside buildings.

## Characters (Settled, 2026-10-14)

- Concept images are in `assets/concepts`. Every character, its role and its pipeline status are in `cast_tracker.md`.
- NPC variety later comes from swaps (hats, colours, hair, props) on these bodies.

## Frontier weather (2026-11-20)

- Purely visual, no gameplay. Frontier island only (not the capital street or interiors). Settings > Video Weather checkbox turns it off.
- Picked per half-day (day and night of each clock day) from the biome under the camera (islandBiome: forest / snow / dry) with a fixed hash: no saved state, same on every client. Fades over about 12 s. One wind for the island per half-day.
- Kinds: clear, mist, fog, drizzle, rain (forest); clear, mist, flurries, snow, snowstorm, fog (snow); clear, haze, drizzle, night mist (dry). Fog amount per kind: drizzle 0.25, mist 0.45, haze 0.65. A snowstorm drifts with the table's wind (1.8x), not multiplied again.
- Fog: soft banks lying on the ground, drifting with the wind and wrapping round the view; drawn above ground decals and under sprites, plus a thin even base haze and a veil drawn over buildings, trees and units; lantern tint 40%. Never a full-screen grey. Night: moonlit, catches lantern light, rare ghost lights (hitodama) only when fog is above 0.7 (fog and snowstorm).
- Weather odds (2026-11-21): every non-clear kind's chance halved (rounded up), clear sky takes the rest, day and night in all biomes. Weather shows: forest day 34%, forest night about 1 in 6 (fog); snow 40% day / 26% night; dry 22% day / 16% night. Each night rolled on its own (runs of foggy or clear nights happen). Flurries have no fog.
- Rain (streaks + ground splashes) and snow: GPU points wrapping in a screen-aligned ground box, so they cover the whole screen at any zoom. Fog shader skips noise outside each bank.
- Numbers (game/data/weather.json): 13 fog banks, 480 rain drops, 100 splashes.
- Files: game/src/weather_pick.js (picker), game/src/render/weather.js (drawing), game/data/weather.json (numbers), game/tools/test_weather.mjs.

## Soft town ground edges (2026-11-20)

- The cleared dirt under every town grid cell (houses, zone buildings, watchtowers, castle ground) and construction-site dirt patches draw as one soft, rounded, slightly uneven blob instead of square tiles. Road tiles, fields and castle terraces are unchanged. War camps draw no ground pad.
- `game/src/town_props.js`: each clear patch carries a blob with its 8 drawn neighbours; project dirt patches carry a blob with no neighbours. `game/src/render/world_ground.js`: the shader blurs the neighbours' coverage and thresholds it; each cell quad is drawn blobPad wider; one owner cell per fragment, so no double blend.
- Numbers in `game/data/frontier.json` townArt._ground: blur 5.5, blobPad 4, blobFeather [0.18, 0.6], blobWobble 0.055. Removing blur restores square tiles.
## Docks (2026-11-23)

- Castle dock: the blueprint pier cells are drawn as a raised wharf on piles: deck DOCK.deck (1.6) over the water, rising from DOCK.lip at the land edge over DOCK.ramp units; edge beam, round piles with a wet band (never above the pile's top), cross bracing (src/dock_shape.js, built through castle_height.js terrainPieces into render/world_ground.js). Drawing only: the sim dock cells are unchanged; groundY returns the deck height so people and props stand on the boards.
- Textures and tints: data/frontier.json townArt._castle.pieces pier (art/ground/dock_deck.jpg), dockBeam, dockPile, dockWet, dockDark (art/ground/dock_boards.png).
- Dock things: townArt._castle.dockProps [art, across 0..1, land 0 to sea 1, flip], drawn by src/town_props.js. Flip "hook" mirrors a derrick so its hook hangs over the water past its nearest edge (hookFlip).
- Dock art (art/props, data/art.json items, art/cutouts.json): dock_rice_bales, dock_cargo_matting(_grey), dock_net_rack(_small), dock_derrick(_small), dock_anchor_chain, dock_fish_traps, and the dock buildings dock_kura, dock_cargo_shed, dock_net_shed, dock_lookout(_small), dock_guard_hut(_b), dock_boat_shed(_b). On the castle dock the kura replaces dock_warehouse; cargo shed, guard hut, net shed, boat shed and lookout stand on it. dock_derrick_city is the same picture at scale 0.98 for the city east pier. All dock sprites are defringed.
- City harbour piers get the same build: data/port_town.json docks block (piers, smaller size numbers, pieces), drawn by src/render/city_docks.js (added in view.js after the city ground). Dock props on the city bund and piers are in port_town.json props: lookout on the west pier, net shed and boat shed on the bund; the rowboat under the ferry berth is gone.
- Moored boats, for the look only (render/moored_boats.js): three fishing boats (boat_river) at every castle dock, a warship (ship_war) on some days, and a coastal cargo ship at anchor off the sea end (data/campaign_zones.json ship.berth.moored: fishing, cargo, cargoTurn, cargoSize). The castle ferry berth is out at 14.5 (was 12.5) to clear the piles; the city ferry berth is at z -43 (was -40) so its bow clears the bund.
- art/buildings/customs_house.png: the tower roof is completed to a point (cutouts h and bottomY +16).
- Prompts: art_prompts/dock_art_prompts.md in the project files. For future sheets, ask for a flat solid magenta background, not "transparent".
## Water (2026-11-23)

- The sea and lakes are painted, not photoreal. Painted ripple normals with mixed directions come from `water_surface.js` (`paintedNormalData`, style `"painted"`); the baked chop height is kept in the normal map's alpha. The water is graded through three tones: ink in the troughs, deep, and lit. Slow swell bands run along the wind (`data/world_paint.json` `waterSurface.paint`; strength 0 = the old look).
- Depth: each ground chunk bakes its distance from the bank (`world_paint.js` paintChunk `D`, `waterSurface.depth.max` units). Shallows near banks are lighter and greener, open water sinks to dark ink, and a darker wet band sits just off the foam.
- Shore foam is see-through and never opaque. It is drawn on the water side of every bank, including castle docks and moats. It never has a straight edge, and its width varies from a thin rim to a wide wash. Whole stretches have none. It surges out with each incoming wave and slides back. Strength: `waterSurface.depth.foam` (0 = off). The coast strip rim (`coastlineMaterial`) also comes and goes, with a ragged edge.
- At night, lanterns and fires drop broken, wobbling warm streaks on the water below them (`waterSurface.lampStreaks`).
- Harbour coast corners are rounded for drawing only (`sim/shoreline.js`, `visual` corners); walking and ships keep the square cells. Cliff and mountain corners stay sharp.
