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
   - **without-skin** animations in `assets/animations`, grouped into sets by filename prefix (`brawler_`, `gunner_`, `civilian_`; the ronin's combat set has no prefix). They all use the same Mixamo skeleton, so any animation works on any character; the export script pairs each model with its set.
6. Render with `look_tests/sprite_render_test.html` (live preview of all 8 directions) or batch-export with `tools/export_sprites.mjs`.
7. Result: one **8-direction spritesheet** per character and animation in `assets/sprites/<model>_<animation>.png`. Rows top to bottom are S, SW, W, NW, N, NE, E, SE; default frames are 160px at 12 fps (the character is the same size as in the earlier 128px sheets; the extra room keeps lunges and falls inside the cell). Root motion is removed so each frame stays centered, and the feet sit at the same point in every cell.

### Buildings and props (Settled)

- AI-painted isometric sheets (`assets/environment`), drawn on **invisible three.js block proxies** for collision, depth and fading.
- Night darkens them and adds lantern glow. Flames (torches, campfires) are a **separate animated layer**, not the painted ones.
- Ground is tiled from the texture sheets.

### Effects (Settled)

- Abilities use an existing Mixamo animation plus code or sprite VFX.
- Night lighting, rain, mist and wet reflections stay live effects on top of the sprites.

### Superseded

- The 2026-10-13 plan used free 3D building packs (Kasuga) and local Hunyuan3D. It was replaced by the painted sheets above and Tencent's web version, which has textures.

## Tim's earlier note: leaning option 1, Sudden Strike (2026-10-12)

Kept for reference. The 2026-10-14 art pipeline above settles most of it: painted sheets instead of repainted 3D renders, and `hero1.png` as the locked style reference.

**Leaning (Tim, 2026-10-12): option 1, fixed isometric camera with generated 2D sprites.** Target quality: classic Sudden Strike, meaning dense, detailed isometric maps where every building and unit is a crisp pre-rendered sprite.

What that means in practice:
- Camera angle is locked; no rotation. The see-through effect becomes fading buildings when a character walks behind them.
- Buildings and props: rough 3D model, rendered from the fixed angle with a depth map and a glow mask, repainted with an image generator, cut out as sprites.
- Characters: 3D models animated and rendered to 8-direction sprite sheets (no per-frame paint-over).
- Night lighting, rain, mist and wet reflections stay live effects on top of the sprites.

Still to decide:
- Which image generator (needs one that can follow a depth or outline guide for consistent shapes).
- One locked style reference so every sprite matches.

## Assets layout (Settled, 2026-10-14)

| Path | What it is |
|---|---|
| `assets/concepts/` | Character concept images, one per character |
| `assets/environment/` | Buildings, props and ground texture sheets (`props1_cut.png` is props1 with the white background removed) |
| `assets/models/` | Rigged with-skin FBX per character; `models/source/` holds the raw Tencent exports |
| `assets/animations/` | Mixamo animations (without skin), in sets by filename prefix |
| `assets/sprites/` | Exported spritesheets |
| `assets/image_prompts.md`, `assets/character_prompts.md` | Image-generation prompts for reuse |

## Look and camera (Settled, 2026-10-13)

- "Cool and sleek, not bright, boxy or dull."
- **Dota 2 as the base**: muted dark palette, painterly, rim light, colour accents. Plus anime touches. **No heavy ink outlines.**
- Camera like an RTS: Dota or League distance, or a bit further, outdoors; League distance inside buildings.

## Characters (Settled, 2026-10-14)

Concept images in `assets/concepts` (22 files as of 2026-10-14):

- **Heroes:** ronin (`hero1`), western mercenary (`mercenary1`), yakuza brute (`brute1`), ninja leader (`ninja_leader`, plus an earlier take `ninja1`). Gunrunner hero abilities are Open.
- **Crew:** thug (`thug`), swordsman (`swordsman`), archer (`archer`), lookout (`lookout`), demolitions (`demolitions`), ninja grunt (`ninja_grunt`).
- **Enemies:** police officer (`police_officer`), bandit (`bandit`), rival yakuza, a woman fighter (`rival_yakuza`).
- **Townsfolk:** merchant, geisha, laborer, fisherman, monk (two takes: `monk`, `monk2`), old woman (`old_woman`), sailor.
- NPC variety later comes from swaps (hats, colours, hair, props) on these bodies.
- Done in 3D so far: **ronin** (rigged, with 9 shared animations: Breathing Idle, Great Sword Idle, Great Sword Jump, Great Sword Slash, Thrust Slash, Reaction, Run, Two Handed Sword Death, Yelling Out, plus its built-in walk).
- In progress: **ninja leader** (Tencent OBJ zip in `assets/models/source`, not rigged yet).
