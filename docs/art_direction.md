# Art direction

## The look (Settled)

- Night, lantern light, rain, wet streets with reflections, mist.
- **Stylized, cool and beautiful over realistic**, but still grounded. Anime-leaning.
- Not blocky or "basic shapes".
- Isometric camera over the city, with a closer street-level view possible.
- **See-through cutaway**: buildings between the camera and the action dissolve so the street stays visible. Needed for an isometric view of a dense city.

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

## Art pipeline options (Open)

1. **Painted 2D (Hades/Bastion style).** Rough 3D models rendered from the fixed angle, repainted with an image generator, cut out as sprites. Most beautiful per hour, but the camera cannot rotate. Characters do not suit per-frame painting because of flicker: they would be 3D models rendered to sprite sheets.
2. **Stylized 3D asset packs** (for example Synty POLYGON Samurai, or free CC0 packs) plus our lighting. The camera can rotate. Check licences allow browser games.
3. **Voxel**, everything generated in code. No outside tools, characters animate easily, can look stunning with good lighting. The trade-off is that it reads as voxel, and faces are limited.
4. **Code-built detail pass**: bevels, real roof tiles, brackets, lattices and ambient occlusion on procedural buildings, with ready-made animated characters.

Decisions still needed:
- Which pipeline.
- Whether the camera must rotate (rules out painted 2D if yes).
