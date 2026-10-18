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

### Characters (proven end to end with the ronin, 2026-10-14)

1. **Concept image** in ChatGPT or Gemini, with `hero1.png` attached as the style reference. Prompts are in `assets/character_prompts.md`. Front view, A-pose, empty hands.
2. **3D model** on Tencent HY 3D Global (https://3d.hunyuanglobal.com/): Image-to-3D at 50k faces, 20 free a day.
3. Download the **OBJ zip with textures**. Tencent's FBX has a skeleton that Mixamo rejects.
4. **Mixamo** auto-rig with the Standard skeleton.
5. Export from Mixamo as FBX:
   - one **with-skin** file per character in `assets/models` (for example `ronin.fbx`);
   - **without-skin** animations in `assets/animations`, grouped into sets by subfolder (list in `cast_tracker.md`, Animation sets). They all use the same Mixamo skeleton, so any animation works on any character; the export script pairs each model with its set.
6. Render with `look_tests/sprite_render_test.html` (live preview of all 8 directions) or batch-export with `tools/export_sprites.mjs`.
7. Result: one **8-direction spritesheet** per character and animation in `assets/sprites/<model>_<animation>.png`. Rows top to bottom are S, SW, W, NW, N, NE, E, SE; default frames are 160px at 12 fps (the character is the same size as in the earlier 128px sheets; the extra room keeps lunges and falls inside the cell). Root motion is removed so each frame stays centered, and the feet sit at the same point in every cell.

### Buildings and props (Settled)

- AI-painted isometric sheets (`assets/environment`), drawn on **invisible three.js block proxies** for collision, depth and fading.
- Night darkens them and adds lantern glow. Flames (torches, campfires) are a **separate animated layer**, not the painted ones.
- Ground is tiled from the texture sheets.

### Effects (Settled)

- Abilities use an existing Mixamo animation plus code or sprite VFX.
- Night lighting, rain, mist and wet reflections stay live effects on top of the sprites.
- Weapon glow (2026-10-18): faint per-weapon glow layer; see `combat_spec.md` section G.
- Door rings (2026-10-17): a notched outer ring, a turning dashed inner ring, ember glow and a sweeping highlight; each ring sits 1 step out from its door.

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
