# Infamy

A browser game about building a crime empire in 1870s Japan. You play one hero, recruit a crew, and grow a clan that fights rival clans for territory, with raids at night. Seasons last two weeks in a shared persistent city.

Hobby project, built with AI in the evenings. Built in playable layers: a tiny single-player version first, then small multiplayer, then the full city.

## Status

Design and art pipeline. The character pipeline works end to end: the ronin is a rigged 3D model rendered to 8-direction spritesheets. No game code yet beyond look tests and the sprite exporter.

## Repo layout

| Path | What it is |
|---|---|
| `docs/gameplay_and_design.md` | Game shape, clans, starting paths, city and territory, raids, controls, weapons, crew, economy, infamy, open questions |
| `docs/art_direction.md` | The look, what the look tests proved, the sprite pipeline, camera, characters |
| `docs/roadmap.md` | Build layers, tiny version scope, next steps |
| `docs/controls.md` | Every game control that works now, plus planned keys |
| `look_tests/` | Standalone HTML experiments. Open any file in a browser. |
| `assets/` | Concepts, environment sheets, models, animations, sprites and prompt files (see `docs/art_direction.md`) |
| `tools/export_sprites.mjs` | Batch-exports each model with its animation set to `assets/sprites` |

## Look tests

- `look_tests/lantern_street.html`: rainy lantern-lit street with wet reflections, mist, a see-through cutaway and a Realistic to Anime style slider.
- `look_tests/voxel_character.html`: one ronin built from about 108,000 one-centimetre cubes, with idle and walk animations. Kept as an example only; the art pipeline uses sprites instead.

- `look_tests/sprite_render_test.html`: drop in a rigged model and Mixamo animations to preview all 8 isometric directions and export a transparent spritesheet.

All of them load three.js from a CDN, so they need an internet connection.

## Exporting sprites

```
npm install playwright
npx playwright install chromium
node tools/export_sprites.mjs
```

This renders each model in `assets/models` with its own animation set from `assets/animations` to `assets/sprites/<model>_<animation>.png`, overwriting earlier exports. Add model names after `.` to export only those (`node tools/export_sprites.mjs . thug brute`). Animation sets go by subfolder of `assets/animations`, keeping Mixamo's own filenames: `brawler/` (thug, brute), `gunner/` (mercenary), `ninja/` (ninja leader and ninja grunt), `archer/` (archer), `civilian/` (geisha and other townsfolk, the default). Files directly in `assets/animations` are the ronin's combat set. `Mutant ...` files in `brawler/` are brute-only and replace the plain clip of the same name (`Mutant Walking` replaces `Walking`). A filename prefix such as `brawler_walk.fbx` also works. The mapping is at the top of the script.

Held items (weapons, props) go in `assets/models/items/` as `.glb` (or `.fbx`), and `ITEMS` at the top of the script says who holds what (for example the mercenary holds `rifle.glb` in both hands). Sizes per character are in `SCALE` (the brute is 1.12x). The sprite test page has matching controls for trying an item and its grip by hand.

## Tech

Browser game built on the latest three.js (ES modules). Multiplayer planned with Colyseus. Art is isometric sprites rendered from 3D. The look tests show the rendering techniques (wet reflections, lit rain, bloom, anime shading, see-through cutaway).

## Name

**Infamy** (decided 2026-10-14; was "Prestige and Infamy").
