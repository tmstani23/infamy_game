# Art direction

## The look (Settled)

- Night, lantern light, rain, wet streets with reflections, mist.
- **Stylized, cool and beautiful over realistic**, but still grounded. Anime-leaning.
- Not blocky or "basic shapes".
- Fixed isometric camera over the city (see Look and camera below).
- **See-through**: buildings between the camera and the action fade so the street stays visible.

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
- Door rings (2026-10-17): a notched outer ring, a turning dashed inner ring, ember glow and a sweeping highlight; each ring sits 1 step out from its door.

### Animals and vehicles (2026-11-06)

- Mixamo can't rig animals. Path: concept image, then Tencent for the 3D model, then rig and animate headless in the cloud with `assets/models/source/animal_rigs/quad_rig.py` (Blender as a Python module: `pip install bpy`), then the usual 8-direction sprite export.
- Vehicles: generate the wheels and the animals as separate images, because Tencent fuses wheels into the body.
- Concepts live in `assets/concepts/mounts_vehicles/`.
- Horse walk clip (2026-11-07): the front-leg swing fold is softened (front cannon -0.6F, pastern -0.25F; was -F and -0.6F) for the walk clips of mare, mare_saddled, calico, rickshaw_horse and omnibus; gallop unchanged. Rig source (gitignored): `assets/models/source/black_beauty_rig/bb_rig.py` `leg_pose()`.

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
