# World painting: how the island gets a hand-made look from rules

Proposed home: `docs/world_painting.md`, with a link from `docs/architecture.md` (Render) and
`docs/art_direction.md`. Tim OK'd the approach 2026-11-02 ("the layered is much better"). Reference
mock: `docs/images/frontier/ground_painting_mock.jpg`, made by `tools/ground_mock.py` (copied from
/mnt/project-files/w3_walkable/ground_painting/).

**For any AI working on island ground, props or a new biome: follow this procedure, keep every layer
deterministic, and check the result against the mock before asking Tim to look.**

## The idea

A generated map looks machine-made because of five tells:
- edges that follow the data grid;
- textures that repeat in visible lines;
- soft cross-fades between materials;
- evenly spread props;
- nothing that looks placed on purpose.

Each layer below removes one tell. The layers are stacked in this order and every one reads only
the world data plus the world seed, so the same spot always looks the same, in every chunk, on every
machine.

## Inputs

- `game/data/world.json`:
  - terrain codes on 50-unit cells;
  - regions with biome;
  - corridors, rivers, lakes, sites, nodes, camps and passes.
- `game/data/world_overrides.json` and the hand stamps (layer 8).
- `game/data/world_paint.json` (new): every number and material table below lives here, never in
  code. `main.js` passes it in as `worldChunks.paint` (sim and renderer); tools that want painted
  props merge it the same way.

## The layers

**1. Wandering borders (biome field).** For any point, the biome weights are:
- the terrain-cell codes, blurred over about 12 units;
- sampled at a position pushed sideways by value noise (domain warp: scale about 22 units, up to
  ±17 units);
- plus a little fine noise at the edge (scale about 9 units).

This turns grid-straight borders into meandering ones. Put it in **one pure module shared by the sim
and the renderer** (`src/world_paint.js`), so the ground and the props agree on where the forest is.

**2. Material mosaic.** Each biome lists its ground materials with a noise scale and a bias in
`world_paint.json`.
- forest: the 16 forest tiles (`assets/environment/forest_textures/*_tile.png`), with forest_floor
  and pine_needles as the base;
- plain: grass, pebbles_soil, moss;
- snow: ground_snow, ground_snow_b, plus the thaw pair at snow edges;
- dry: dry_grass, sand and the dry tops;
- mountain tops: top_<biome> plus the B/C/D variants.

Each material's weight is low-frequency noise (scale 18 to 30 units) plus its bias, so patches of
needles, moss and leaf litter drift across the floor.

**3. Height blend.** Materials do not cross-fade. Each texel's brightness acts as its "height": a
material's score is its weight plus height × 0.35, and only materials within about 0.12 of the best
score show. Grass then pokes through snow and needles fill hollows. The same rule applies at biome
edges.

**4. No visible repeats.** Two parts:
- Stochastic tiling in the ground shader: the ground is split into cells of about 10 units (hex
  cells in the shader). Each cell samples the texture with its own random offset and a rotation in
  90° steps, and neighbouring cells blend smoothly.
- Macro variation on top: a very slow noise (scale about 70 units) that shifts brightness and warmth
  by up to about ±10%.

**5. Lines on the land.**
- Trails along corridors: noisy width (2.2 to 3.8 units), a ragged edge decided by the texture
  height, and a worn verge of pebbly soil about 2.5 units wide. The dirt_trail tile is used on open
  ground, mixed half and half with trail_roots in forest.
- Rivers get muddy_bank along their sides. Lakes get the narrow bank pieces (lake_edge_1 to 8),
  with code-drawn water.

**6. Detail decals by rule.** As built (W3.10): material rules for now (worn verge on trails, muddy banks by water, rocky patches on hills, needles in forest); separate decal art is a later art pass. These are small transparent patches, each with a rule and a density:
- worn earth along trails;
- wet mud by water;
- flower clumps in meadows;
- rock scatter on hills;
- fallen needles under groves.

They follow the same noise as layer 2 so they gather in sensible places.

**7. Clustered props.**
- Candidates come from a jittered grid (one per 3.4 × 3.4 units, offset by the seeded random
  number). That is seamless across chunk borders, unlike Poisson sampling per chunk.
- A tree is kept with probability: biome mask × grove noise (scale about 26 units, threshold about
  0.42) × trail clearance (none within 3 units of a trail, rising to full by 9).
- Edge trees: where the forest mask is between 0.12 and 0.6, there's an extra 22% chance of a tree,
  so the forest frays into the meadow and lone trees stand outside it.
- Undergrowth (ferns, bushes, stumps) goes near trees; rocks and bushes go in open meadow at a low
  density.
- Sizes are in units: pine 5.5 wide, cedar 4.2, bush 3.6, ferns 3.0, rocks 3.0, boulder 3.6, stump
  2.0, log 5.0, each varied ±20%.
- Props are sim data (`sim/chunk_gen.js`), because some of them block.
- Mountain tops: a separate pass puts sparse art-only props (no walk blockers) on the flat top of a range, kept
  `inset` units in from the rim so they clear the cliff art. Data in `biome_props.json` `mountainTops`.
- Clustering (2026-11-03): ordinary props are placed as clusters by `sim/prop_clusters.js` (28 families in
  `biome_props.json` `clustering`; five footprint sizes, three layouts, singles, three height tiers; every member
  checked on its own). `clustering.enabled: false` restores the old scatter exactly. `propScale` draws every
  non-tree, non-oddity prop at 0.5x and shrinks its blocker to match. Edge trees, outcrops, mountain tops and
  oddities keep their own passes.

**8. Hand stamps.** A list in `world_paint.json`, one entry per authored spot (landmark, camp, pass,
gate, town site), each with a radius.
- A stamp can clear props, force a material (a camp's trampled earth), or add named props.
- Stamps win over every rule inside their radius and fade out over the outer 30%.
- This is how a place gets to look designed.

## Rules for whoever builds or extends it

- **Deterministic:** all noise is sampled in world coordinates from the world seed. Never use
  `Math.random`. The same chunk built twice is identical.
- **Seamless:** anything decided per chunk must give the same answer from both sides of a chunk
  border. Use world-coordinate noise and the jittered grid; no per-chunk normalising.
- **Budgets:**
  - a chunk build stays within +20% of the W3.6 numbers (average 0.8 ms, worst 9 ms). Measured after W3.10: average 1.9 ms, worst 15 ms on the profile walk (warm builds 0.55 / 2.5 ms; sim tick unchanged at 2.31 ms); ground painting about 15 ms per new chunk on the render side. Proposed budget: average 2 ms, worst 16 ms, with a later speed-up step;
  - each spot mixes at most 4 materials (decided per point, so chunk borders always agree); a chunk uses up to 16 (four weight maps). A per-chunk top 8 made seams where neighbours picked different sets;
  - no extra draw calls per prop.
- **Numbers in data:** every scale, threshold and density goes in `world_paint.json`, so Tim can
  tune it without code.
- **City untouched:** this is island-only (`place === 'world'`).

## Adding a new biome or area (the recipe)

1. List its ground materials, props and decals in `world_paint.json`.
2. Missing art: write prompts following `assets/image_prompts.md` (one at a time, transparent, tree
   scale matching the pine) and have Tim generate them.
3. Preview: run `tools/ground_mock.py` with the new materials on a sample patch (before/after) and
   show Tim. Build only after his OK.
4. Build it, then run the checks below. Tim playtests with test travel (World tab, click and
   confirm).

## Checks

- Determinism and seams test: build each chunk twice and compare. Compare splat values and props
  along each shared border from both sides.
- No prop on a corridor, a blocked cell, inside a stamp that clears, or within 3 units of a trail.
- Density per biome stays within the ranges in `world_paint.json`.
- `profile_world_chunks.mjs` stays within budget.
