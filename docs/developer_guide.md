# Developer guide

Repo layout, look tests, sprite export and tech overview.

**UI rule: no scrollbars anywhere in the game UI** (including browser number spinners and similar controls). Long content uses Previous/Next pages or is split into several menus or tabs.

## Tech

The browser client uses JavaScript ES modules and three.js, with isometric character sprites rendered from 3D models. The simulation owns game rules and state; the client sends commands and renders the results. A local Node server serves the game and saves. The architecture is designed for multiplayer later; a networked multiplayer release is not built yet.

## Test status (2026-11-06)

12 stale tests in `game/tools` updated to current rules (and `mode_baseline.json` refreshed); `rewards.js` dawn exception for leaderDown removed; all 13 pass. `formatStat`/`modifierDisplay` moved to `src/character_stat_format.js` (re-exported from `character_panel.js`).

## Repo layout

| Path | What it is |
|---|---|
| `docs/` | Design and tech docs (listed in [START_HERE.md](../START_HERE.md)) |
| `game/` | The game: sim, render, data (see `docs/architecture.md`) |
| `look_tests/` | Standalone HTML experiments. Open any file in a browser. |
| `screenshots/` | Screenshots used in the README |
| `assets/` | Concepts, environment sheets, models, animations, sprites and prompt files (see `docs/art_direction.md`) |
| `tools/export_sprites.mjs` | Batch-exports each model with its animation set to `assets/sprites` |

## Look tests

- `look_tests/lantern_street.html`: rainy lantern-lit street with wet reflections, mist, a see-through cutaway and a Realistic to Anime style slider.
- `look_tests/voxel_character.html`: one ronin built from about 108,000 one-centimetre cubes, with idle and walk animations. Kept as an example only; the art pipeline uses sprites instead.

- `look_tests/sprite_render_test.html`: drop in a rigged model and Mixamo animations to preview all 8 isometric directions and export a transparent spritesheet.

All of them load three.js from a CDN, so they need an internet connection.

## Exporting sprites

This is the process for new characters and items and for updates to existing ones.

One-time setup in the `infamy_game` root: `npm install sharp playwright`.

```
node tools/export_sprites.mjs . <model> --pack
```

- `--pack` repacks just the exported models into the live catalog afterwards (runs `tools/repack_model.mjs`).
- `--portrait` also renders the 512 px character-page portrait (idle, front row) to `assets/sprites/portraits/`; with `--pack` it goes into `assets/sprites_packed/portraits/`.
- `--margin=N` sets the gutter between packed frames (passed through to the repack).
- Overwritten sheets are archived automatically to `assets/sprites_archive/<date>_<model>/` (once per day per file).

Repack without exporting: `node tools/repack_model.mjs <model> [more models] [--margin=4]`, `--all` for every model (slow), `--dry` to report sizes only, `--portrait` for portraits.

Add `--glow-only` to write just the weapon glow sheets (`<sheet>_glow.png`) and keep the colour sheets.

This renders each model in `assets/models` with its own animation set from `assets/animations` to `assets/sprites/<model>_<animation>.png`, overwriting earlier exports. Add model names after `.` to export only those (`node tools/export_sprites.mjs . thug brute`). Animation sets go by subfolder of `assets/animations`, keeping Mixamo's own filenames: `brawler/` (thug, brute), `gunner/` (mercenary), `ninja/` (ninja leader and ninja grunt), `archer/` (archer), `civilian/` (geisha and other townsfolk, the default). Files directly in `assets/animations` are the ronin's combat set. `Mutant ...` files in `brawler/` are brute-only and replace the plain clip of the same name (`Mutant Walking` replaces `Walking`). A filename prefix such as `brawler_walk.fbx` also works. The mapping is at the top of the script.

Packed sprite manifests may have 8, 16 or 32 directions. Train cars use 32 directions (rows start at S, 360/32 degrees apart) with 6 frames each; other models stay at 8. Packed train textures take about 344 MiB of graphics memory with mips. Trains: `tools/train_to_glb.py` (numpy + Pillow) turns the OBJ pieces in `assets/models/source/train/split` plus the guard zip into `assets/models/mounts/train_*.glb`; the MOUNTS train entries in `tools/export_sprites.mjs` then export them.

Without `--pack` an export is not added to the packed runtime catalog. A full sprite audit is only needed for catalog-wide policy changes; the packing gates are in `docs/art_direction.md`.

Held items (weapons, props) go in `assets/models/items/` as `.glb` (or `.fbx`), and `ITEMS` at the top of the script says who holds what (for example the mercenary holds `rifle.glb` in both hands). Sizes per character are in `SCALE` (the brute is 1.12x). The sprite test page has matching controls for trying an item and its grip by hand.

### Mounts and vehicles

Animals, vehicles and cannons are `.glb` files in `assets/models/mounts/` (git-ignored, like the other models). The `MOUNTS` table in `tools/export_sprites.mjs` lists each one with its file, size and clips; export them the same way (`node tools/export_sprites.mjs . mare --pack`). `tools/mounts_to_glb.py` (pip `bpy`) converts a Blender rig scene to that `.glb`. Export sizes and framing are written to `assets/sprites/mounts.json`.

Extra `MOUNTS` fields for vehicles:
- `wheels`: wheels fused into the model are cut out and rebuilt as spinning spoked wheels (`addWheels` in `look_tests/sprite_render_test.html`); `mesh`, `fwd`, `axle`, `list` (Blender coordinates read off the model) and `spokes`.
- `tilt`: turns one part about a pivot so it meets the ground (the rickshaw's cart).
- `supersample`: renders at that many times the size and draws down, for softer edges.

Vehicle footprint shadows are set in `game/data/art.json` `characterFraming` as `shadow: [length, width]` in world units.

### Frontier sheet 2, ride clip and rickshaw horse (2026-11-06)

- `python tools/add_frontier_sheet2_art.py`: cuts frontier sheet 2 plus the gates and walls into `game/art/buildings/`.
- `RIDE` table in `tools/export_sprites.mjs`: the hero's `ride` clip (`coach_sitting` for now).
- `MOUNTS` `extra`: more clips from animation-only `.glb` files, made by `assets/models/source/gallop_anim.py` (for example `assets/models/mounts/*_gallop.glb`).
- `rickshaw_horse`: rig script `assets/models/source/rickshaw_horse_rig/rickshaw_horse.py`, exported through `MOUNTS`.

### Music (2026-11-07)

Songs live in `assets/music/` subfolders by mood (`city/`, `frontier/`, `battle/`, `ceremony/`, `stealth/`); the list is in `game/src/menu_music.js`. The in-game shuffle plays every song once per cycle with no repeats; subfolders do not change the playlist.
