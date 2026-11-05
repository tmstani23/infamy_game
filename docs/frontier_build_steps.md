# Frontier build steps

Ordered, self-contained build phases for the frontier expansion described in
[frontier_campaign_plan.md](frontier_campaign_plan.md). Each step is a card that one thread can run
alone, following [step_runner_guide.md](step_runner_guide.md) (read it first: it holds the tags,
rules, test pattern and regression set).

Drafted 2026-11-01. Proposed home: `docs/frontier_build_steps.md`. **Nothing here is approved to
build until Tim OKs a phase.** Numbers in `data/frontier.json` are placeholders for Tim to tune.

## Blueprint and presentation workflow

Settled (Tim, 2026-11-03):

- Structure: coastlines, rivers/lakes, ranges, routes, crossings and authored locations belong to the blueprint sources. Current inputs are `docs/images/frontier/blueprint/blueprint.py`, its generated `world_blueprint_v2.json`, the authored `docs/images/frontier/blueprint/world_reshape_v1.json` overlay, and `game/data/world_overrides.json`. Keep generator-script and generated-blueprint edits reproducible; do not hand-edit `game/data/world.json`.
- Review the combined effective blueprint, including overrides and generator adjustments. Apply approved structural changes through `tools/seed_world.mjs`, validate, then refresh world/atlas references together. An old design preview is not evidence of the current world.
- Presentation: illustration, textures, decorative prop density, labels and UI styling follow the structure. Changes to walkability or gameplay behavior belong to structure/simulation even when prompted by an art issue. Preserve exact coordinate registration; never move gameplay features to fit a painting.
- Simulation owns rules and live state. Rendering/UI read them; an illustration is not a second source of geometry, locations or discovery state.
- Current effective blueprint reference: run `node tools/prepare_atlas_reference.mjs --version v2` after applying approved source edits. It checks that base blueprint + reshape overlay + overrides + generator reproduce the current world, then exports the terrain, exact feature layer, structural snapshot and human review sheet in `assets/environment/island/atlas/`. It does not change runtime files. The older `v2_*.png` design previews are historical, not this combined current view.
- Before art generation or map integration, run `node tools/prepare_atlas_reference.mjs --check --version v2`. It fails for changed inputs, missing/modified exports or blueprint/world disagreement. `node tools/seed_world.mjs --check` checks only the blueprint/world match, without writing the world or preview. Both checks ignore JSON key ordering during world comparison. References fingerprint blueprint/config/generator/helper inputs and export content; they do not automatically update an existing illustration.

### Mountain and lake reshape before atlas completion (Tim, 2026-11-03)

**Status (2026-11-03):** Tim approved revision 2; MR0–MR3 complete and the reshaped world is applied. MR4 Node checks pass; Tim confirms the reshaped geography is in game and looks nice; full traversal coverage is not claimed. L1/L2 approved outlines retained; a local V4 shoulder adjustment preserves cache K37 and S42 retains its original buildable clearing substrate. All authored locations and 20 passes/17 crossing anchors are fixed; capital/port unchanged. [Current effective review](../assets/environment/island/atlas/atlas_review_v2.png), [blueprint overlay](images/frontier/blueprint/world_reshape_v1.json), [build report](../assets/environment/island/reshape/reshape_build_report_v2.json). Original proposal/reference/illustration sources remain preserved. Save migration waived by Tim; no save deleted/reset.

**Goal:** make the six existing ranges read as natural mountain systems through bends, varied widths, tapering ends, foothill pockets and occasional secondary ridges. Preserve their regional identity and strategic role, especially the central barrier and dry range. Avoid replacing straight bands with equally uniform zigzags or random disconnected rocks. Also reshape the two main lakes (L1 Lake of Still Bells and L2 Reedmirror Lake) into believable basins with varied widths, irregular but coherent shores, modest coves and tapered ends. Avoid circular stamps, uniform-width ovals and noisy starburst outlines.

**Bounded scope:** keep the island outline, islets, capital/harbors, broad biome regions, lake identities/general locations and river network. Preserve authored site/node/camp/set-piece identities and positions, pass identities and usable connections, and the 9 bridge/8 ford records. Range-local hills and the dry skirt may change with the new relief; main-lake footprints and shoreline/marsh edges may change within approved envelopes. Prefer reshaping mountains around protected locations; list any unavoidable pass/source/location adjustment for Tim before applying it. Routes are derived and may change legitimately.

| Phase | Work / deliverable | Exit check |
|---|---|---|
| [x] MR0 Baseline and constraints | Record current source/world hashes, six range footprints, both main-lake footprints/widths, 20 passes, river sources and all crossing/location records. Make one readable current/proposed overlay with protected points. Use the existing atlas snapshot and Git checkpoint; preserve original reference/art files. | Baseline inventories and source provenance recorded; no world edits. |
| [x] MR1 Shape proposal | Design a coherent new spine/width/taper for each range in blueprint coordinates. Prioritize the central spine and northern belt, then dry/southern/eastern ranges. Propose both main-lake basin outlines, length/width profiles, surface areas and bounding envelopes in world units, fitted to nearby relief and the Reedmirror wetland. Show before/after terrain masks, lake shores, hill changes, passages and source relationships on a label-clean preview. | **Tim approves mountain/lake shapes, proposed lake widths and any listed exceptions before applying them.** |
| [x] MR2 Deterministic source pipeline | Add the approved authored range and lake geometry to the blueprint source. Separate terrain rebuilding from procedural placement so existing sites, resources, camps and set pieces remain pinned. Preserve stable IDs; keep preview/candidate outputs separate from live files until validated. | Repeated builds from identical sources agree; inventory diff shows only approved changes. Script + generated blueprint stay reproducible. |
| [x] MR3 Apply and derive | Generate the candidate world from blueprint + overrides, including shoreline rounding, coastal cliffs and dry-skirt rules. Recompute corridors, pass/crossing use, site access and stats; compare against the baseline. Apply the approved candidate through the generator, never by hand-editing world.json. | World validation passes; protected locations remain usable; every retained pass/crossing has an actual open connection; lake inlet/outlet continuity and protected shore access hold; no unexpected relocated/deleted records. Blueprint/world synchronization passes. |
| [ ] MR4 Runtime checks and playtest | Check terrain, cliff/rim/corner placement, high-ground biome selection, lake-bank fit/rounding and water transitions, water/source joins, prop blockers and movement along the new ranges/shores. Tim tours central/northern/dry ranges, both lake shores and affected passes/crossings using the existing playtest setup. | Focused Node checks pass and Tim accepts shape, art and traversal. Report pre-existing failures separately; no blanket all-tests-pass claim. |
| [ ] MR5 Refresh atlas and handoff | Rebuild the effective blueprint/reference and inspect changed terrain/feature overlays. Produce a new versioned illustration from that reference using the accepted style; compare registration before atlas UI integration. | Freshness gate passes; Tim approves the updated map art/alignment. Retain old illustration as a style/history source, not current geography. Return to atlas UI, actual bridge/ford art/fitting, then W4. |

**Applied implementation (2026-11-03):** the base blueprint is unchanged. The authored reshape overlay composes geometry and pins all locations before overrides/derived routing; no placement RNG is rerun. Variable-width sampled range spines/spurs and irregular lake outlines include compatibility bounds. `seed_world.mjs --output <candidate.json> --preview <candidate.png>` validates before any write; protected-point drift rejects the build. Base-blueprint fingerprint changes require explicit overlay rebase/review. The ordinary-prop rounding fix validates emitted coordinates before land/ownership checks. No shader, economy, combat or density changes.

**Implementation guardrails:**

- **Ashen Wash (V4):** include a few broad, asymmetric meanders through the drylands in MR1's before/after proposal; avoid a straight diagonal, regular sine wave or tightly pinched bends. Keep source and mouth anchors, general valley corridor, river identity and existing width/taper behavior. Preserve the six V4 ford IDs and their usable connections; if crossing coordinates must follow the new channel, show each proposed shift and affected route in the approval preview rather than leaving markers at the old river. Keep protected shore locations clear. Update river points, rasterized channel, crossing metadata, derived routes and atlas overlays together in MR2–MR4. Other rivers remain unchanged except already-approved join fixes; source-pool redesign is still separate.
- Existing `blueprint.py` computes passes, water sources and procedural placements from terrain and shared random sequences. Do not simply edit `RANGES` and overwrite its outputs: that could move unrelated content. MR2 must explicitly preserve those placements and report deltas before MR3 writes live outputs.
- Current range metadata uses spines/half-widths. If variable widths or secondary ridges require a schema extension, update the blueprint producer, `seed_world.mjs` and range-art selection together; terrain rows and range metadata must describe the same mountains. Keep simulation pure and seeded; use existing art and placement systems.
- Lake outlines must be authored/reproducible, rasterized into the authoritative terrain and reflected in lake metadata. Audit radius-only consumers before introducing an outline/width schema; retain compatible bounds or update consumers explicitly. Keep water continuous without thin artificial necks, isolated water specks or stranded shore features. Preserve marsh character and existing inland-bank widths unless a geometry fix is demonstrated. Tiny source tarns and full river-source redesign remain separate.
- Pass approaches need usable clearance on both sides. River sources must remain connected to their actual channels; do not invent waterfalls, cut rivers off with new mountain cells, or widen crossings silently. Full source-pool redesign and new bridge/ford art remain separate work; the two main-lake outlines/widths are included here.
- Review the **effective** result after overrides and generator repairs, not only the raw design mask. Current source/world reproducibility is confirmed with the active authored reshape overlay; keep `node tools/seed_world.mjs --check` as the synchronization gate.
- No new art generation until the new mountain/lake geography passes MR4. Existing atlas freshness must fail after source/world changes until references are rebuilt. A source hash alone does not certify illustrated geography.

**Targeted files:** `docs/images/frontier/blueprint/blueprint.py` and its generated JSON, `game/data/world_overrides.json`, `tools/seed_world.mjs`, generated `game/data/world.json`, and range-art helpers/config only where the new shape requires them. Reuse `tools/prepare_atlas_reference.mjs` for current effective previews. Do not change combat, economy, discovery rules, clustering density or the accepted water shader for this phase.

**MR4 checks:** `validateWorld`/`test_world_data.mjs` and `test_frontier_world.mjs` for world/access invariants; `test_island_edges.mjs`, `test_p3_edges.mjs`, `test_inland_banks.mjs` and `test_world_coast.mjs` for terrain/water/movement; `test_world_paint.mjs`, `test_chunk_gen.mjs` and `test_prop_clusters.mjs` for streamed ground/props. Add one focused reshape regression for protected-record preservation, pass/source connectivity and deterministic output. If terrain fixtures need relocation, first demonstrate that their invariant still holds; do not weaken old assertions to obtain a pass. Run only relevant checks during implementation, the listed set at the phase checkpoint, then manual review; no browser automation or broad simulation runs.

**MR5 progress (2026-11-03):** current reference v2 and post-reshape illustration trial v2 are saved; source v1 remains preserved. Tim confirmed the geography appears in game and looks nice. Tim approved the v2 art look. Full overlay/runtime alignment and detailed traversal coverage remain open.

**Each phase:** update its box only after its exit check; Docs keeper commits completed work locally, no push. Stop for the two design/art approvals and the runtime playtest. MR1 design approval is recorded; MR4 manual acceptance and MR5 new artwork remain pending.

### Atlas reference checkpoint (2026-11-03)

- [x] Step 1: combined current blueprint preview and freshness gate; 14,000 × 8,000 world units map to a north-up 2,800 × 1,600 artwork rectangle with no padding or crop (5 units/pixel).
- [x] Step 2a: save exact illustration prompt and generate one terrain-only trial with the built-in image tool (2026-11-03). Native output 1659 × 948, correct 7:4 aspect; source preserved without resizing.
- [x] Step 2b style: Tim likes the trial's illustrated look (2026-11-03).
- [ ] Step 2b geography: mountain/lake reshape is applied and reference v2 refreshed; updated illustration v2 is generated; Tim approved the v2 look; full overlay/runtime alignment acceptance remains pending. Current v1 is a style trial; it has not been accepted as final runtime geography. [Trial manifest](../assets/environment/island/atlas/atlas_illustration_manifest_v1.json).
- [x] Step 3 build (2026-11-03): Tim chose Map first. Installed the native v2 illustration with a compact top rail, shared marker/key geometry and counts, exact zone/biome/grid/coordinate hover, layer switches, Fit island and Your location. Full terrain is visible; sites/camps/resources require discovery. All 9 bridges (H), 8 fords (X) and 20 passes (hollow diamond) show when Crossings & passes is enabled, with matching key and type/ID hover. Zone names uses the named blueprint regions confirmed by Tim, with collision-aware labels and persistent region hover. Fixed World CSS overriding the closed/hidden state; travel/details now occupy a row above the map within the viewport, without scrollbars. Closing clears pending travel/pin drafts. No live units/camera footprint; City/minimap behavior retained. Focused atlas, world-map and command-UI checks pass, including marker locations, zone labels/bounds/hover and hidden-state CSS priority.
- [ ] Step 3 playtest: Tim calls the runtime map phenomenal (2026-11-03); refresh/review crossing/pass markers, zone labels, closing via button/M/Esc and the travel bar placement. Retain full artwork/overlay alignment, layers/key, hover, discovery, pins, pan/zoom/location/fit, dev travel and City checks. No browser automation; Tim checks the look. Illustration aspect/coordinate registration alone does not certify every painted feature matches the world.
- [ ] Linked crossing phase: actual bridge/ford art and world fitting; reference records 9 bridges and 8 fords, without claiming those 17 records have been fitted or validated as usable crossings.

Reference roles (current revision v2; v1 retained as historical style-trial input): `atlas_blueprint_v2.png` is the clean artwork input; `atlas_registration_v2.png` adds data features in the same rectangle. `atlas_review_v2.png` has a separate 240px header/legend and must not be used as the artwork target. `atlas_effective_blueprint_v2.json` is a generated combined structural snapshot, not an editable second source. `atlas_features_v2.json/.svg` preserve exact positions for later overlays. Full terrain/feature review references include undiscovered records; that does not authorize exposing undiscovered sites in the game UI.

Runtime registration: `game/data/world_atlas.json` records the installed `game/art/maps/world_atlas_v2.png`, exact world bounds and source hashes. After structural/painting changes, refresh the reference, run `node game/tools/test_world_atlas.mjs` and review/regenerate the illustration before updating these hashes. The reference freshness command does not replace or certify the painting. Original illustration/reference versions remain preserved.

## Basic campaign loop pass (approved, 2026-11-03)

Tim approved a broad functional **explore → found → gather → build → fight** build using existing art and simple readable UI: "yea can you do it in phased checkpoints" (2026-11-03). Approval persists across the Claude handoff; no repeat build-permission request is needed within this scope. Reuse built F2 economy and F4 town controls. These are slices through the existing phases below, not replacement systems or permission to mark whole phases complete.

| Slice | Deliverable | Exit check |
|---|---|---|
| [x] Loop 1: usable wilderness (built 2026-11-04, Tim OK to commit) | Finish the atlas refresh check and basic crossing fitting; add authored W4 camps, node/site props and scouting with existing assets. Carry required campaign city-away safeguards from C into the prerequisite work. | Explore, cross rivers/passes, find resources and scout a founding location; camp claims survive unloading/save-load. |
| [x] Loop 2: expedition and founding (built 2026-11-04, Tim OK to commit; E5 stand-in art) | E2–E5: hire settlers at HQ, escort them, found on valid buildable ground using the settled E1 rules, and draw a starter town from its real settlement record. | One real expedition creates a persistent owned town; invalid founding changes nothing. |
| [ ] Loop 3: gather and build | Build the town design in [Loop 3 design](#loop-3-design-tim-2026-11-04): town grid with a big core, housing/farm/work zones with health and housing growth stages, placed buildings (town hall, storehouse, node camps, stockade, gates), town roads and the trap check, workers as shuttle records, small resource spots plus rich deposits, and the build bar (mock first). Step cards are written in detail just before the loop is built. | Workers carry stock from spots to drop-offs; construction spends stock and work; zones grow, abandon and recover; finished buildings change town output/capacity. No manual resource grind. |
| [ ] Loop 4: complete the playthrough | Use existing hero/crew combat against W4 camps, persistent rewards, resupply and basic town defence. Exercise departure, founding, production, construction and fighting in one save. | Complete the loop through ordinary commands; save/load and walk away/return preserve outcomes. Players and bots use the same rules. |
| [ ] Loop 5: scale the functional world | Increase representative active camps/units and founded towns in the canonical playtest setup; measure sim, chunk/render cost and UI responsiveness. | Report measured limits and fix the first actual bottleneck before increasing load again. Distant towns keep correct economy without permanently active chunks. |

Keep new character/building art, full inter-town trade/shipments, strategic army battles, sieges and native/story expansion in their existing later cards unless a real prerequisite is identified. First combat here is hero/crew against camps, not a claim that F6/F7 are complete. Keep all new rules in the sim, tuning in data, state saveable and structural edits blueprint-first. Commit each tested slice locally and stop at its playable checkpoint for Tim's review. Reuse the existing save and test setup; do not reset the capital save.

**Build order (Tim, 2026-11-04):** finish Loops 3 and 4 first (one playable save). After each loop, tick the phase steps it really closed. Then continue the phases as "deepen" passes (F3, rest of F5, F6, F7). Loop 5 (scale) runs after F3.

### Loop 3 design (Tim, 2026-11-04)

Settled in the design session "Add build detail to frontier plan" (Tim: "yes that is everything all perfect"). Replaces the earlier Loop 3 design notes; the node-count question is answered by Resources below. Numbers are placeholders in `frontier.json`.

**Town building**
1. **Core rule.** Zones decide HOW MUCH a town makes; placed buildings decide WHAT it can do.
   - Zones (grown): housing, farm, work for now (more kinds later). Output = painted cells × zone level × zone health. Buildings in a zone are its look (stage and variety), not separate rules.
   - Placed (one by one, RTS style): town hall, storehouse and drop-offs, node camps, walls, gates, stockade, and anything with a menu (barracks, market, shrine, clinic). Click one to train workers or units, upgrade its tier or research tech. Warfare uses the same placed pattern.
   - The governor fills whatever the player hasn't placed or zoned, and never repaints the player's cells.
   - Today's types map to: house → housing zone, farm → farm zone, workshop → work zone; lumber_camp and quarry → placed node camps (drop-offs); town_hall, storehouse and stockade are placed.
2. **Zone health** = needs met (food, workers, road access). Healthy zones grow; only housing grows in stages for now (hut → house → bigger house). A zone short of needs for N economy ticks is abandoned: empty, no output; it recovers when needs return, nothing is destroyed. Building looks show zone health. Later, a zone's level unlocks options when clicked.
3. **Town hall tiers.** Upgrades on resource/tech goals unlock the next tier of buildings, zones and tech (ties into the F6.1 tiers). The core area and grid grow with the tier.
4. **Grid.** A grid of cells around the town hall replaces the spiral slots in `sim/frontier/town_layout.js`. 1 cell = 1 small building; big buildings take 2 × 2. The grid covers the town's 600-unit work range. Housing and work zones go only inside a core around the hall; the starting core is pretty big, so layouts vary and the town isn't just a clump. Farm zones go anywhere in the grid with a road, with a bonus on fertile land. Beyond 600 units a farm is a placed farmstead camp (same rule as F5.7 work camps).
5. **Construction phases:** cleared → frame → finished. Stock is paid at the start, then workers and time. Overgrown cells are cleared by workers automatically. Founding paints a cleared-ground patch under the new town; the current dirt-trail ground patch is the stand-in for the clearing texture.
6. **Build bar (town panel).** Roads, walls, zone brushes (housing, farm, work), eraser, plus the placed buildings. Click-drag rectangles; the ghost is green (allowed) or red with the reason; right click or Esc cancels. Buildable ground only, not road or water. Zone cells grow only within a few cells of a town road ("needs road" otherwise). Farm cells become crop fields with a farmhouse every few cells. The zone tint shows only while the build bar is open, plus a health tint overlay. Clicking a building shows a tooltip: what it is, its zone, its state and the zone's state. Mock first, Tim approves before building.
7. **Roads and walls for Loop 3:** town roads, stockade ring, gates and the "would trap" check. World roads wait for F3.

**Workers**
8. Houses give people; the town hall trains workers. Each worker is a saved record `{ node, dropoff, phase 0-1, carrying }` shuttling between a resource spot and the nearest drop-off (town hall, storehouse, node camp). Output = loads per round trip, so distance matters.
9. Off screen the sim advances `phase` with math. When a player, bot army or raid comes within about 3 screens (number in data), records become real walking units at their phase and carrying state, so they are already there on arrival; they turn back into records when everyone leaves. Many workers can spawn over a few ticks, or one record can stand for a small group. Same records for every player and bot.
10. Workers can only be attacked while their area is loaded.
11. The governor sends idle workers to the nearest needed spot. Player RTS control (select workers, right-click a spot) is built early, for when the player manages the town.

**Resources**
12. Two layers:
    - **Small spots everywhere** (new): timber 5-20 trees, stone 2-5 rocks, fish 2-4 shore markers, optional forage 3-6 bushes. Real added props, auto-clustered by a seeded tool and placed on top of the existing art (the tool clears natural props under each cluster; other natural props stay as they are). Size = amount. Fixed all over the map (not spawned at founding), drawn only in nearby chunks.
    - **Rich deposits** = the existing 107 nodes: much higher yield, worth far work camps and fighting over; ore (gold later) comes only from deposits. Same piece system with bigger, rarer art (old-growth forest 20-40 trees, quarry face 6-10 rocks); always on the maps once discovered.
    - Food comes mainly from farm zones (fertile bonus) plus fishing.
13. Harvest stages per piece: tree full → stump → sapling → full; rock full → chipped → rubble → slowly back. The last piece never drops below a trickle (never runs dry, no grind).
14. The tool writes a generated data file the sim reads (the sim owns locations, art follows). It prints a coverage report (every buildable spot has some timber and stone within 600 units, less timber in dry lands); Tim OKs the numbers. Only worked spots are saved (changes-only list).
15. Hover: a small twinkle (not a glow) and a tooltip (kind, amount left, state, who works it). The minimap shows spots only nearby or zoomed in; the World map has a layer toggle; fog applies.
16. Until the tool exists, forest terrain counts as timber anywhere, plus a small node bump. Core resources already work at full speed anywhere and nodes add up to +60% each (Loop 2 follow-up). Later pass: a fuller RTS resource system (gold, ore, more kinds).

**Feel (later brainstorm):** visible workers carrying goods, production chains and builders walking to sites, Settlers style.

**Still open (placeholders, not blockers):** numbers (worker cost and training time, core size, zone growth speed, spot yields, tier goals); art (spot and deposit pieces with harvest stages; stand-ins from existing props until then); the build bar mock.

### Loop 3 build cards (Tim OK, 2026-11-04)

Built from the Loop 3 design above. These cards replace the old F5.1–F5.4 and F5.x detail for this loop; F5 keeps its later cards (F5.5 art, F5.7 work camps). Tim's answers (2026-11-04): once a town has workers, idle `forage` stops (L3.5); old towns migrate to the grid (L3.1, L3.3); the test starter frontier towns stay for now and are removed after E6 (card E6b). Card format and rules: `docs/step_runner_guide.md`.

#### Shared for every Loop 3 card

**Reads:** START_HERE.md, docs/usage.md, step_runner_guide.md, the whole plan, the card, and the
files the card names. Function lists only (grep `^export\|function `) for anything else.

**Code that exists today (verified 2026-11-04):**
- Hub `game/src/sim/frontier/frontier.js` `createFrontier`: `modules` list, each with
  `econTick(ctx)` and/or `command(e, c, ctx)`; economy runs every `data.cadenceTicks` sim ticks.
- `construction.js`: `queue(sid, type, cell, opts)`, `authorize`, `cancel`, `finish`, `econTick`
  (one project at a time, pays stock, then `progress += s.builders`).
- `economy.js`: `assignJobs`, `produce` (output per worker x `traitFactor`), `forage`, `eat`,
  `grow`, `review`. `governor.js`: `rules`, `promote`, `review`, `approve`.
- `commands.js` actions: `setPriority setBudget setAutoBuild approveSuggestion setTax authorize
  cancel queue`. `founding.js`: `siteTraits`, `createFounding`.
- `town_layout.js` `townSlot(i)` spiral, spacing 11 units, used by `construction.queue` (cell = int)
  and `game/src/town_props.js` (`townProps`, `townPlots`, `plotInfo`).
- `game/src/sim/camps.js` `suspend(rec)` / `wake(c, rec)`: the pattern for records that become
  units when their chunk is active (`areas.js` `loadRadius`). `game/src/world_features.js`
  `nodePropsInChunk`, `siteReport`, `featureTip`.
- `frontier.json` buildings: town_hall house farm lumber_camp quarry workshop storehouse stockade.
- Controls panel: `game/index.html` line ~508, section `<h4>Frontier towns</h4>`.
- Screen width is about 52 world units, so "3 screens" is about 160 units.

**Do not touch (any Loop 3 card):** `world.json` (generated; nodes are read, never edited),
`world_paint.json`, `biome_props.json` and `sim/prop_clusters.js` (natural props stay as they
are), `sim/camps.js` (copy its pattern, don't edit it), combat, bandits, city code, the atlas and
shaders, the capital save. `sim/game.js`: one hook line per card at most, named in the card.

**Every checkpoint:** game starts, the card's test passes, the regression set has no new failures,
changed browser files pass the `.mjs` syntax copy, and a one-line done note goes to the
coordinator. All new numbers go in `frontier.json` with `"_note": "placeholder, Tim to tune"`.

**Save shape:** bump `frontier.json` `version`. `world.js` migrates old towns when it loads (spiral
slot -> grid cell at the same world spot; house/farm/workshop -> 1-cell zones; L3.3).


#### L3.0. Build bar mock and numbers  [TIM] — [x] done 2026-11-04 (Tim: "all perfect")
A SMALL thread makes one mock image of the town panel build bar (Road, Wall, Gate, Housing, Farm,
Work, Eraser, placed-building picker), a ghost rectangle (green and red with a reason), the zone
health tint, and a building tooltip. It also lists every placeholder number from L3.1–L3.6 in one
table. Tim approves the mock and the numbers before L3.7/L3.8. L3.1–L3.6 can start before this.

#### L3.1. Town grid  [SMALL] — [x] done 2026-11-04 (Tim: "all perfect")
Needs: Loop 2
Files: new `game/src/sim/frontier/town_grid.js` (pure), `construction.js` (`queue` default cell),
`world.js` (migration), `founding.js` (grid at founding), `game/src/town_props.js` (positions),
`frontier.json` (`townGrid`), new `game/tools/test_town_grid.mjs`.
Do:
  1. `frontier.json` `townGrid: { cellSize: 11, radius: 600, coreRadius: 250, corePerTier: 100 }`.
  2. `town_grid.js` exports `gridSize(data)` (cells per side), `cellToWorld(s, i)`,
     `worldToCell(s, x, z)`, `inCore(s, i, data)`, `makeGrid(s, worldData, data)`.
  3. `settlement.grid = { n, ground, use, zone, by, stage }`. Each is a string of `n*n` chars:
     ground `x` unbuildable, `o` overgrown, `c` cleared; use `.` free, `r` road, `w` wall, `g` gate,
     `B` building; zone `.`, `h` housing, `f` farm, `k` work; by `.` none, `p` player, `g` governor;
     stage `0`–`3`. Strings, not arrays, keep saves small.
  4. Founding calls `makeGrid`, which marks water, mountain, river and marsh cells `x`. The town
     hall takes the centre cell (`B`).
  5. Buildings and projects keep `cell` as a grid index. `queue` without a cell takes the nearest
     free cleared core cell. `town_props.js` uses `cellToWorld` in place of `townSlot`.
  6. Migration: an old town's spiral cells are moved to the grid cell under the same world spot.
     `town_layout.js` stays for that migration only.
Check (pass/fail): `cellToWorld`/`worldToCell` round-trip; founding over a lake edge marks those
cells `x`; a migrated old save draws every building within half a cell of its old spot; the grid
survives save/load; `queue` never picks an `x` or used cell.
In game (Tim): the town looks the same as before.
Done note: "L3.1 town grid in."

#### L3.2. Place and remove, with the trap check  [SMALL] — [x] done 2026-11-04 (Tim: "perfect")
Needs: L3.1
Files: new `game/src/sim/frontier/placement.js` (module in `frontier.js` `modules`),
`commands.js` (route the actions), `frontier.json` (`size` per building, `placeCosts`), new
`game/tools/test_frontier_place.mjs`.
Do:
  1. Action `{ type: 'frontier', action: 'place', town, kind, cells: [i, ...], dryRun }`. `kind`
     is `road`, `wall`, `gate` or a placed building type (`size` 1 or 2 means 1x1 or 2x2).
  2. Receipt `{ ok, reason, cost, cells }`. Reasons: `outside grid`, `unbuildable`, `occupied`,
     `core only`, `would trap`, `cannot afford`. `dryRun` changes nothing.
  3. Trap check: flood-fill from the gates (and from the grid edge while there are no walls) over
     roads, gates and free cells. Reject if any building or zoned cell loses every path.
  4. Overgrown cells are cleared by workers as part of the job (L3.3 work order), never by hand.
  5. A placed building queues a normal project (`construction.queue` with the cell). Its phases
     are cleared, frame, finished (`project.phase`), with stock paid at the start (unchanged).
  6. Action `remove { town, cells }` (the eraser): it removes roads, walls, gates, zones or an
     unbuilt project (refund rule unchanged), and never the town hall.
  7. The governor's placements use these same actions, with `by = 'g'`.
Check (pass/fail): a wall ring with no gate is refused (`would trap`) and the same ring with a gate
is accepted; a dry run changes no state (deep-equal before and after); a road cut that strands a
house is refused; a 2x2 building over one used cell is refused; every refusal changes nothing.
Done note: "L3.2 placement and trap check in."

#### L3.3. Zones, health and growth  [STRONG] — [x] done 2026-11-04 (Tim: "perfect")
Needs: L3.2
Files: new `game/src/sim/frontier/zones.js` (module), `economy.js` (zone output replaces
house/farm/workshop building output), `world.js` (migration), `governor.js` (auto-zone),
`frontier.json` (`zones` block), new `game/tools/test_frontier_zones.mjs`.
Do:
  1. Action `zone { town, kind: 'housing'|'farm'|'work', rect: [c0, r0, c1, r1] }`. Housing and
     work go in the core only; farm goes anywhere in the grid. Cells are on buildable ground and
     not used. `by = 'p'`. The eraser (`remove`) unzones.
  2. `frontier.json` `zones`: per kind, `needs` (food, workers per cell, road within `roadReach`
     cells), `output` per cell per level (housing: people; farm: food; work: goods recipe),
     `stages` (housing: hut, house, large_house), `growTicks`, `abandonTicks`, fertile bonus.
  3. Each review, per zone kind: health 0–1 from needs met. A cell grows one stage after
     `growTicks` healthy economy ticks. After `abandonTicks` short, the cell is abandoned: no output
     or housing, `stage` kept, recovers when needs return. Nothing is destroyed.
  4. Output = sum over cells of (stage level x health x per-cell rate x trait factor). The farm
     fertile bonus uses `traitEffects`. Cells with no road within `roadReach` stay at stage 0 with
     `waiting: 'needs road'`.
  5. Migration: an old `house`, `farm` or `workshop` building becomes its zone kind on its cell at
     the matching stage, so a migrated town gives the same totals within 5%.
  6. The governor zones cells (`by = 'g'`) only where `by == '.'`, never over `p` cells, near
     roads, following its existing priority rules.
Check (pass/fail): a housing zone next to a road grows hut -> house -> large_house, while one
with no road stays at stage 0 with `needs road`; starving a farm zone for `abandonTicks` sets its
output to 0, and refeeding it recovers it; the governor never changes a `p` cell; a migrated old
save keeps pop, food and goods totals within 5% over 100 economy ticks; no zone kind or number is
hard-coded.
Done note: "L3.3 zones, health and growth in."
Built notes (2026-11-04): the town hall counts as a road for zone growth (`hallIsRoad` in `frontier.json`); farm zones skip the food need; ground clearing for placed buildings is still instant in `construction.js` until the L3.5 worker order.

#### L3.4. Resource spots tool  [SMALL, then TIM numbers] — [x] done 2026-11-04 (Tim OK'd the numbers as they are)
Needs: none (can run beside L3.1–L3.3)
Files: new `tools/seed_resource_spots.mjs`, generated `game/data/world_spots.json`, new
`game/src/sim/resource_spots.js` (pure lookups), new `game/tools/test_resource_spots.mjs`.
Do:
  1. A seeded tool reads `world.json` (terrain, biomes, nodes) and writes `world_spots.json`:
     `{ version, seed, chunkSize, spots: [{ id, kind: 'timber'|'stone'|'fish'|'forage', x, z,
     pieces: [[dx, dz, variant], ...], deposit: <nodeId>|null }], byChunk: { <chunkId>: [ids] } }`.
  2. Sizes: timber 5–20, stone 2–5, fish 2–4 (shore cells only), forage 3–6. Each of the 107 nodes
     becomes a deposit spot (timber 20–40, stone 6–10, ore, fertile, fishing) at its position.
     Density and biome rules go in a `spots` block in the tool's config, for Tim to OK.
  3. Coverage report printed by the tool: the share of buildable land with timber and with stone
     within 600 units, by biome. The tool never places on unbuildable cells or on roads/passes.
  4. `resource_spots.js`: `spotsInChunk(id)`, `spotsNear(x, z, r)`, `spotYield(spot, stateStr)`.
     Worked spots save as `state.frontier.spots[id] = '<one stage char per piece>'`; unworked spots
     save nothing. Each piece is `f` full, `h` harvested, `s` sapling (rubble for stone). It
     regrows each economy tick at a data rate. The last piece never drops below a trickle.
Check (pass/fail): two runs give byte-identical output; no spot sits on an `x` cell; fish spots are
within 2 cells of water; every node has exactly one deposit spot; `spotYield` is never 0;
`tools/seed_world.mjs --check` still passes (world.json untouched).
In game (Tim): read the coverage report and OK the numbers.
Done note: "L3.4 resource spots data in (coverage report attached)."

#### L3.5. Workers (records and trip math)  [SMALL] — [x] done 2026-11-04
Needs: L3.1, L3.4
Files: new `game/src/sim/frontier/workers.js` (module), `commands.js`, `economy.js` (gathering
output comes from workers; `forage` stops once a town has a worker, Tim OK), `governor.js`
(assign idle workers), `frontier.json` (`workers` block), new `game/tools/test_frontier_workers.mjs`.
Do:
  1. Action `train { town, count }` at the town hall: costs ryo and takes 1 person each (data); the
     worker is ready after `trainTicks`.
  2. Record `settlement.workers[] = { id, spot, dropoff, phase, carrying, entity: null }`. The
     drop-off is the nearest placed town hall, storehouse or node camp. Phase 0–1 is one round trip:
     walk out, harvest `harvestTicks`, walk back, unload `load` into stock (ledger reason `gather`).
  3. Each sim tick off screen, `phase += dt / roundTripSeconds`, where roundTrip =
     `2 * dist / speed + harvest`. Integer math on ticks keeps it deterministic.
  4. Action `assign { town, workers: [ids], spot }` (the player's RTS order). The governor assigns
     idle workers to the nearest spot of the kind the town is shortest on.
Check (pass/fail): a worker twice as far delivers half as many loads (within 1); stock gained
equals loads x `load` (conservation); save mid-trip and load, then the same tick delivers as a
straight run; `assign` to an unknown or far spot is refused and changes nothing.
Done note: "L3.5 workers in (records and trip math)."

Built (2026-11-04): sequential training reserves ryo/population; saved integer-tick trips carry stock to the nearest finished drop-off and ledger it as `gather`. Governor assigns idle workers; worker records clear placed-building footprints over time; forage and passive node-camp output stop once workers exist. Added startup spot-data wiring and additive worker-state migration; frontier.json version 5 (Tim approved updating the existing version assertion). Workers remain records; no new UI controls until L3.8. `test_frontier_workers.mjs` and 12 affected frontier/founding tests pass; browser entry/game syntax checks pass. Next: L3.6, preserving trip/cargo timing and clearing behavior.

#### L3.6. Workers become units near players  [STRONG] — [x] Node checks passed 2026-11-04; visual check pending
Needs: L3.5, W3 areas
Files: `workers.js` (`wake` / `suspend`, the pattern copied from `sim/camps.js`), `sim/game.js`
(one hook line next to the `createWorldCamps` setup), `frontier.json` `workers.spawnRadius`
(placeholder 160 units, about 3 screens), `game/tools/test_frontier_workers.mjs`.
Do:
  1. When any player unit, bot army or raid is within `spawnRadius` of a town or spot, its workers
     become real units (non-fighting, a civilian sheet, `e.worker = <id>`). They start at the
     position and load their `phase` gives along the cached path, at most `spawnPerTick` per tick.
  2. They walk with `areas.nav`. On arrival they update `phase` and `carrying` from the unit, and
     unloading credits stock exactly as the math does.
  3. When nothing is near, the unit turns back into its record with its phase (`suspend`).
  4. A loaded worker can be hit. One that is knocked out is removed from the record (gone, like a
     settler). An unloaded record can never be hit.
Check (pass/fail): 200 economy ticks with the hero standing in the town and 200 with the hero away
give the same stock (within 1 load per worker); suspend then wake puts each worker within 1 unit of
its path position; no unit exists when nobody is within `spawnRadius`; a killed loaded worker
removes exactly one record.
Done note: "L3.6 workers walk when someone is near."

Built (2026-11-04): workers wake as non-fighting laborers near activity, walk cached fine paths, and suspend with trip, cargo and wounds preserved. A loaded casualty removes one record. `areas.js` also needed worker residency exclusion and path planning for sleeping trips; workers cannot keep chunks awake. The worker test covers proximity, navigation, near/away production parity, save/load, clearing, rerouting and casualties. Relevant frontier, areas, camps, combat, inventory, business, bot, worker and settings checks passed. `test_crew.mjs:97` failed identically before and after (teahouse vs street). Visual verification remains open; next L3.7.

#### L3.7. Drawing the town and the spots  [STRONG] — [x] Node checks passed; visual check pending
Needs: L3.3, L3.4, L3.0 mock OK
Files: `game/src/town_props.js`, `game/src/render/world_ground.js`, `game/src/minimap.js`,
`game/src/world_map.js` (Spots layer toggle), `game/data/art.json` (stand-in pieces and stages),
`frontier.json` `townArt` (stages per zone kind).
Do: draw the cleared patch, roads, walls, gates and crop fields from `settlement.grid`; zone
buildings by stage from existing cutouts; abandoned cells drawn run-down (a darker tint and no
lights); spot pieces by stage using existing tree/rock props as stand-ins; a small twinkle on hover
(no glow). The minimap shows spots within its view only when zoomed in; the World map gets a Spots
layer; discovery and fog apply. Render reads the snapshot only.
Check (pass/fail): `.mjs` syntax copies pass; a pure helper `townCellsToProps(grid)` is tested.
In game (Tim): the town, its fields and its spots read clearly; harvested trees show stumps.
Done note: "L3.7 town and spots drawn."

Built (2026-11-04): grid-derived town, construction and zone-stage art; resource pieces by harvest stage, hover twinkle and card, discovered/zoomed minimap spots and World Spots layer. Snapshot sends the own town grid and discovered changed spot states. Existing art only; no navigation or harvesting changes. `test_town_drawing.mjs` and relevant worker, frontier, map and sim checks pass; syntax/diff checks pass. Pre-existing failures: `test_crew.mjs:97` (teahouse vs street) and `test_town_world.mjs:20` (`zone:h` art assertion), both reproduced before and after. Visual review remains pending with L3.6; next L3.8. The card's file list omitted main/view/game-map wiring and the snapshot seam.

#### L3.8. Build bar, tooltips and worker orders  [STRONG] — [x] Node checks passed; visual check pending
Needs: L3.2, L3.3, L3.5, L3.0 mock OK
Files: new `game/src/frontier_build_ui.js`, `game/src/frontier_panel.js` (bar host),
`game/src/input.js` (pointer handlers only), `game/index.html` (Controls rows), `game/src/frontier_tips.js`.
Do: the build bar per the mock. Drag a rectangle to get a ghost from `place`/`zone` dry runs,
green or red with the reason under the cursor. Right click or Esc cancels. The zone tint and health
overlay show only while the bar is open. Clicking a town building or zone cell shows a tooltip
(what it is, zone, its state, zone state). Clicking a spot shows its kind, amount left, state and
workers. Workers can be selected like crew; right-clicking a spot sends `assign`.
Controls rows (Frontier towns section):
- "Build bar (town panel)": Road, Wall, Gate, zone brushes, Eraser and buildings; drag a rectangle,
  green = allowed, red shows why; right click or Esc cancels.
- "Click a town building": what it is, its zone, its state and the zone's health.
- "Select workers, right-click a resource spot": send them to harvest there; they shuttle by themselves.
Check (pass/fail): syntax copies pass; dry runs are covered in `test_frontier_place.mjs`.
Done note: "L3.8 build bar in (controls.md lines needed)."

Built (2026-11-04): build-bar tools, simulation-backed placement previews, zone/health overlay, inspectors, worker training and selection/assignment. Controls are in the in-game panel and controls.md. `test_frontier_build_ui.mjs` and relevant frontier, worker, input and shared sim checks pass; syntax/diff checks pass. The old `test_crew.mjs:97` failure is resolved by correcting its arrival fixture, with existing assertions retained. `test_town_world.mjs:20` remains a pre-existing `zone:h` art assertion failure. L3.9 visual playtest is pending. Pointer wiring required main.js and a small crew_input cancellation seam beyond the card's file list.

#### L3.9. Playtest  [TIM]
Found a town, paint housing and farm zones, lay roads, ring it with a stockade and a gate, try to
wall yourself in (it should refuse), train workers and send some to a timber spot, walk away and
come back, and watch zones grow, then starve and recover.

**In-progress checkpoint (2026-11-04):** Tim accepted house/plot spacing, clearing look, inspector dismissal, build review/confirmation, fence placement except corners, night readability and town selection. Changes include worker groups/move/hold and stalled-route recovery, full Eraser refunds, food-warning fixes, completed-structure collision, training quantities and batch hiring. Some latest interactions still need targeted and manual QA. This is not Loop 3 acceptance.

**Additional manual playtest (2026-11-04):** Rounded plots; worker training menu, countdown/progress and confirmation; clear worker spawns around the town center; nearby discovered spots in the worker menu; worker selection and movement; harvesting and returning; growth of all three painted zone types; Eraser confirmation/refunds; clustered resource effects and cutdown graphics worked. Abandoned/low-health states appeared, but their reasons were unclear. Workers disappear beyond town/grid and get stuck on buildings: travel, visibility and pathing are not accepted. Safe founding and the full loop remain open. No new Node tests were run for this playtest.

**Dedicated fix phase before the next gameplay loop:**
1. Safety and performance: implement the founding ghost and completed-building unit clearance below; measure capital/frontier lag after teleport with many workers, including loaded workers, pathfinding and city activity, before choosing a fix.
2. Worker travel: fix building stalls and disappearance beyond the grid, keeping nearby workers visible through complete routes and suspending remote workers appropriately; separate move destinations about 1m or reuse crew spacing; prevent building footprints over small resource clusters/deposits.
3. Economy and explanations: reproduce roughly 30 timber gatherers versus six work tiles; audit yields, travel and inputs before adjusting bugs or balance. Add stock hover breakdown and Stock > Usage with active consumers, rates, state and purpose, plus click focus/double-click navigation as appropriate. Explain plot growth, health and abandonment blockers, dropoffs and stockade.
4. Selection and navigation: double-click worker/group menu entries to focus the camera; add worker main target pane, frontier minimap click navigation, and minimap workers and small discovered spots with tooltips, including workers outside the grid.
5. Harvesting and cargo: show harvest animation, collection increments/icons, progress and gathered amount; show carried resource/type/amount in the world and worker UI. Add Return resources, confirmed Drop resources with explicit loss and direct reassignment, and a red delivery notice with actual resource and amount.
6. Visual joins: fix fence corner half-span overshoots and add diagonal/45-degree joins (Tim can provide a screenshot); round road corners and improve dirt/gravel textures. Ford mosaic and bridge art remain separate.
7. Regression and manual acceptance: founding egress, complete worker trips/groups/cargo and conservation, usage and growth reasons, gates/completed collision, walking away and back, save/load, many workers and capital/frontier transition. Add new controls to the in-game Controls panel; preserve saves and use small, Node-tested checkpoints.

**Current economy behavior:** Completed town halls, storehouses, lumber camps and quarries are all eligible dropoffs; workers use the nearest without resource-type restrictions and delivery credits town stock immediately, with no second haul. Gather-building passive jobs/output are excluded once a town has worker records. Storehouses have no storage cap; stockade defense rules remain pending F6/F7. Any specialization is future design, not current behavior.

**First open issue:** founding currently places the completed hall at the hero's position; its new collision can trap the hero. Tim requested a mouse-following town-hall placement ghost after Found, with red invalid feedback for terrain, footprint and escape clearance; this is not implemented. Ensure any completed building cannot seal a unit inside. Until fixed, do not claim founding is safe. Final visual follow-ups: dirt/gravel road texture and fence-corner half-span joins; ford mosaic and bridge art remain separate.

**Remaining checks:** fresh founding/egress after the fix; worker groups, movement, stone/timber, cargo and stumps; batch training/hiring totals, cancel and progress; Eraser refunds and hall protection; finished versus unfinished collision and gates; food warning recovery; rounded/translucent visuals; walk away/return, save/load and zone growth/starvation/recovery. `test_frontier_followup`, `test_eraser_refunds`, `test_frontier_build_ui`, `test_frontier_workers`, `test_crew`, `test_founding` and `test_shinobi_hq_raid` passed at this checkpoint. Earlier related checks preceded some latest edits. `test_dismissal.mjs:61` fails on an Instant Taunt text expectation; its baseline has not been investigated. No full-suite or visual-acceptance claim.

**Loop end:** tests pass; Docs keeper commits "Loop 3: gather and build" and ticks the F5 steps it
closed (F5.1 grid, F5.2 placement, F5.3 zones, F5.4 controls, the F5.x zones card).

## Progress checklist

Tick a box (`[x]`) only when the step's check passes. A phase box is ticked after its commit and
Tim's "g2g". This list is the single source of where the build is; after any compaction or new
session, read it before doing anything else.

Build order (Tim, 2026-11-01: map first, campaign starts with founding):
F0 → F1 → W1 → W2 → F2 → F4 → W3 → W4 → C → E → F3 → F5 → F6 → F7 → W5 → S. (C5 waits for F3.) Phases appear in this order below.

- [ ] **F0** Ready: [x] F0.1 snapshot · [x] F0.2 numbers · [ ] F0.3 current playtests · [x] F0.4 season decision · [ ] F0.5 test state (partial: `dev_classic` and `dev_frontier` saves done via `game/tools/make_dev_save.mjs`; campaign and frontier saves wait for their phases; `test_params.js` stays until Tim sees the presets)
- [ ] **F1** Save/load: [x] 1.1 · [x] 1.2 · [x] 1.3 batches (list: done) · [x] 1.4 · [x] 1.5 · [x] 1.6 · [x] 1.6b · [ ] 1.7 playtest (Tim, deferred to the end)
- [x] **W1** World data: [x] W1.1 choices · [x] W1.2 · [x] W1.3 generate · [x] W1.4 steer · [-] W1.5 tool (skipped, not needed). Open: `world_names.json` review (names are drafts)
- [x] **W2** World map: [x] W2.1 mock · [x] W2.2 · [x] W2.3 · [x] W2.4 · [x] W2.5 playtest (passed, Tim 2026-11-02; waypoint skipped, Tim agreed)
- [x] **F2** Economy: [x] 2.1 · [x] 2.2 · [x] 2.2b · [x] 2.3 · [x] 2.4 · [x] 2.4b · [x] 2.5 · [x] 2.5b · [x] 2.6 · [x] 2.7 · [x] 2.8 · [x] 2.9 · [x] 2.10
- [x] **F4** Town panel: [x] 4.1 mock · [x] 4.2 · [x] 4.3 · [x] 4.4 · [x] 4.4b · [x] 4.4c · [x] 4.4d · [x] 4.5 playtest (passed, Tim 2026-11-02)
- [ ] **W3** Walkable world: [x] W3.1 · [x] W3.2 · [x] W3.3 · [x] W3.4 · [ ] W3.4b art (prompts drafted; broader art pass pending) · [x] W3.5 · [x] W3.6 · [x] W3.7 playtest (passed, Tim 2026-11-02) · [x] W3.8 original source generation (25/25 verified) · [x] W3.9 baseline implementation/import (checks passed) · [ ] W3.9 visual and biome-art integration follow-ups (see frontier campaign plan) · [x] W3.10 paint the island and fit the walkthrough art (Tim playtested 2026-11-03) · Follow-ups (W3.11): [x] P1 quick fixes (Tim playtested 2026-11-03) · [x] P2 maps (Tim playtest passed 2026-11-02) · [x] P3 edges and water (Tim accepted 2026-11-03) · [x] P4 coast cliffs and dry range (built 2026-11-03; Tim playtest passed 2026-11-03) · [x] P5 current biome art/import and clustering (accepted; later art backlog retained) · [ ] later: chunk and ground-paint speed-up
- [ ] **W4** Wilderness: [ ] W4.1 rules · [x] W4.2 · [x] W4.3 · [x] W4.4 · [ ] W4.5 playtest
- [ ] **C** City in campaign: [ ] C1 rules · [ ] C2 · [ ] C3 · [ ] C4 · [ ] C5 (after F3) · [ ] C6 playtest
- [ ] **E** Founding: [ ] E1 rules · [x] E2 · [x] E3 · [x] E4 · [x] E5 (sim and drawing done; stand-in art stays) · [ ] E6 · [ ] E6b · [ ] E7 playtest
- [ ] **F3** Roads: [ ] 3.1 · [ ] 3.2 · [ ] 3.3 · [ ] 3.4 · [ ] 3.5 carts · [ ] 3.6 raids · [ ] 3.7 plan road
- [ ] **F5** Town building: [ ] 5.1 · [ ] 5.2 · [ ] 5.3 · [ ] 5.4 · [ ] 5.5 art · [ ] 5.7 work camps · [ ] 5.6 playtest
- [ ] **F6** Armies: [ ] 6.1 choices · [ ] 6.2 · [ ] 6.3a · [ ] 6.3b · [ ] 6.3c · [ ] 6.4 · [ ] 6.5 · [ ] 6.6 · [ ] 6.7 playtest · [ ] 6.8 second slice
- [ ] **F7** Sieges: [ ] 7.1 rules · [ ] 7.2 · [ ] 7.3 · [ ] 7.4 · [ ] 7.5 · [ ] 7.6 playtest
- [ ] **W5** Exploration: [ ] W5.1 list · [ ] W5.2 · [ ] W5.3 · [ ] W5.4 · [ ] W5.5 playtest

Last completed: Map first atlas, crossing/pass markers, close/travel layout fixes and named-region labels (2026-11-03). Tim loves the map. Next: approved Loop 1 in phased checkpoints; latest close/travel/labels refresh check, basic crossing fitting, then W4. Recheck clustering performance under mobs/camps load; unfinished MR4 traversal checks and F1.7 remain deferred.

## Next coordinator handoff (Tim, 2026-11-03)

- **Loop 1 built (2026-11-04):** crossings checked (17, none moved; fords = painted gravel plus thinner water, bridges = plain plank decal, nothing new for walking; data in `world_crossings.json`, kept apart from `world_paint.json` because the atlas test hashes that file); W4 camps (`sim/camps.js`), node/site markers and ruin/cache landmarks (`world_features.js`), scouting report, minimap illustration/markers/tooltips, travel to marked places. **Not built yet:** ruin and cache rewards; node markers have no gathering until Loop 3. No new Controls entries (the "Show everything (test)" layer button is dev-only). Tests: `game/tools/test_camps_world.mjs`, `test_crossings.mjs`.
- **Future decision (Tim, 2026-11-04): deck-only bridges / impassable rivers.** Parked for the later update passes. The attempt (bridges open only their deck, rest of the river blocked) is in `to_delete/bridge_deck_attempt/` (see its NOTES.md). It needs `test_island_edges` to skip bridge cells, with care for wide rivers like V1-F3. For now rivers beside a bridge stay walkable within `rules.fordRadius`; ford art size 14 with wider mixed gravel (`world_crossings.json`).
- **Claude continuation:** Tim approved the basic campaign loop above, in phased checkpoints, then requested a usage-saving handoff. No campaign-loop implementation has started; the last action was plan/source reading. Begin Loop 1, not another planning/permission round. First small checkpoint: basic bridge/ford world fitting at the existing anchors, using existing assets; then W4 camp persistence/spawning, node/site props and scouting. Keep city-away safeguards from C as a prerequisite before sustained expedition playtests. Commit tested increments and stop at a playable checkpoint for Tim's review.
- **Current code:** `c82e166` installed the illustrated atlas; `d2ec151` made all 9 bridges, 8 fords and 20 passes visible in the atlas; `b1450ba` fixed hidden-state CSS priority and moved travel/details above the map with no scrollbars, plus a Zone names toggle using the blueprint regions (Saltwind Moor, Rust Mesa, etc., confirmed by Tim). `4a5b64f` added the loop proposal; this handoff records its approval. Worktree was clean before this handoff-only edit. No server/process was started.
- **Atlas acceptance/checks:** Tim repeatedly calls the map awesome/phenomenal; preserve the look. Latest close/travel/zone-label changes still need explicit refresh/manual verification; don't claim full interaction/traversal/alignment coverage. Focused `test_world_atlas.mjs`, `test_world_map.mjs`, `test_command_ui.mjs` and game-map syntax checks passed. Atlas code is in `game/src/world_atlas.js`, `world_atlas.css`, `world_map.js` and `game_map.js`; runtime painting/config are `game/art/maps/world_atlas_v2.png` and `game/data/world_atlas.json`. Existing crossing atlas symbols do not mean new in-world bridge/ford art is fitted.
- **Source contract:** MR0–MR3 applied; mountain/lake shapes and v2 illustration look accepted. Detailed MR4 traversal and MR5 overlay alignment remain unconfirmed. Structure stays blueprint-first; preserve all authored anchors. Reference gate: `node tools/prepare_atlas_reference.mjs --check --version v2`; runtime art/source gate: `node game/tools/test_world_atlas.mjs`. Refresh references after structural changes, review the painting before changing its registration hashes. Never move features to fit art or hand-edit generated world.json.
- **Earlier acceptance/open issues:** coastal playtest, P3 water, P4 coast/dry range and current biome art/clustering accepted. Performance seems good without representative mobs/camps load; measure again after population. Retain river-corner snag at 4200,4275, 34 harbor/17 mountain corners unrounded, Settings cross-save check and deferred F1.7. Source-pool redesign remains separate.
- **Operating rules:** read START_HERE.md, docs/usage.md, step_runner_guide.md and this plan. Sim owns rules; UI only reads/sends commands; tuning in data; save plain state. Node tests only, no browser automation/screenshots. Do not weaken old assertions. Reuse the canonical test setup and running server; never reset/delete the one capital save. Preserve source art; unwanted files move to to_delete/. Docs keeper owns docs/local commits, no push. Keep usage bounded to the current checkpoint.

## Working in one long window (auto-compacting)

Tim usually keeps one window that compacts itself instead of starting fresh sessions. That works if
the doc, not the chat, carries the state:

1. **Before every step, re-read** this whole doc (Progress checklist, Shared design and every phase) and the
   one step card. Do not trust a summary of earlier chat for file names or numbers.
2. **One step at a time.** Finish the card's check, then tick its box and update "Last step done /
   Next step" above, before starting the next card.
3. **End of each phase:** run the phase tests and regression set, ask the Docs keeper to commit,
   tick the phase box, and stop for Tim's playtest.
4. If a compaction happens mid-step, re-read the card and run its check first: it shows what is
   already done.

Ticking boxes is a doc change, so it goes through the Docs keeper like any other (a one-line note
is enough). If Tim prefers, he can let the building thread tick boxes in this one file directly.

## How to use this doc

- **One phase at a time.** A fresh session per phase is best; in one long window, follow the
  section above. Never try the whole plan in one go: early detail gets lost and usage runs out.
- A phase session reads: `START_HERE.md`, `docs/usage.md`, `docs/step_runner_guide.md`, this
  WHOLE doc (Tim's rule, 2026-11-02). Extra reads are listed per phase.
- Inside a phase, SMALL steps can go to a cheaper model one card at a time; STRONG steps stay on
  the default model. A TIM step stops the phase until Tim answers.
- Every phase ends the same way: all phase tests pass, the regression set shows no new failures,
  the Docs keeper commits (only the Docs keeper commits; Tim pushes), and Tim plays the short
  playtest listed. The next phase starts only after Tim says "g2g".

| Phase | What it gives you | Steps | SMALL / STRONG / TIM |
|---|---|---|---|
| F0 | Ready to start: snapshot, numbers, season decision | 4 | 0 / 0 / 4 |
| F1 | Save files: dawn autosave (exact), manual save (any time), Steam-ready | 8 | 4 / 3 / 1 |
| W1 | The whole island as data, generated from the atlas, steered in words | 5 | 1 / 2 / 2 |
| W2 | World tab on the M map, with fog and scouting | 5 | 2 / 1 / 2 |
| F2 | Town economy rules, guards, fixture towns, debug readout | 12 | 11 / 1 / 0 |
| F4 | Town panel, all-towns overview, alerts, map hover | 8 | 5 / 1 / 2 |
| W3 | Walk out of the city into the island (chunks) | 7 | 2 / 4 / 1 |
| W4 | Camps, resource nodes, scouting sites | 5 | 3 / 0 / 2 |
| C | City in the campaign: lieutenant, Influence, ops hit rival income | 6 | 3 / 1 / 2 |
| E | Expedition and founding your first town | 7 | 4 / 1 / 2 |
| F3 | Roads and real shipments | 5 | 5 / 0 / 0 |
| F5 | Build your town: grid, clearing, zones, walls | 6 | 3 / 2 / 1 |
| F6 | First frontier armies and road battles | 9 | 3 / 4 / 2 |
| F7 | Sieges and conquest: walls, garrisons, taking towns | 6 | 1 / 3 / 2 |
| W5 | Exploration and natives: villages, set pieces, unique items | 5 | 2 / 1 / 2 |
| S | Seafaring: harbors, cargo ships, piloting, pirates, navy (outline) | — | expand first |
| Later | Campaign rules, scale | — | design first |

Honest expectation: F2, F3 and most of W1, W4 and E are SMALL because they are rules or data with
clean tests. F1, W3 and F6 lean STRONG because they touch shared plumbing (save state, the worker,
streaming the world, combat). W3 is the biggest technical risk. Feel, balance and art always come back to Tim.

## End-state architecture (snowflake)

Built top-down, like the snowflake method: one sentence, then a paragraph, then the module map.
Every phase expands detail **inside** this outline and never contradicts it. Before a phase starts,
its cards are re-checked against this section; if a card would block an end capability, fix the card
first. Later phases are kept coarse on purpose and get expanded into full cards one phase ahead.

**Level 1 (one sentence).** One authoritative world simulation runs the capital, every town, every
road and every battle on one clock with the same rules for players and bots, and screens only show
and send commands.

**Level 2 (one paragraph).** The sim runs in a worker now and on a Node server for multiplayer later,
with no rule changes. The world is split into places (the hand-made city, streamed world chunks,
temporary battle spots), each with its own grids, so cost grows with what is active, not with map
size. Towns are economic records stepped once a second; fights are real 20 Hz combat wherever they
are; the camera only decides what is drawn. All state is plain, versioned data, so saves, snapshots
and network sync are the same thing. Platform features (files, Steam, window) sit behind small
interfaces. Content (island, sites, buildings, troops, numbers) is data that tools edit, not code.

**Level 3 (module map: end capability, first built in).**

| Module | End capability | First built |
|---|---|---|
| Sim core (`game.js`, commands, receipts) | Same commands from player, bot, governor and network client | today, F2.3 |
| Save and versions (`save.js`, `save_store.js`) | Exact dawn saves, any-time saves, migrations, desktop and Steam Cloud backends, later server persistence | F1 |
| World data (`world.json`, `world_data.js`, editor) | Several curated islands or regions, later optional procedural variation | W1 |
| Places (`areas.js`, `chunk_gen.js`) | Any number of loaded chunks, towns and battle spots, bounded memory | W3 |
| Discovery (`discovery.js`) | Per-clan fog, scouting and last-seen markers; safe to send per player in multiplayer | W2 |
| Economy, governor, construction (`sim/frontier/`) | Many towns at equal rates, tiers up to castles, readable reports | F2, F5 |
| Logistics (`logistics.js`) | One transport graph with road, rail and sea links (`mode` per link); real cargo, interception, piracy | F3 |
| Armies and battles (`armies.js`) | Several simultaneous battles at full rules, sieges, garrisons | F6, Later |
| Snapshot (`sim_snapshot.js`) | Interest-filtered, per-player deltas for multiplayer | today, F4.2 |
| Render (`render/`) | Streams only what the camera sees; never decides outcomes | today, W3.4 |
| Platform (`save_store.js`, later settings, window, Steam) | Desktop and Steam builds with no game-code changes | F1.6 |

Scaling rule: if a step would make cost grow with total map size, total towns or total units instead
of with what is active or visible, it is wrong for the end state. Stop and rework it.

## Shared design (every phase reads this)

### Where the code goes

- New sim modules in `game/src/sim/frontier/`: `world.js`, `economy.js`, `governor.js`,
  `construction.js`, `logistics.js`, `armies.js`. Each exports one `createX({ state, data, rng, ... })`
  that returns an object of functions, like the existing `createInventory` or `createContracts`.
- One data file `game/data/frontier.json` for regions, settlements, roads, resources, buildings and
  rates. Loaded in `main.js` next to `settings.json` and passed in `simOptions.frontier`.
- All frontier records live under `game.state.frontier` as plain data, so save/load and the
  worker snapshot carry them with no extra work.
- Players, governors and bots use one command shape: `{ id: <hero id>, type: 'frontier', action, ... }`.
  Results go to `state.frontier.receipts` as `{ seq, clan, action, ok, reason }` (same idea as
  `sim/deployment_feedback.js`).
- The island lives in `game/data/world.json` (W1) and its live state in `state.world`
  (`discovered`, `camps`, loaded chunk ids). Each place (the city, world chunks) has its own nav and
  vision grids (W3.2); entities carry `e.area`.
- Two match modes: `classic` (today's city game, season on) and `campaign` (city plus island,
  persistent, season end off). Frontier code only runs in `campaign`.
- Tests in `game/tools/test_frontier_<topic>.mjs`.

### Records (shape agreed for all phases)

```js
state.frontier = {
  version: 1,
  nextId: 1,                 // ids are `${prefix}${nextId++}`: 's1' settlement, 'p4' project, 'h9' shipment, 'a2' army
  econTick: 0,               // counts economy ticks, one every data.cadenceTicks sim ticks
  settlements: { s1: {
    id, name, region, owner,             // owner = clan id or null
    pop, housing, workforce,             // numbers
    stock: { food, timber, stone, goods, ryo },
    buildings: [ { id, type, cell, stage: 'built' | 'damaged' | 'ruined', workers } ],
    projects: [ { id, type, cell, cost, paid, progress, need, authorized } ],
    priority: 'grow' | 'produce' | 'trade' | 'fortify',
    budget: { ryo },                     // governor spending limit per day
    report: { doing, next, waiting: [ 'food' ] },
    grid: null                           // filled in F5
  } },
  roads: { r1: { id, from, to, length, state: 'working' | 'threatened' | 'blocked', blockedAt: null } },
  shipments: { h1: { id, owner, from, to, road, cargo: { timber: 20 }, progress, state: 'moving' | 'waiting' | 'delivered' } },
  armies: {},                // F6
  totals: { s1: { food: { in: 0, out: 0 } } },   // running totals per settlement and resource: conservation tests use these
  ledger: [],                // display log only: last 500 entries { tick, settlement, resource, delta, reason }
  receipts: []               // this tick's command results
};
```

### Never break these (from the campaign plan)

- Looking at a place never changes its result. No function in `sim/frontier/` takes a "viewed"
  or camera argument.
- Stock is conserved: every change is one ledger entry; cargo leaves at departure and arrives only
  on delivery; a blocked shipment is never also delivered.
- No starvation deaths, no automatic surrender from isolation, no free goods from blockage.
- One unit or shipment has one id and one location; orders cannot duplicate it.
- Bots and players use the same commands and costs.
- **Resources add to the game, never become a grind** (Tim, 2026-11-02). The governor handles
  routine balancing by itself; the player makes a few big choices (where to settle, what to zone,
  where to push), never micromanages stock. No step may add a chore the player must repeat to keep
  things running.

### Guards against stray changes (mutation)

- **One door per record.** Stock changes only through `world.change(settlement, resource, delta,
  reason)` (which also writes totals and the ledger). Ownership, armies and shipments likewise each
  have one function that changes them. Nothing else writes those fields.
- **Lint test.** `game/tools/test_frontier_guards.mjs` scans `game/src/` and fails if any file other
  than the owning module assigns to `.stock.`, `.owner =`, `.units =` or `.cargo` on frontier
  records, or if any file under `game/src/render/` or the UI writes to snapshot data.
- **Reads never write.** Every report or query function gets the existing check: `JSON.stringify`
  the state before and after the call and assert equal (as `test_inventory.mjs` does).
- **Rejected commands change nothing.** Same before/after check on every rejected frontier command.
- **Invariant check every economy tick** in tests and the dev build: `world.checkInvariants()`
  confirms stock ≥ 0, totals match stock, each unit in one army, each shipment on one road, cargo
  conserved. It throws in tests and logs `[frontier invariant]` in the console in game.
- **Frozen snapshots in dev.** In the dev build, the main thread `Object.freeze`s each frontier
  snapshot, so a UI bug that tries to change game data throws at once. (The real state already lives
  only in the worker; `game.step` on the main thread already throws.)
- **The plan itself.** A building thread never changes Shared design or an existing test assertion.
  If a card seems wrong, it stops and asks.

---

## Phase F0: Ready to start

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02).

### F0.1. Classic snapshot  [TIM]
Tim copies the current city game outside the project folder as the preserved Classic version, as
the campaign plan says. Nobody else touches this.

### F0.2. Agree the first-slice numbers  [TIM]
Tim OKs or edits these placeholder starting values (they go in `data/frontier.json` in F2.1):

| Value | Placeholder |
|---|---|
| Economy tick | every 20 sim ticks (1 second) |
| Starter resources | food, timber, stone, goods, ryo |
| Food per person per economy tick | 0.01 |
| Farm / lumber camp / quarry output per worker per tick | food 0.03 / timber 0.02 / stone 0.015 |
| Workshop | 1 timber + 0.5 stone into 1 goods every 40 ticks per 2 workers |
| House | housing 6, cost 15 timber |
| Growth | +1 person every 60 ticks while housing is free and food is in surplus |
| Fixture road length (tests and the `dev_frontier` save only) | 540 units; in the campaign, roads follow world corridors and take their real length |
| Shipment speed | 3 units per second |
| Frontier goods sold in the capital | goods 4 ryo, timber 1, stone 1 (market rules are open) |

Approved by Tim 2026-11-02 with these tweaks.

### F0.3. Close current playtests (recommended)  [TIM]
Shakedown, Sweep and the latest shop and item work are built and waiting on Tim's playtest. Closing
those first keeps frontier bugs separate from city bugs.

### F0.4. Season and Renown in the campaign  [TIM]
**Decided (Tim, 2026-11-01): Classic keeps the season, the campaign drops it.** The city-only
Classic mode keeps the 10-dawn season and Renown as they are. A frontier (campaign) match turns the
season end off; its growth-based goals and any new use of Renown are designed in the campaign-rules
phase. Code: a match option `mode: 'classic' | 'campaign'` (in `sim/match_options.js`); `campaign`
skips the season end in `sim/territory.js`. The campaign dev saves use `campaign`. Bots raiding an absent
hero stays an open question for the campaign-rules phase.

### F0.5. Dev test saves  [SMALL]
**Decided (Tim, 2026-11-02): no test switches.** Every `?test=...` preset is replaced by a few
**dev test saves**. A save is plain game state loaded by the normal loader, so the game code never
runs in a modified mode; there is only ever one version of the game.
Files: new `game/tools/make_dev_save.mjs`, `game/src/test_params.js` (emptied, then moved to
`to_delete/`), `docs/test_params.md` (proposal to coordinator: replaced by a short "Dev test save"
section).
Do: one Node tool rebuilds a small fixed set of saves from the current code, so they never go stale:
`dev_classic.json` (a Classic city match), `dev_campaign_start.json` (campaign day 1, before the
expedition) and `dev_frontier.json` (fixture towns and road, map revealed, spare ryo). They load from
the normal Load menu (F1.6b). A phase that needs something new to test updates one of these; a new
save is added only with Tim's OK, and the set stays small (no more than 4). Dev-only checks (invariant logging, frozen snapshots, the F2.4b readout) run in the
dev build (`start_game.bat`), never in a release build. Existing Classic presets in `test_params.js`
are listed for Tim before removal; any he still needs become states in the generator.
Needs: F1.6b (the save comes after save and load exist).
Check (pass/fail): no `?test=` read remains in `game/src`; the generator runs in Node and every save
loads with the F1 loader; regression set passes.
Done note: "F0.5 dev test saves in; test_params.md replacement proposed."

**Phase end:** Tim says "g2g" with the numbers. No commit needed.

---

## Phase F1: Save and load the city game

Goal: two kinds of save (Tim, 2026-11-01). The frontier depends on this (the plan's step 1), and it
is also roadmap item 9 (load/save).

- **Autosave at dawn = exact.** Dawn is a safe point: no raid, operation or contract hold is
  running, so little hidden state exists. Loading a dawn save replays exactly.
- **Manual Save in Settings = any time, close enough.** Positions, HP, ryo, ownership, crew, orders
  and frontier records are kept. Anything mid-action (a swing, a path, a cast, a channel) restarts
  on load. This is what most games do and keeps F1 from eating the budget.

Order note: F2 and F3 keep all their state in `state.frontier` and do not need F1, so F2 may be
built before F1 if Tim wants to see the frontier sooner.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `docs/architecture.md` (first 80 lines only).

### F1.1. Find hidden state  [STRONG]
Needs: F0
Files: read `game/src/sim/*.js`; write `to_delete/_chk/save_audit.md`.
Do:
  1. List every variable that lives inside a `createX` closure and changes during play, module by
     module (for example the `seed` behind `rng()` in `sim/combat.js`, the `paths` map in
     `game.js`, `fight`, nav seeds at `game.js` lines ~510/529/549, contracts seed ~608).
  2. Mark each one: "must save at dawn", "must save any time", "can rebuild from state", or
     "cache only / restarts on load". Expect most mid-action state (paths, swings, channels,
     generator-based path searches in `sim/nav.js`) to be "restarts on load".
  3. Group the "must save" ones into small batches of one to three modules each, one batch per
     F1.3 card.
Check (pass/fail): the audit lists every `createX` in `game/src/sim`; a `grep -c "let "` count per
module is noted beside it so nothing is skipped.
In game (Tim): nothing visible.
Done note: "F1.1 save audit done: N modules hold state, M batches for F1.3."

### F1.2. Save and load frame  [STRONG]
Needs: F1.1
Files: `game/src/sim/game.js`, new `game/src/sim/save.js`, new `game/tools/test_save.mjs`.
Do:
  1. In `save.js` export `SAVE_VERSION = 1`, `makeSave(game)` returning
     `{ version, tick, state: structuredClone(game.state), private: { <module>: module.saveState?.() } }`
     and `loadSave(game, save)` that checks the version, replaces `game.state` contents in place
     (keep the same object, so modules holding a reference still see it) and calls
     `module.loadState?.(save.private[<module>])`.
  2. In `game.js` add `save()` and `load(save)` to the returned object, using a list of modules that
     own private state.
  3. In `test_save.mjs`, **dawn case:** build two games with the same seed and setup; run game A
     to the second dawn plus 300 ticks; run game B to the second dawn, `save()`, build fresh game C,
     `load()`, run C 300 ticks. Assert `JSON.stringify(A.state) === JSON.stringify(C.state)`.
  4. **Any-time case:** save game B mid-fight, load into C. Assert the same entity ids exist with the
     same owner, HP, place, ryo, business owners and crew assignments; positions within 0.01. Do not
     assert exact replay.
Check (pass/fail): the frame runs; the dawn parity assert may still fail until F1.3 batches land. The
test prints which top-level state keys differ, to guide F1.3.
Done note: "F1.2 save frame in; parity diff keys: ..."

### F1.3. Save one module batch  [SMALL, repeat per batch]
Needs: F1.2
Files: the one to three modules in the batch from `save_audit.md`.
Do (for each module):
  1. Add `saveState()` returning the module's "must save" closure variables as plain data.
  2. Add `loadState(data)` that puts them back. Rebuild "can rebuild" values from state.
  3. Register the module in the list in `game.js` `save()`/`load()`.
Check (pass/fail): `node game/tools/test_save.mjs` shows fewer differing keys than before this batch
and none that belong to this batch's modules. The regression set has no new failures.
Done note: "F1.3 batch <n> saved: <modules>. Remaining diff keys: ..."

### F1.4. Parity proven  [STRONG]
Needs: all F1.3 batches
Files: `game/tools/test_save.mjs` and whatever small fix the last diff needs.
Do: make the dawn parity case pass with bots active in each clan (Yakuza, Kuroda, Shinobi). Make the
any-time case pass when saving mid-raid, mid-contract and during a Shakedown: after load, the game
runs 600 more ticks with no thrown error and no unit stuck in a half-finished action.
Check (pass/fail): `test_save.mjs` passes all cases.
Done note: "F1.4 dawn parity (3 clans) and any-time load (3 cases) pass."

### F1.5. Worker save and load messages  [STRONG]
Needs: F1.4
Files: `game/src/sim_worker_runtime.js`, `game/src/sim_worker_client.js`, `game/tools/test_sim_worker.mjs`.
Do: add `{ type: 'save' }` (worker replies with the save object) and `{ type: 'load', save }`
(worker pauses, loads, publishes a forced full snapshot, resumes if it was running).
Check (pass/fail): extend `test_sim_worker.mjs`: save through the runtime, load into a new runtime,
the next snapshot's tick and entity count match.
Done note: "F1.5 worker save/load messages in."

### F1.6. Save files  [SMALL]
Needs: F1.5
Files: new `game/src/save_store.js`, `game/server.mjs`, `game/src/sim/save.js`,
new `game/tools/test_save_store.mjs`.
Why (Tim, 2026-11-01): saves are real files from the start, designed so the Steam build only swaps
where the files go.
Do:
  1. **One interface, swappable backends.** `save_store.js` exports `createSaveStore(backend)` with
     `list()`, `write(name, save)`, `read(name)`, `remove(name)`. Backends:
     - `serverBackend`: the dev server (`game/server.mjs`) gets `GET /saves`, `GET /saves/<name>`,
       `PUT /saves/<name>` and `DELETE /saves/<name>` (delete moves the file to `saves/_trash/`,
       never a real delete), writing JSON files to `saves/` at the repo root. Names are checked
       against `^[a-z0-9_-]{1,40}$` so no path can escape the folder.
     - `browserBackend`: download and upload of a `.json` file, used when no server is running.
     - Later, `desktopBackend` (Steam build): same four calls, writing to the OS user-data folder,
       which Steam Cloud syncs with no code (Steam "Auto-Cloud" points at that folder). Not built
       now; the interface is what matters.
  2. **Safe writes.** The server writes `<name>.json.tmp`, then renames it over the old file, so a
     crash mid-save never leaves a broken save.
  3. **File format.** `{ format: 'infamy-save', version: SAVE_VERSION, gameVersion, savedAt, mode,
     clan, day, label, state, private }`. The header fields (everything except `state` and `private`)
     are what `list()` returns, so the load menu doesn't read whole files.
  4. **Versions and old saves.** `save.js` keeps a `MIGRATIONS` list (`{ from: 1, to: 2, run(save) }`).
     Loading an older save runs the migrations in order; a newer or unknown save shows "This save is
     from a different version" instead of crashing.
  5. **Autosave rotation.** At each dawn, write `autosave_1` and shift older ones down, keeping the
     last 3 dawns. Manual saves are named by the player (default "Day N, <clan>").
  6. Ask the Docs keeper to add `saves/` to `.gitignore`.
Check (pass/fail): `test_save_store.mjs` runs the server backend against a temp folder: write, list
(headers only), read back equal, rotation keeps exactly 3 autosaves, a bad name like `../x` is
rejected, delete moves to `_trash`; a v1 save loads through a sample v1→v2 migration; an unknown
version is refused with the message, not a crash.
Done note: "F1.6 save files in (saves/, gitignore line needed)."

### F1.6b. Save and Load menus  [STRONG]
Needs: F1.6
Files: `game/src/game_settings.js` (the Settings panel), the Controls panel rows in `game/src/main.js`
(find them with `grep -n "Controls" game/src/main.js`), new pure helper `game/src/save_menu.js`,
new `game/tools/test_save_menu.mjs`.
Do: in Settings add **Save game** (name box, Save; asks before overwriting) and **Load game** (a list
from `list()`: label, clan, day, mode and date, newest first, autosaves marked "Dawn"; two clicks to
load, like Quit to game menu; delete with a confirm). The start screen also gets **Continue** (newest
save) and **Load**. All new buttons go in the Controls panel under the Settings heading.
`save_menu.js` holds the pure parts: sorting, labels, the overwrite check.
Check (pass/fail): `test_save_menu.mjs` covers sorting, labels and the overwrite check; syntax copies
pass.
In game (Tim): see the playtest below.
Done note: "F1.6b Save/Load menus in Settings and start screen (controls.md line needed)."
Progress (2026-11-02): built: Settings Save game, saved-games list (Load, Delete to `saves/_trash`), dawn autosave (keep 3), and the start-screen Continue and Load game (`start_screen.js`/`.css`, boot-from-save in `main.js`, `game/tools/test_start_load.mjs`). Note: card F1.6 missed the `main.js` dawn hookup and replica-versus-worker load; both are now handled, so retagged STRONG.

Fix (Tim, 2026-11-02): Settings could not load a different campaign save because of an old clan/hero-ID restriction. Settings loads now accept any confirmed save after validating its version and player hero, then pass its validated filename through the normal startup route; it does not use a test preset. The route is cleared after load, and existing pagehide cleanup handles the previous worker/timer. `test_save_menu.mjs` and `test_start_load.mjs` passed. Tim's in-game verification of this Settings route is still pending.

### F1.7. Playtest  [TIM]
Play past a dawn, keep playing, load the autosave: everything is back at dawn. Save by hand during a
fight at night, keep playing, load: crew, HP, ryo, clock and bots are where they were, and the fight
picks up again. Close the game, start it again, use Continue. Check the files appear in `saves/`.
Report anything that drifted.

**Phase end:** `test_save`, `test_save_store`, `test_save_menu`, `test_sim_worker` and the regression set pass;
Docs keeper commits "Save and load"; Tim playtest F1.7.

---

## Phase W1: World in form (data)

Goal (Tim, 2026-11-01): the whole island exists as data before anything else is built on it: shape,
land, water, rivers, passes, settlement sites, resource nodes, road and rail corridors, and camps.
Nothing is walkable yet.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `docs/frontier_campaign_plan.md` section "World map scale
and visual reference" only, and the approved blueprint in `docs/images/frontier/blueprint/` (`world_blueprint_v2.json`,
`v2_overview.png` and the six layer PNGs, `blueprint.py`). `island-atlas.html` and `measured-island.html`
are superseded references.

### W1.1. World layout choices  [TIM]
**Approved (Tim, 2026-11-02): the layout is blueprint v2** (`docs/images/frontier/blueprint/`): a south bay (Sallow Bay,
about 30% up the island) with a floodplain, 6 mountain ranges, 20 passes, 4 rivers with waterfall or
tarn sources and walkable feeder streams, 17 fords or bridges, 60 sites, 30 harbors, 17% unbuildable,
and every site has 3 or more routes to the capital. Full regions may contain water. Blueprint names
are drafts pending the `world_names.json` review. The earlier choices below stay as background.
- Island 14,000 × 8,000 units from the revised atlas (`island-atlas.html`, not the older
  `measured-island.html`): 24 full regions in a 6 × 4 block with 12 coastal partial regions around
  them, capital on the east coast.
- About 60 settlement sites to start (2 to 3 per full region, at least 1,000 units apart), so there
  is real choice.
- Resources (updated Tim, 2026-11-04): small resource spots everywhere (timber, stone, fish,
  forage) plus the 107 W1 nodes as rich deposits; ore only from deposits. See
  [Loop 3 design](#loop-3-design-tim-2026-11-04). Starter economy stays at the 5 resources.
- Camp kinds: bandit camps (hostile), ruins and caches (one-time rewards), native villages
  (neutral, trading or hostile by relation: decided, see W4.1).
- **Roads can go almost anywhere (decided, Tim 2026-11-02: never only 1 or 2 road options).** The
  land is mostly open and buildable; corridors are only suggested easy routes, not the only roads.
  Every mountain range has several passes (placeholder: at least 3), rivers have a ford or bridge
  spot about every 1,000 units, and every site has at least 3 different routes to the capital.
  Terrain sets road cost (plain 1×, forest 1.5×, hills 2×, ford or bridge extra), so choice is about
  cost, distance and safety, not what's allowed.
- **Names (decided, Tim 2026-11-01):** Japanese-style names written in English (images, not
  romaji), nothing clichéd and nothing close to real places. Avoid the overused ones (Sakura,
  Dragon, Shadow, Cherry Blossom, Fuji, Edo and the like). Tone: nuanced. The best names hold both at once: a quiet,
beautiful image with an undertone, or a hint of a story (who drowned at the ford, whose debt the
valley paid). Some lean darker (gallows, salt, bone, rust, tolls), some lean gentler (moss, lanterns,
herons, bells), but few are purely one or the other. Never postcard-pretty clichés, never edgy for
its own sake. The generator (W1.3) draws from a reviewed
  name list in `game/data/world_names.json`; Tim approves the list once.

### W1.2. World data format and validator  [SMALL]
Needs: W1.1
Files: new `game/data/world.json` (empty shell), new `game/src/sim/world_data.js`,
new `game/tools/test_world_data.mjs`.
Do:
  1. Format: `{ version, size: { w, h }, capital: { x, z, cityOffset: { x, z } }, coast: [[x, z], ...],
     regions: [{ id, name, poly, biome }], terrain: { cell: 50, codes: { p: 'plain', f: 'forest',
     m: 'mountain', w: 'water', d: 'desert', n: 'snow', b: 'bamboo', k: 'marsh', r: 'river',
     h: 'hills' },
     rows: ["pppff...", ...] }, rivers: [{ id, points, width }], passes: [{ id, x, z }],
     sites: [{ id, x, z, region, size, traits: { soil, water, defense }, harbor: null | { x, z } }],
     nodes: [{ id, kind, x, z, amount }], corridors: [{ id, points, kind: 'road' | 'rail' | 'both' }],
     seaLanes: [{ id, points, from, to }],
     camps: [{ id, kind, x, z, strength }], fords, riverSources, streams, floodplain, islets,
     ranges, setPieces (1 per full region), nativeVillageSlots (4; Tim picks 2 to 4) }`.
     Hills (`h`) are buildable, road cost 2×. Unbuildable = mountain, water, river and marsh (blueprint v2, 2026-11-02). At 50-unit cells the terrain grid is 280 × 160 short
     strings, which is fine as data.
  2. `world_data.js` exports `terrainAt(world, x, z)`, `passable(world, x, z)` and
     `validateWorld(world)`, which returns a list of problems.
  3. Validator rules: every point inside the coast; no site, node or camp on water or mountain;
     sites at least 1,000 apart; every site reachable from the capital over passable cells (grid
     search); **no single pass can seal the island:** block each pass in turn and every site must
     still be reachable; every site has at least 3 routes to the capital that don't share a pass or
     ford; no more than a set share of land (placeholder 20%) is unbuildable; every harbor sits on
     a land cell next to water; every sea lane runs over
     water cells only and connects two harbors (the capital counts as one).
Check (pass/fail): a hand-made tiny test world passes; versions of it with a site in water, two sites
too close, a one-pass island and a site with only one route each give the matching problem.
Done note: "W1.2 world format and validator in."
As built (2026-11-02): terrain code `d` = dry; regions have `box` + `full` + `biome` (no `poly`); added `lakes`, `islets` and a `rules` block (validator, road-cost and seed numbers); nodes carry `richness` 1 to 3 instead of `amount` (a node never depletes); camps keep `tier` + `strength`; corridors carry `traffic`; fishing nodes may sit on water; a pass within 450 units of a site does not count as sealing it.

### W1.3. Generate the island  [STRONG]
Needs: W1.2
Files: new `tools/seed_world.mjs`, writes `game/data/world.json` and a preview PNG to
`/mnt/project-files/world_previews/`.
Why (Tim, 2026-11-01): Tim doesn't paint the island by hand. Claude generates it from the existing
references, and Tim steers with words.
Do: a script, using a fixed seed so the same input gives the same file:
  1. **Base layout from the approved blueprint (2026-11-02):** read `docs/images/frontier/blueprint/world_blueprint_v2.json`
     (or port the `blueprint.py` rules into `seed_world.mjs`) instead of the atlas. Nodes and camps are
     placed by rule once and then fixed, the same every campaign; camp tier 1 to 5 rises with distance
     from the capital, while camp contents can vary. Superseded earlier text: base layout from the atlas (`docs/images/frontier/island-atlas.html`): its coast
     polygon, the 24 full regions (6 × 4 grid of 1,750 × 1,400 starting at x 1,750, y 1,200) with their
     names, the 12 coastal regions, the 18,000-unit route, the capital at the route's east end, the
     mountain chain and the biome rules (snow north, dry basin west, rainforest south-east, rice valley
     east, mountain forest centre, coastal plain east coast).
  2. **Optional: detail from the concept image** (`frontier-island-concept.png`): sample its colours to refine
     the coastline, lakes and biome edges where they differ from the atlas rules.
  3. Rivers from the mountains to the coast; a pass gap through each mountain band plus an alternate.
  4. Sites by rule (passable, near water, 2 to 3 per full region, at least 1,000 apart), traits
     computed from nearby cells; resource nodes from terrain; camps away from the capital.
     Coastal sites get a `harbor` spot on the shoreline where the water is deep enough, and sea
     lanes link the capital's port to harbors around the coast (Tim, 2026-11-01: plan for sea travel
     now, build it later).
  5. Render a preview PNG: terrain colours, sites, nodes, camps, corridors, region names.
Check (pass/fail): the output passes `validateWorld`; running the script twice gives identical files;
the preview PNG exists.
Done note: "W1.3 island generated: N sites, N nodes, N camps; preview at <path>."
As built (2026-11-02): `node tools/seed_world.mjs` (about 9 s) reads blueprint v2 plus `world_overrides.json`. Corridors are each site's 3 independent routes merged into one network; kind `both` = rail-capable where 10 or more primary routes share it. Corridors are suggestions only: roads can be built on any walkable cell (Tim confirmed). Previews stay out of git.

### W1.4. Steer the island in words  [TIM]
Tim looks at the preview and says what to change ("bigger lake in the north", "more bandits by the
pass", "a strong site on that river bend"). The thread turns each note into a seed-script change
(rules, or a short list of hand overrides in `game/data/world_overrides.json` that the script applies
last) and sends a new preview. Repeat until Tim says "g2g". Overrides keep regenerating safe: hand
choices are never lost.

### W1.5. Fine-tuning tool  [STRONG, optional, later]
Only if word steering gets slow: a dev page (`game/tools/world_editor.html`, served by
`game/server.mjs`) to drag sites, camps and nodes and paint small terrain fixes, saving into
`world_overrides.json`. The validator's problems show live. Skip unless needed.

**Phase end:** `test_world_data` passes; Docs keeper commits "World layout data"; Tim's layout approved (g2g 2026-11-02). Done.

---

## Phase W2: World map view

Goal: the M map gets a World tab showing the island, with fog over what you haven't explored.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/game_map.js` (function list only).

### W2.1. Mock the world map  [TIM]
A thread draws one mock image: atlas style (sumi-e land, gold detail, indigo sea) with the capital,
sites (scouted and unscouted), nodes, camps, corridors, your towns, fog, and a site detail box. Tim
approves or edits.

### W2.2. World map drawing  [SMALL]
Needs: W1 done, W2.1
Files: new `game/src/world_map.js`, new `game/tools/test_world_map.mjs`.
Do: draw the terrain grid once into a cached offscreen canvas, then each frame only the overlays:
coast, rivers, corridors, the capital, sites, nodes, camps, towns, roads and shipments (when they
exist). Pan with drag, zoom with the wheel. Redraw overlays only when the snapshot revision changes.
Pure helpers: `worldToCanvas(x, z, view)`, `canvasToWorld(px, py, view)`, `hitTest(items, px, py, view)`.
Check (pass/fail): helper round trips are within 0.5 units; hit test picks the nearest item within
8 px; syntax copy passes.
Done note: "W2.2 world map drawing in."

### W2.3. Discovery and fog  [STRONG]
Needs: W2.2
Files: new `game/src/sim/discovery.js`, `game/src/sim/game.js`, `game/src/sim_snapshot.js`,
new `game/tools/test_discovery.mjs`.
Do: `state.world.discovered[clan]` is a coarse grid (250-unit cells) stored as a plain string of
0/1. Cells near the clan's hero and units become discovered. A site is "scouted" when the hero
comes within 150 units, which reveals its traits. Enemy units are shown only while seen, then as a
last-seen marker with direction. The snapshot carries only the player's own discovery.
Check (pass/fail): walking reveals cells along the path only; the snapshot never contains another
clan's discovery or unseen enemy positions; discovery survives save/load.
Done note: "W2.3 discovery and fog in."

### W2.4. World tab  [SMALL]
Needs: W2.3
Files: `game/src/game_map.js` (add a "World" tab), `game/src/world_map.js`, the Controls panel rows
in `game/src/main.js`.
Do: the World tab draws `world_map.js` with fog from the snapshot; click a site to see its traits
(or "Not scouted"); click a town to open its panel (after F4). Defaults (proposed 2026-11-02, Tim can change):
M opens straight to World when the hero is outside the city; right-click on the map drops a
personal pin with a short note (saved in `state.world.pins[clan]`, max 50); shift-right-click sets a
waypoint that shows as an arrow on the minimap edge until reached. Add any new clicks or keys to the
Controls panel. No test switch: the `dev_frontier` save (F0.5) has the whole map revealed.
Check (pass/fail): syntax copies pass; `test_world_map.mjs` still passes.
In game (Tim): M → World shows the island; in the `dev_frontier` save, everything is visible.
Done note: "W2.4 World tab in (controls.md line needed)."
As built (2026-11-02): the Controls rows live in `game/index.html`, not `main.js` as the card says. "M opens World outside city" is coded but cannot trigger until W3. City units count as standing at the capital point. The `dev_frontier` full-reveal save waits for F0.5. Discovery numbers are placeholders in `world.json` `rules.discovery`. Known failing test: `test_crew` line 97 (already failing before).

### W2.5. Playtest  [TIM]
Open M → World, pan and zoom, click sites and camps, and check the look against the mock.

**Phase end:** tests pass; Docs keeper commits "World map view"; Tim playtest W2.5.

---

## Phase F2: Frontier settlement economy (rules only)

Goal: one frontier settlement that feeds itself, grows, builds and reports, with no graphics yet.
Almost all SMALL: each card is one module with a pure test.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/sim/inventory.js` first 40 lines (module style).

### F2.1. Frontier data file  [SMALL]
Needs: F0.2
Files: new `game/data/frontier.json`.
Do: write the file with keys `version`, `cadenceTicks`, `resources`, `rates` (food per person,
growth interval), `buildings` (house, farm, lumber_camp, quarry, workshop, storehouse, stockade:
each with `cost`, `jobs`, `housing`, `output` or `recipe`, `buildTicks`), `regions` (`capital`,
`frontier_1`), `settlements` (`capital` linked to the city, `s_frontier_1` with starting pop 8,
stock food 60, timber 40, stone 10, and one farm and two houses), `roads` (`r1` capital to
`s_frontier_1`, length from F0.2). Use the F0.2 numbers; mark each with `_note`.
Check (pass/fail): new `game/tools/test_frontier_data.mjs` parses the file and asserts every
building has `cost`, `jobs`, `buildTicks`; every road's ends are settlements; no negative numbers.
Done note: "F2.1 frontier.json in."

### F2.2. World records and ids  [SMALL]
Needs: F2.1
Files: new `game/src/sim/frontier/world.js`, new `game/tools/test_frontier_world.mjs`.
Do: `createFrontierWorld({ state, data })` builds `state.frontier` exactly as in Shared design from
the data file (settlements, roads), and returns `{ newId(prefix), settlement(id), ledgerAdd(entry) }`.
`ledgerAdd` updates `totals[settlement][resource].in` or `.out`, then appends to the display ledger,
which keeps at most 500 entries (drop oldest).
Check (pass/fail): records match the data; `newId('p')` twice gives `p1`, `p2` and survives a
`structuredClone` of state; the ledger never exceeds 500; after 2,000 `ledgerAdd` calls the totals
still equal the sum of every delta added.
Done note: "F2.2 frontier world records in."
As built (2026-11-02): each `totals` entry has an extra `start` field, so the invariant start + in - out = stock can be checked; the Shared design shape lists only `in` and `out`. Tests write their scratch files to the OS temp dir.

### F2.2b. Guards  [SMALL]
Needs: F2.2
Files: `game/src/sim/frontier/world.js`, new `game/tools/test_frontier_guards.mjs`.
Do: add `world.change(...)` as the only stock writer and `world.checkInvariants()` as described in
Shared design "Guards". Write the lint test (regex scan of `game/src/**/*.js` for the forbidden
writes outside their owning module). Every later frontier test calls `checkInvariants()` after its
run.
Check (pass/fail): the lint test passes on the clean tree and fails on a planted bad line in a temp
copy; `checkInvariants()` throws when a test sets a stock negative by hand.
Done note: "F2.2b frontier guards in."

### F2.3. Hook the frontier into the sim  [STRONG]
Needs: F2.2
Files: new hub `game/src/sim/frontier/frontier.js` (where `frontier.tick` and `frontier.command` come from), `game/src/sim/game.js`, `game/src/main.js`, `game/tools/test_frontier_world.mjs`.
Do:
  1. In `createGame`, if `options.frontier` is set, create the world and the F2 modules, and call
     `frontier.tick()` from `step()` once per tick (it runs economy only every `cadenceTicks`).
  2. Dispatch `c.type === 'frontier'` to `frontier.command(e, c)` next to the `inventory` line.
     Allow it while the hero is downed (add to the allowed list), since the frontier keeps running.
  3. Add `frontier` to the returned object. Load `data/frontier.json` in `main.js` and add it to
     `simOptions`.
Check (pass/fail): `test_frontier_world.mjs` builds a full `createGame` with `frontier` and runs
200 ticks; `state.frontier.econTick === 10`. Without `frontier` in options, `state.frontier` is
undefined. Regression set: no new failures.
Done note: "F2.3 frontier runs inside the sim."
As built (2026-11-02): later modules plug in by pushing into `frontier.modules` with `econTick(ctx)` and/or `command(e, c, ctx)`. Regression set passes except `test_crew` line 97 (already failing before).

### F2.4. Production and food  [SMALL]
Needs: F2.3
Files: new `game/src/sim/frontier/economy.js`, new `game/tools/test_frontier_economy.mjs`.
Do: `createEconomy({ state, data, world })` with `econTick(settlement)`:
  1. Each built building with workers adds `output × workers`, or runs its `recipe` only if the
     inputs are in stock (take inputs, give output, both ledgered).
  2. People eat `rates.food × pop`. If food would go below 0, set it to 0 and add `'food'` to
     `report.waiting`. Nobody dies.
  3. Every change goes through `world.ledgerAdd` with a reason (`'farm'`, `'eat'`, `'workshop'`).
Check (pass/fail): after 1,000 economy ticks: every stock is ≥ 0; for each resource, start stock +
`totals.in − totals.out` = end stock (use totals, not the capped ledger); with no farms, food reaches 0, pop is unchanged and `waiting`
contains `'food'`; running the same settlement twice from the same start gives identical results.
Done note: "F2.4 production and food in."

### F2.4b. Debug town readout  [SMALL]
Needs: F2.4
Files: `game/src/main.js`.
Do: in the dev build only, `window.infamy.frontierReport()` prints each settlement's stock,
pop, housing, jobs and `report` to the console, and a plain text box (top left, small, dev only)
shows the same, refreshed once a second from the snapshot. No styling, no new key. This lets Tim
watch the economy from F2 on; F4 replaces it with the real panel.
Check (pass/fail): `.mjs` syntax copy passes; the readout code only reads snapshot data.
In game (Tim): load the `dev_frontier` save; the numbers tick once a second.
Done note: "F2.4b debug town readout in (dev build)."
As built: a dev-only text box (`frontier_report.js`) refreshed once a second, plus `infamy.frontierReport()` in the window. No key, so no Controls entry. The snapshot carries `state.frontier` without the 500-entry ledger.

### F2.5. Jobs and growth  [SMALL]
Needs: F2.4
Files: `game/src/sim/frontier/economy.js`, `game/tools/test_frontier_economy.mjs`.
Do:
  1. `assignJobs(settlement)`: workforce = pop; fill jobs in priority order (food first when food
     is short, then `builder` jobs while a paid project exists, up to `rates.maxBuilders`, then
     the order given by `priority`); unfilled jobs are reported.
  2. Growth: every `rates.growthTicks` economy ticks, +1 pop if `pop < housing` and food went up
     over that period. Otherwise add `'housing'` or `'food'` to `waiting`.
Check (pass/fail): pop never exceeds housing; with spare housing and surplus food pop rises by
exactly 1 per growth period; with priority `'produce'` workshops fill before extra farms only when
food is not short.
Done note: "F2.5 jobs and growth in."

### F2.5b. Town mood and taxes  [SMALL]
Needs: F2.5
Files: `game/src/sim/frontier/economy.js`, `game/data/frontier.json` (`mood` block),
`game/tools/test_frontier_economy.mjs`.
Why (Tim, 2026-11-02): a light SimCity-style layer. Population drives revenue, and poor planning can
make a town decline, but it stays secondary and fun, never micromanagey or punishing.
Do:
  1. `settlement.mood` 0 to 100, recomputed each review from **three** weighted factors in data
     (Tim, 2026-11-02): **food** (stocked or short), **safety** (recent raids, nearby camps), and
     **taxes** (the town's tax level). Store the factor values so the report can say why.
  2. Tax level `low | normal | high`, managed by the governor unless the player locks a level (new
     command `setTax { level | 'auto' }`, default `auto`). Safety drops after a raid or attack and
     recovers on its own over time (placeholder +3 per review), so a hit town bounces back without the
     player (Tim, 2026-11-02). Higher taxes give more ryo per person but lower mood. Taxes per person per day
     = `rates.tax[level] × pop × moodFactor`, credited to the town's ryo (ledgered `'tax'`); growth
     speed scales with mood.
  3. Gentle decline: below `mood.declineBelow` (placeholder 30) for `mood.declineReviews`
     (placeholder 10) reviews in a row, 1 person leaves per review (ledgered as a pop change, never
     death), never below `mood.floorPop` (placeholder 5). Recovering mood stops it at once.
  4. `report.moodWhy` lists the worst factors in plain words ("Raided twice this week", "Taxes
     high"), each with a hint ("Station guards", "Lower taxes").
Check (pass/fail): with everything good, mood stays above 70 and taxes match the formula; high taxes
alone lower mood but never below the decline line; with three bad factors for 10 reviews,
pop drops by 1 per review and stops at the floor; fixing one factor ends the decline; `moodWhy`
names the worst factors.
Done note: "F2.5b town mood and taxes in."
As built and confirmed by Tim (2026-11-02): tax is ryo per person per review (every 5 economy ticks), because the economy has no "day" yet. Mood is a weighted food, safety and tax score; a raid calls `economy.hit(sid)`. Extra settlement fields: `mood`, `safety`, `taxLevel`, `taxLocked`, `autoBuild`, `suggestions`. Extra `report` fields: `idle`, `unfilled`, `moodWhy`.

### F2.6. Construction projects  [SMALL]
Needs: F2.5
Files: new `game/src/sim/frontier/construction.js`, new `game/tools/test_frontier_construction.mjs`.
Do: `createConstruction({ state, data, world })`:
  1. `queue(settlement, type, cell)` adds a project with `cost` from data, `paid: false`,
     `progress: 0`, `need: buildTicks`, `authorized: false`.
  2. Each economy tick, the first authorized project pays its full cost once if stock allows
     (ledgered, reason `'build'`), else waits with the missing resource in `waiting`. Once paid,
     `progress += builders` (workers on the `builder` job) until `need`, then it becomes a
     building with `stage: 'built'`.
  3. `cancel(project)` refunds only what was paid and not yet used (first slice: refund all if
     progress is 0, else nothing). Ledgered.
Check (pass/fail): a project pays once only; an unfinished project survives
`structuredClone(state)` and finishes after; cancel at progress 0 restores stock exactly; a house
raises housing by its value when built.
Done note: "F2.6 construction in."

### F2.7. Governor  [SMALL]
Needs: F2.6
Files: new `game/src/sim/frontier/governor.js`, new `game/tools/test_frontier_governor.mjs`.
Do: `createGovernor({ state, data, construction })` with `review(settlement)` every 5 economy ticks,
a fixed rule list checked top to bottom (same style as `sim/bot.js` rules). Each rule fires only
when its cause is the real limit, so the governor never loops:
  1. Food falling for 3 reviews **and** at least 2 idle workers → queue farm. If food is falling
     with no idle workers, report "need workers" and fall through to the housing rule instead.
  2. Housing full **and** food not falling → queue house.
  3. Priority `produce` → lumber camp / quarry / workshop by lowest stock.
  4. Priority `fortify` → stockade if none.
  5. Priority `trade` → workshop.
  6. **Mood keeper** (Tim, 2026-11-02: the governor keeps mood decent on its own): if taxes are on
     `auto` and mood is below 55, step taxes down one level; if mood is above 80 for 5 reviews, step
     them back up. Food shortages are already handled by rule 1, and safety recovers on its own.
**The governor maintains, it doesn't expand (Tim, 2026-11-02).** By default
(`settlement.autoBuild = false`) rules 1 to 5 only create **suggestions** (`settlement.suggestions`,
at most 3, each with a reason: "Farm: food falling") that wait for the player's OK; nothing new is
built without it. On its own the governor always: assigns jobs, runs auto taxes (rule 6), repairs
damaged buildings, **rebuilds destroyed ones on the same spot** (paying normal costs, waiting for
materials if short; Tim, 2026-11-02), and sends routine surplus shipments (F3.3). With `autoBuild = true` (the player
asked the governor to take initiative), suggestions within `budget` are queued and authorized
automatically. Never more than one project at a time either way. Write `report.doing` and
`report.next` as short text. The governor never orders armies or attacks.
Check (pass/fail): with `autoBuild` off, 500 reviews create suggestions but zero new projects,
while repairs and rebuilds of destroyed buildings still happen; with it on, suggestions within budget become projects;
a governed town with no raids settles above mood 55 within 50 reviews and
stays there; after a simulated raid it dips, then recovers on its own; a player-locked tax level is
never changed by the governor; with food falling and idle workers, the next project is a farm; with food falling
and no idle workers, no farm is queued and the report says "need workers"; with housing full, a
house; over-budget projects stay unauthorized; the governor never queues two projects at once; in a
500-review run no more than 3 farms are queued while pop stays flat.
Done note: "F2.7 governor in."
As built and confirmed by Tim (2026-11-02): the governor will not suggest a farm right after a building finishes, so it cannot double-build while food catches up; its budget is a ryo-value limit per window of 100 reviews. All new numbers (`tax`, `mood`, `governor`, `values`, `priorities`) are placeholders in `data/frontier.json`.

### F2.8. Frontier commands and receipts  [SMALL]
Needs: F2.7
Files: new `game/src/sim/frontier/commands.js`, new `game/tools/test_frontier_commands.mjs`.
Do: `command(e, c)` handles actions `setPriority { settlement, priority }`, `setBudget`,
`setAutoBuild { settlement, on }`, `approveSuggestion { settlement, index }`, `setTax`,
`authorize { project }`, `cancel { project }`, `queue { settlement, building, cell }`. Each checks
that the settlement's `owner === e.owner`, that values are valid, then acts and pushes a receipt.
Clear `receipts` at the start of each tick.
Check (pass/fail): a wrong-owner command is rejected with a reason and changes nothing
(`JSON.stringify` of the settlement is equal before and after); each valid action produces one
`ok: true` receipt.
Done note: "F2.8 frontier commands in."
As built: command receipts carry an extra `tick` field.

### F2.9. Owner, rival town and capital link  [SMALL]
Needs: F2.8
Files: `game/src/sim/frontier/world.js`, `game/src/sim/treasury.js`, `game/data/frontier.json`,
`game/tools/test_frontier_world.mjs`.
Do:
  0. These are **fixture towns** for tests and the `dev_frontier` save only, placed on two W1 sites. In a
     real campaign, towns exist only once founded (E3).
  1. At fixture setup, give `s_frontier_1` to the player clan (data flag `startOwner: 'player'`) and a
     second town `s_frontier_2` to the first bot clan (`startOwner: 'bot'`), with its own road to the
     capital. Both run the same economy and governor; no armies yet. This tests "same rules" from
     the start and gives F3+ an opponent to tune against.
  2. `sim/treasury.js` exports only `debitRyo`. Add `creditRyo(state, clan, amount, reason)` beside it
     in the same style. Make the `capital` settlement's `ryo` use `debitRyo` / `creditRyo` on the
     clan treasury instead of its own number.
Check (pass/fail): spending capital ryo lowers the clan treasury by the same amount; both towns grow
over 500 economy ticks; the bot town's governor issues only commands that get `ok: true`; a
`structuredClone` of `state.frontier` restored into a fresh game runs on identically for 50 ticks.
Done note: "F2.9 owners, bot town and capital link in."
As built: bot town `s_frontier_2` on site S29 belongs to the first bot clan (`world.assignStartOwners`); it gets commands only through the player's path. Capital ryo is now the clan treasury via `creditRyo` in `treasury.js`.

### F2.10. Frontier save check  [SMALL]
Needs: F2.9 and F1.4
Files: `game/tools/test_save.mjs`.
Do: add a case: save at a dawn with a project half done and a shipment in flight (after F3), load,
run 50 economy ticks: equal to a straight run.
Check (pass/fail): the new case passes.
Done note: "F2.10 frontier survives dawn save."
As built: `test_save.mjs` runs with frontier on and a half-done project at the dawn save; the loaded game matches the straight run after 50 economy ticks (about 70 s). Shipments join this check after F3.

**Phase end:** all `test_frontier_*` tests and the regression set pass; Docs keeper commits
"Frontier economy rules"; Tim playtest: none visible yet. Tim can read the console:
in the `dev_frontier` save the F2.4b debug readout shows the towns ticking.

---

## Phase F4: Town panel

Goal: Tim can read a town's report and steer it. (The world map moved to W2, walking to W3, per-area
grids to W3.2 and the town in the world to E5.) It can be built right after F2, using the
fixture towns in the `dev_frontier` save.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/building_panel.js` (first 60 lines).

### F4.1. Mock the town panel  [TIM]
A thread draws one mock image (no browser runs) of the town panel: stocks, pop and housing, jobs,
doing / next / waiting, priority buttons, and a project list with OK buttons, in the atlas style. Tim
approves or edits.

### F4.2. Frontier in the snapshot  [STRONG]
Needs: F2 done, F4.1
Files: `game/src/sim_snapshot.js`, `game/src/sim_worker_runtime.js`, `game/tools/test_sim_worker.mjs`.
Do: add a `frontier` part to the snapshot: full records for the player's own settlements; for others,
only `{ id, name, owner, region }` if discovered. Roads with state, and only the player's shipments.
Send it at 4 Hz (like the map), not every tick.
Check (pass/fail): the snapshot contains own stock and no rival stock; the packet grows by less than
2 KB for one town; the existing worker test still passes.
Done note: "F4.2 frontier snapshot in."
As built (2026-11-02): the snapshot is filtered per clan at 4 Hz.

### F4.3. Town report helper  [SMALL]
Needs: F4.2
Files: new `game/src/frontier_report.js`, new `game/tools/test_frontier_report.mjs`.
Do: pure function `reportRows(settlementSnapshot)` returning display rows: stock lines with up or
down arrows (from the last value), "Pop 12 / 18", job lines, doing/next/waiting text, and project rows
with `canAuthorize`. No DOM.
Check (pass/fail): given a sample snapshot, rows contain the right numbers and text; waiting
`['food']` gives the text "Waiting for food"; the function does not change its input.
Done note: "F4.3 town report helper in."

### F4.4. Town panel  [SMALL]
Needs: F4.3
Files: new `game/src/frontier_panel.js`, `game/src/command_ui.css` (or a new css), `game/index.html`,
`game/src/main.js` (open/close wiring and the Controls panel rows).
Do: a DOM panel built from `reportRows`, styled like the building panel. Priority buttons and project
OK/cancel buttons send `{ type: 'frontier', action: ... }` commands and show the receipt reason on a
reject. Open it with a free key (check `docs/controls.md`), from the World tab, or by clicking the
town hall in the world. Suggestions show with **Approve** buttons. **Talk to the governor** (Tim,
2026-11-02): each town has a governor character at its town hall (reuse a civilian or merchant sheet);
walking up and pressing Space opens a short conversation in the panel's style: a report in his words
("Food is thin, a farm east of the well would help"), then choices like "Take more initiative"
(turns `autoBuild` on), "Ask me before building" (off), "Ease the taxes" / "Squeeze them harder"
(locks a tax level) and "Handle taxes yourself" (auto). The same toggles exist as plain switches in
the panel for use from afar. Add the Space interaction to the Controls panel. Register it with `hud_layout.js` like other panels. Add the key to the
Controls panel. This replaces the F2.4b debug readout.
Check (pass/fail): `test_frontier_report.mjs` still passes; the `.mjs` syntax copy of each changed
file passes `node --check`.
In game (Tim): the panel opens, numbers move each second, and priority buttons change the governor's
next project.
Done note: "F4.4 town panel in, key <X> (controls.md line needed)."
As built: key O. The governor chat on Space is deferred to E5, so the panel has a Governor button instead. New commands: `setTownOrder`, and `devRoadState` (dev only). Dev console helpers: `infamy.blockRoad` and `infamy.frontierReport`.

### F4.4b. All-towns overview  [SMALL]
Needs: F4.4
Files: new `game/src/towns_overview.js`, `game/src/frontier_report.js` (add `overviewRows`),
`game/src/sim/frontier/commands.js` (`setTownOrder`), the Controls panel rows in `game/src/main.js`,
`game/tools/test_frontier_report.mjs`.
Do (Tim, 2026-11-02): one window listing every town you own, one row each, with a status readout of
the important factors: pop / housing, mood with its worst factor, food trend, ryo per day, main
shortage, current project, road state, garrison, and alert icons. Each row has the town's focus
(grow / produce / trade / fortify) and tax setting as inline controls, and the rows form a
**priority list**: drag to reorder; the order (`state.frontier.townOrder[clan]`) decides which town
gets capital supplies, imports and replacement recruits first. Click a row to open that town's panel.
Sort by any column. Free key for the window; add it to the Controls panel.
Check (pass/fail): `overviewRows` gives one row per owned town with the right values from a sample
snapshot; `setTownOrder` with a wrong-owner or incomplete list is rejected; the capital's shipments
go to the top town first in a Node test.
Done note: "F4.4b towns overview in, key <X> (controls.md line needed)."
As built: key Y. "Ryo per day" shows the ryo stock and its trend. Garrison shows "-" until F6. The capital-shipments test waits for F3.

### F4.4c. Town alerts  [SMALL]
Needs: F4.4
Files: `game/src/sim/frontier/world.js` (alert events), `game/src/news_callouts.js`,
`game/tools/test_frontier_world.mjs`.
Do: the sim pushes `state.news` entries for town events: under attack, building destroyed, road
blocked, mood fell below 40, food running out, project finished, suggestion waiting, town grew a tier.
Each event fires once per change (not every tick), with a cooldown per town and kind. Callouts reuse
the existing callout style; clicking one opens the town panel. Urgent ones (attack, destroyed,
blocked) also flash the town's row in the overview.
Check (pass/fail): a sustained shortage fires exactly one alert until it clears and comes back; the
cooldown holds; alerts only go to the owner.
Done note: "F4.4c town alerts in."
As built: new `sim/frontier/alerts.js` with an `alerts` block in `frontier.json`. The "grew a tier" alert waits for F5.

### F4.4d. Town hover on the map  [SMALL]
Needs: F4.4b, W2.4
Files: `game/src/world_map.js`, `game/src/frontier_report.js` (`hoverCard`).
Do: hovering a town on the World map shows a small card: name, owner, pop, mood, food trend, current
project, road state and alerts for your towns; for others only what you've seen (name, owner, rough
size, last seen). Clicking still opens the full panel (own towns only).
Check (pass/fail): `hoverCard` returns the full card for an own town and only seen fields for a
rival town from a sample snapshot.
Done note: "F4.4d town hover cards in."
Open idea, not decided: a "Build" picker in the town panel.

### F4.5. Playtest  [TIM]
In the `dev_frontier` save, open the towns overview, reorder the towns, hover them on the World map, trigger
an alert with the road-block helper, open both fixture towns' panels, switch priorities, authorize a project, and
watch it build in the numbers.

**Phase end:** all tests pass; Docs keeper commits "Town panel"; Tim playtest F4.5.

---

## Phase W3: Walkable world

Goal: the hero walks out of the city gate into the island. Ground loads in chunks around him, and the
sim loads chunks wherever a town or a battle needs them. This is the hardest technical phase: mostly
STRONG.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `docs/frontier_campaign_plan.md` sections "Region streaming
and transitions" and "Navigation, placement and bounded queues" only.

### W3.1. Chunk design and prototype  [STRONG]
Needs: W1 done
Files: write `to_delete/_chk/chunk_design.md`; new `game/tools/proto_chunks.mjs`.
Why: `createNav(blockers, bounds)` in `sim/nav.js` builds one dense grid over the whole map at
0.5-unit cells, and `createVision` in `sim/vision.js` does the same at 1 unit. The island is about
3,500 times the city's area, so one grid cannot cover it. Each place needs its own small grids.
Do: prototype the default design from the research note
([world_streaming.md](world_streaming.md)):
  1. 250 × 250-unit chunks; nav at a coarser cell outside towns (for example 1 unit).
  2. **Hierarchical pathfinding (HPA*):** portals on chunk borders and a small abstract graph over the
     whole island, built from the terrain data alone, so routes don't need far chunks loaded. Long
     paths search the abstract graph, then refine only inside the unit's current chunk. A building
     or wall edit recomputes only that chunk's portals.
  3. **Active chunks:** the sim keeps a chunk loaded only while it has the hero, an army, a raid or a
     battle in it; other chunks sleep. Towns keep running from their records (E5). Cost follows active chunks, never map size.
  4. **Two levels:** far-off armies, shipments and parties move as records on the abstract graph and
     become real entities only near a loaded area or when two hostile records meet.
  5. Saves store only changes (`state.world` records and towns), never chunk geometry.
Measure build time and memory per chunk and for 9, 25 and 50 loaded chunks, and the cost of
building the island-wide portal graph. The design must also
allow **movement layers** (Tim, 2026-11-01: the hero and crew will pilot a boat around the island):
each chunk can answer path queries for `land` (water blocked) and `water` (land blocked), and sea
chunks around the island load the same way as land chunks. Only `land` is built now.
Check (pass/fail): the prototype builds 9 chunks and finds a path across chunk borders; an
abstract route from the capital to the far west of the island is found without loading the chunks in
between; editing one chunk changes only its portals; the
measurements are in the design note; the city's own grid is untouched.
Done note: "W3.1 chunk design: <scheme>, X ms and Y MB per chunk."

### W3.2. Areas in the sim  [STRONG]
Needs: W3.1
Files: new `game/src/sim/areas.js`, `game/src/sim/game.js`, callers of `sim/nav.js` and
`sim/vision.js`, new `game/tools/test_areas.mjs`.
Do:
  1. `areas.js` keeps the city area (built exactly as today) plus loaded world chunks, each with its
     own bounds, blockers, nav and vision, following the W3.1 design.
  2. Every entity gets `e.area` (default `'city'`). Path, sight, targeting and separation queries use
     the entity's area (and its stitched neighbours in the world). The city and the world never see
     or collide across the gate except through the gate.
  3. The city sits in world coordinates at `world.capital` plus `cityOffset`.
Check (pass/fail): the city nav grid's width and height are identical with and without the world
loaded; a path in the world never visits a city cell; a unit in a chunk is not visible to a city unit;
the full regression set (including `test_port_town.mjs` and `test_vision.mjs`) shows no new failures.
Done note: "W3.2 areas in; city grids unchanged."

### W3.3. Chunk generator  [SMALL]
Needs: W3.2
Files: new `game/src/sim/chunk_gen.js`, new `game/tools/test_chunk_gen.mjs`.
Do: `buildChunk(world, cx, cz, seed)` returns `{ blockers, props, ground }` from the terrain grid:
water and mountain cells become blockers; river cells are blocked except at fords on corridors;
props (trees, rocks, ferns, stumps from `assets/environment/forest_props`) are scattered by biome
with a seed made from the chunk id; no props on corridor, site or node cells.
Check (pass/fail): the same chunk built twice is identical; a water cell always gives a blocker; no
prop lands within 4 units of a corridor; building one chunk takes under the W3.1 target in Node.
Done note: "W3.3 chunk generator in."
Future note, not built (Tim idea, 2026-11-02): forest regrowth. `world.json` keeps the starting forest; cleared cells live in `state.world` as a changes-only list with a stage (stumps, saplings, young, forest) that regrows over days unless built on; `chunk_gen` draws props by stage. See also F5.7.

### W3.4. Drawing the world  [STRONG]
Needs: W3.3
Files: new `game/src/render/world_ground.js`, `game/src/render/view.js`, `game/src/render/texture_cache.js`.
Do: a ground mesh per chunk using the existing `forest_textures` tiles by terrain code, instanced
props, mountains drawn as large painted cutout sprites standing on mountain cells (several overlapping
sprites make a ridge, smaller rock sprites soften the edges; the ground stays flat and the mountain
cells are blockers), chunks loaded in a ring around the camera and disposed beyond it, with bounded caches. Build
chunk geometry in a worker, prefetch chunks in the direction of movement, and reuse pooled meshes;
the sim never waits for graphics. **Night in the wild** (Tim, 2026-11-02): outside the city, nights
are really dark but readable: a soft night-vision glow around the hero's group keeps the ground and
nearby shapes visible (dim, cool, desaturated), while campfires, camps, towns and lanterns make warm
pools of light that reveal colour and detail and also widen sight (fog) around them. Uses the existing
night shading and lantern lights; the sight bonus near fires is a sim rule in `vision.js` so it is
fair for bots too.
Check (pass/fail): Node test of the pure parts (which chunks to load or drop for a camera position,
cache limits); syntax copies pass.
In game (Tim): see W3.7.
Done note: "W3.4 world drawing in."

### W3.4b. Mountain and landmark art  [TIM]
Needs: W3.3
A thread writes image prompts (project rules: own concept, semi-realistic painted look, muted moody
colours, transparent background) for 4 to 6 mountain sprites, 3 rock outcrops, a pass gateway, a
river ford and a lake edge, per biome where it matters (snow, desert, forest). Tim generates them; a
thread cuts them in with the existing cutout tool. Placeholders (scaled boulders) work until then.

### W3.5. City gate and seam  [STRONG]
Needs: W3.4
Files: `game/data/port_town.json` (gate point at the city edge facing the main corridor),
`game/src/sim/game.js`, `game/src/render/view.js`, `game/src/minimap.js`, `game/src/render/fog.js`.
Do: in campaign mode, walking through the gate moves the hero and his group from the city area into
the world chunk at the matching spot, and back. First version uses a one-second fade at the gate (seamless crossing
can come later). While the hero is out, the city runs as today: sector crews defend, bots may raid
(a city lieutenant is a later campaign-rules item). Fog and the minimap switch to world mode outside. In
Classic mode the gate is closed.
Check (pass/fail): Node: the hero crosses out and back with his group; positions line up within 1
unit; Classic mode refuses.
Done note: "W3.5 city gate in."

### W3.6. World walk benchmark  [SMALL]
Needs: W3.5
Files: new `game/tools/profile_world_chunks.mjs`.
Do: a Node script that walks a hero 5,000 units out along the main corridor and reports chunk build
time (average and worst), loaded chunk count and memory.
Check (pass/fail): the script runs and prints the numbers; loaded chunks stay within the W3.1 limit.
Done note: "W3.6 world walk: X ms worst chunk, N loaded, Y MB."
As built (2026-11-02): the island is one more place (`e.place === 'world'`, island coordinates): 250-unit chunks, 1-unit walk grid, island-wide route graph (HPA*) from `world.json`. No geometry worker (a chunk takes about 1 ms). City grids unchanged. Ground by biome uses the city ground textures (forest tiles later), dirt trails on corridors, placeholder props and mountains (scaled boulders) until W3.4b. No fog shading on the island; enemies are hidden outside sight. Minimap clicks are off on the island (view only; W4). Benchmark (5,000-unit walk, 6 crew, bots in the city): chunks average 0.8 ms, worst 9 ms, 12 to 18 active, cache 50, +10 MB heap, sim tick average 2.3 ms.
**Campaign mode** now exists: match option `mode` (`classic` default, `campaign`); campaign skips the season end (F0.4). `dev_frontier` is a campaign save. Top bar and M map read "Campaign · Day N"; in-game saves record the real mode (it was always `classic`).
**City gate (W3.5):** campaign only. Space at the ring by the lantern post where the east trail out of town ends (96,8); the hero plus selected and following crew go out and back with a 1 s fade. Big ring and a G on the minimap; gate art is prompt 13 in the W3.4b art pass. Classic: shut with a notice.
**Playtest fixes:** gate moved to the east trail end; Controls panel page buttons at the top with long sections in columns (`layout_pages.js`); island minimap camera box, zoom and N arrow (the minimap stays turned like the camera). Test-build instant travel: World tab, click empty ground or the Capital, confirm; sim command `travel`, only with the dev frontier flag and campaign; to be replaced by real travel (roads, railway, mounts).
Known follow-ups (with W3.4b art): the hero gets stuck or slides diagonally along blocked areas (mountain edges, 50-unit terrain cells as square blockers); decide how unpassable areas look and feel once the mountain art is in. W4: minimap clicks on the island (look there or send crew). Side finding, not from W3: in Classic too, one tick takes about 1.7 s when `deployment.js` builds a sector walk grid (`shapeDistance`); worth a later performance pass. Regression set passes except `test_crew` line 97 (already failing before).

### W3.7. Playtest  [TIM]
In campaign mode, walk out of the gate, explore for a few minutes, cross a river ford, walk back in.
Watch Firefox memory and frame rate. Check that the ground looks right by biome.


### W3.8. Generate the island art  [SOURCE SET COMPLETE; FOLLOW-UPS OPEN] [TIM]

The original 25-image W3.8 source set has been generated and verified in `assets/environment/island/`.
The approved source prompts and inventory are in `assets/image_prompts.md` under Island art. Follow-up
art from the first walkthrough is tracked separately there; do not treat source generation as completion
of terrain mapping, visual calibration, or runtime integration.

Saved in `assets/environment/island/`:

| Set | Files |
|---|---|
| Cliff pieces, per biome (forest, snow, dry) | `cliff_<biome>_a.png`, `cliff_<biome>_b.png` (straight, south face, runs upper left to lower right), `corner_out_<biome>.png` (V pointing at the viewer), `corner_in_<biome>.png` (notch opening to the viewer), `rim_<biome>.png` (far side, low lip) |
| High-ground textures (top-down, seamless, opaque) | `top_forest.png`, `top_snow.png`, `top_dry.png` |
| Outcrops | `outcrop_moss.png`, `outcrop_snow.png`, `outcrop_dry.png` |
| Landmarks | `pass_gate.png`, `river_ford.png` and `lake_edge.png` (top-down decals), `city_gate.png` |

Checkpoint (2026-11-02): W3.9 baseline cliff/top/outcrop/city-gate assets are imported and mapped from
the blueprint-derived mountain cells; movement/corner handling is implemented and coordinator-reported
checks passed. The tour markers and temporary staged review props have been removed. Twenty-one
follow-up assets (8 numeric lake banks, 4 opposite-bank rims, 9 high-ground variants) are saved and
accepted, but still await mapping/integration. Four snow-lowland textures are now saved:
`ground_snow.png`, `ground_snow_b.png`, `ground_snow_thaw.png`, and `ground_snow_thaw_b.png`.
Coordinator verified all are 1254 × 1254 with opaque alpha 255 (prompts targeted 1024 × 1024).
Large-area seamless continuity still needs review; mild directional grain or patch alignment may show.
Runtime integration remains pending. W3.8/W3.9 visual and biome-ground work remains open.

Check: Tim puts them side by side. They should share the same angle, light and colours, and the trees
should be the same size as the game's pine. Redo any that stand out.

### W3.9. Build the ranges from the pieces and make blocked areas walk smoothly  [BASELINE IMPLEMENTED; VISUAL/INTEGRATION OPEN]

Needs: W3.8 images. Read the whole plan and step_runner_guide.md first, as for every step.

**Status (2026-11-02):** Baseline art import and deterministic placement from blocked terrain cells
are implemented; world-only corner slipping and baseline checks are complete. This does not close the
visual art pass. Follow-up priorities and Tim's walkthrough approvals live in
`docs/frontier_campaign_plan.md`; keep generated art, terrain mapping, and runtime integration as
separate completion checks.

**Why:** in the W3.7 playtest the hero got stuck or slid diagonally along mountains and water.
- `sim/chunk_gen.js` merges blocked 50-unit terrain cells into row-run rectangles, so a range whose
  outline runs diagonally in the world is a staircase of square corners.
- `tryMove` in `sim/game.js` resolves x and z one after the other and stops flush against a box.
- The iso camera turns W/A/S/D into diagonal world moves. Against a staircase edge, one axis is
  blocked and the other slides (diagonal on screen), or the hero catches on a step corner (stuck).

**Camera facts:**
- The camera sits to the south-east at an elevation of atan(0.5); `SCREEN_RIGHT` is (+x, −z).
- A south face (cell edge along x) shows as a line from the upper left to the lower right, facing the
  lower left.
- An east face (edge along z) is the mirror image, so draw it as the flipped cliff piece.
- An outer south-east corner is the bottom point of a V. North and west edges face away and get the
  low rim piece.

**Steps**
1. **Cut the art in.**
   - Single transparent PNGs need no sheet cutting. Copy them to `game/art/props/` (textures to
     `game/art/ground/`) and add their entries to `game/art/cutouts.json` (size and ground anchor).
     Reuse the anchor code in `tools/cut_environment.py`, for example with a small
     `--singles assets/environment/island` mode.
   - ChatGPT's PNGs come out nearly opaque inside (alpha about 250 instead of 255). Snap alpha above
     240 to 255 so the pieces don't show the ground faintly through them.
   - Add `game/data/art.json` entries (scale, foot, solid). Set each scale so the trees in the piece
     match the pine prop (about 5.5 units wide). Measure one tree per image rather than guessing.
2. **Place pieces on the edges of blocked mountain cells** (deterministic, in `sim/chunk_gen.js` as
   chunk data so the sim and drawing agree; drawn in `render/world_ground.js`):
   - For each mountain cell, look at its 4 neighbours. A free south neighbour gets a south cliff piece
     along that edge; a free east neighbour gets a flipped piece. Variant a or b is chosen by a hash of
     the cell.
   - The cell's south-east corner gets `corner_out` when both south and east are free.
   - A concave step (south free here, east blocked, and that east cell's south free) gets `corner_in`.
   - North and west free neighbours get `rim` (flipped for west).
   - The biome comes from the region (forest, snow or dry).
   - Interior mountain cells get the `top_<biome>` ground texture, plus a few full-size pine props on
     forest tops (`world_chunks.json` density).
   - Outcrops go where pieces meet badly (chunk borders, single-cell spurs).
   - Landmarks: draw `pass_gate` only at a walkable pass flanked by mountain cells; stale pass
     metadata without that terrain fit is ignored. Legacy `river_ford` and oversized painted-water
     `lake_edge` emissions are disabled. Integrate resized ford art at actual crossings and the eight
     accepted numeric lake-bank pieces around code-rendered water, aligning the visual shore with
     terrain/collision. `city_gate` replaces the lantern-post marker at `port_town.json` islandGate,
     with the same art on the island side of the gate.
3. **Make the blocked areas walk smoothly** (the stuck/slide fix):
   - a) Blockers stay the cell squares, since the cliff pieces follow cell edges exactly. Make sure
     each run is one clean rectangle per row and that touching runs share edges exactly (no 1e-9
     gaps).
   - b) Add **corner slip** to `tryMove`, for `place === 'world'` only. When a move is stopped by a box
     corner with less than about 0.6 units of overlap, nudge along the other axis so the hero rounds
     the corner. City movement must stay exactly as it is.
   - c) Pressing straight into a wall that runs diagonally on screen should slide the hero along it
     smoothly. That is the one-axis slide working as intended, now that the art shows a wall there.
   - d) The fine walk grid in `sim/areas.js` is built from the same blockers, so crew paths follow
     automatically. Check that crew don't zigzag along the staircase; if they do, smooth with a
     string-pull step like the city's.
   - e) Water and river edges: same corner slip; the lake_edge decal and outcrops soften the look.
4. **New test `tools/test_island_edges.mjs`:**
   - Pick 200 blocked edge points (mountain and water) from several regions.
   - At each point, walk the hero into the edge in all 8 screen directions for 3 s each, then away.
   - Assert that he never ends inside a blocker, that he always gets clear within 1 s when walking
     away, and that pressing diagonally into an edge moves him along it at least half his speed (no
     catching on corners).
   - Check that piece placement is deterministic (the same chunk twice gives the same pieces).
   - Also run test_world_gate, test_areas, test_chunk_gen, test_port_town and the combat regression;
     all must pass unchanged.
   - `profile_world_chunks.mjs` should stay within +20% of the W3.6 numbers (chunks avg 0.8 ms,
     worst 9 ms).
5. **Checkpoint:** Tim playtests with the test-build instant travel (World tab, click and confirm).
   He walks along a forest range, a snow range and a dry range, a river with a ford and a lake shore,
   and goes through the city gate both ways.

**Process:** if a piece's art doesn't line up with its cell edge, fix the anchor in art.json rather
than moving blockers. If the pieces look too repetitive along long ranges, ask Tim before generating
more variants.

### W3.10. Paint the island and fit the walkthrough art  [SMALL]

Needs: W3.9 baseline. Read the whole plan, step_runner_guide.md and **docs/world_painting.md** (the
procedure) first.

**Part A: ground painting by the procedure** (docs/world_painting.md, layers 1 to 8)
1. `src/world_paint.js`: a pure, seeded module shared by the sim and the renderer. It gives the biome
   field (blurred cells, domain warp, edge noise), material weights, grove noise and the stamps
   lookup. `game/data/world_paint.json` holds all numbers, material tables, prop sizes and stamps.
2. Ground (`render/world_ground.js` + the ground shader in `render/shading.js`, island only):
   - the material mosaic per biome with height blend;
   - stochastic tiling (offset and 90° rotation per cell, smooth blend);
   - macro colour drift;
   - at most 8 materials per chunk.

   Import the textures: the forest tiles; the snow lowland set (ground_snow, ground_snow_b, plus the
   thaw pair at snow edges, with seams blended at import); the top B/C/D variants. Snow-code cells
   must use the snow set, not sand/gravel.
3. Trails and banks: corridors with noisy width, a ragged edge and a worn verge; muddy banks on
   rivers.
4. Props (`sim/chunk_gen.js`): the jittered grid, grove and clearing density, trail clearance, edge
   trees, undergrowth near trees, sizes in units, stamps clearing or adding props. Keep blocking props
   as blockers.

**Part B: walkthrough art still open** (Tim's notes in docs/frontier_campaign_plan.md)
5. Replace the old painted lake decals with the 8 numeric bank pieces (lake_edge_1 to 8: N, NE, E,
   SE, S, SW, W, NW) around code-drawn water. Line the bank art and the blockers up with the shore.
6. Place the 4 opposite-bank rims on forest and snow ranges (high ground facing inward).
7. Shrink the ford art by 1 to 2 tiles and fit it at real thin river crossings. Pass gates go only at
   real passes.
8. Not in this step: the dry range waits for Tim's blueprint decision.

**Checks**
- New `tools/test_world_paint.mjs`:
  - each chunk built twice is identical;
  - splat values and props match along every shared chunk border;
  - no prop on corridors, blocked cells, within 3 units of a trail, or in a clearing stamp;
  - density per biome stays within the data ranges.
- test_island_edges, test_world_gate, test_areas, test_chunk_gen, test_port_town and the combat
  regression all pass.
- `profile_world_chunks.mjs` stays within +20% of W3.6.
- Before building the shader, render the mock (`tools/ground_mock.py`) for a snow edge and a meadow
  with a trail, and show Tim.

**Checkpoint:** Tim playtests with test travel (World tab): a forest edge, a snow lowland, a lake
shore, a ford, a pass and a trail across a meadow.

As built (W3.10, 2026-11-03): `src/world_paint.js` (pure, seeded biome field, material weights, thaw band, banks, trails, groves, stamps), `data/world_paint.json` (all numbers, 35 materials), `render/island_ground.js` + `islandGroundMaterial` in `render/shading.js` (texture array, random tiling, height blend, colour drift, code-drawn water), painted props in `sim/chunk_gen.js` when `cfg.paint` is on, lake bank strips, opposite rims, fords only at the 8 ford crossings (`sim/island_art.js`), `tools/import_island_ground.mjs`. Playtest additions already in: city wall line seen from the island, gate stamp and trail, livelier meadows. Over budget: chunk build average 1.9 ms, worst 15 ms (see `world_painting.md` Budgets). `test_crew` still fails as before.

### W3.11. Island follow-up phases (from the W3.10 playtest)

Order = lowest usage first (Tim, 2026-11-03). Anything that needs new art waits in the art phase (P5). Item numbers in brackets point to [island_playtest_notes_2026-11-02.md](island_playtest_notes_2026-11-02.md).

#### P1 Quick fixes (small, data and tool changes; Sonnet) — DONE 2026-11-03
As built: seamless sand/grass/dry_grass/mud tiles, more trees, shrubs and outcrops, toned-down cliff-foot patch, edge-blended island water texture (`water.jpg`, fixes the crisscross), map grid toggle (# button).
- Sand/grass grid lines: mark the city JPEGs `seamless` and re-run tools/import_island_ground.mjs; check the forest *_tile textures and the water stripes the same way [6d, 9].
- More trees and shrubs in every biome, and random rock outcrops from the existing outcrop_moss/snow/dry art. Forest grove = target; pass, cliffs and dry land first; open biomes stay open. Data in world_paint.json `props`; watch chunk build time [5, 6, 6a, 6d].
- Tone down the dark cracked patch at the cliff foot in the dry mosaic [6].
- World map grid: hidden by default, a toggle (Controls panel entry), fainter lines [2].
- Playtest: also check a real ford (V2-F1 at 9552,1851, by site S08).

#### P2 Maps (UI only) — complete; Tim playtest passed 2026-11-02

Tim approved `docs/images/frontier/p2_maps_mock.png` before implementation and has now playtested P2 successfully.

- [x] World map north-up, aspect-fitted to the real 14,000 × 8,000 island without stretching; 24 px ruler gutter.
- [x] Always-visible 500-unit A–AB / 1–16 labels, exact hovered x/z and square, and own-location marker; grid lines remain an optional, default-hidden overlay.
- [x] HiDPI canvases capped at DPR 2; shared per-world terrain cache with 4× smoothed rendering; overlays/location refresh at 4 Hz.
- [x] North-up island minimap with correctly oriented diamond camera footprint. World map shows the camera footprint only while the hero is on the island.
- [x] Same-place and >60-unit test teleports release stale pan/far-camera/watch state; camera matrices update before footprint raycasts.
- [x] Keep map presentation lightweight while open: update camera projection math, but suspend scene, GPU, prop, and VFX painting. City-map orientation stays camera-oriented.
- [x] Controls panel and `controls.md` updated. Node checks passed: `test_world_map.mjs` (north-up/grid/DPR/cache/pan/zoom/camera quad), `test_camera_tracking.mjs`, `test_map_performance.mjs`, and the reported combat/inventory/business/bot/sim-worker/settings regressions. `test_crew.mjs:97` retains its pre-existing teahouse-vs-street failure.
- [x] Tim's in-game playtest passed 2026-11-02; P2 is complete.

High-resolution note: canvases are DPR-aware and terrain is rendered from a shared 4× smoothed cache, but the underlying geographic grid remains 50-unit cells. Finer minimap terrain detail is a separate future idea; no additional map art or build is approved here.

Process note: suspending map presentation must leave camera projection updates live; keep graphics paused while camera math continues.


#### P3 Edges and water — DONE, Tim accepted (2026-11-03)

- [x] Coast rounding/blending and diagonal-seam removal.
- [x] Water surface/reflection, depth gradient, foam/caustics, inland banks and visual-only rounded ford corners accepted.
- [x] Focused inland-bank, capture and clustering tests pass; old winding assertion failure resolved.
- [ ] Retain documented corner/crossing checks and representative-load performance measurement.
- Current implementation: [water plan](../assets/environment/island/water_surface_plan.json). Obsolete paused checkpoint moved to to_delete/.

#### P4 Coast cliffs and dry range — built 2026-11-03; Tim playtest passed 2026-11-03
- Built: the dry skirt is painted through `world_overrides.json`; `coastCliff` settings line the coast with the cliff art, leaving open areas at Sallow Bay, the east Heron inlet and the Ashen Wash mouth; island ground is capped at 24 materials (`island_ground.js`). Seeded by `tools/seed_world.mjs`.
- Tests: `test_p3_edges` passes (its two coast spots moved to open shore). **Open follow-up:** `test_island_edges` still fails on a river-corner snag at 4200,4275, which predates P4.
- Mark coast cells and line most of the coast with the existing cliff/rim/corner art; keep harbours and landings open [4b].
- Dry-range blueprint: blueprint.py -> seed_world.mjs, sites/routes/passes still validate [dry range].

#### Ground cover clustering — built 2026-11-03 (Tim: "clustering is perfect")
- 28 families, half-scale ground props, oddity size/rate tuning, marsh trees, jungle trees unmirrored. Details in the [clustering plan](../assets/environment/island/groundcover_clustering_plan.json); D visual acceptance passed; E current-world performance acceptable provisionally, representative-load measurement open. Prop census tool: `game/tools/prop_census.mjs`.

#### P5 Biome art — integrated; crop repair complete (Tim, 2026-11-02)

- [x] Prepare reuse audit, proposed densities/sizes, four full basic sheet prompts and 25 individual specifications (23 transparent sprites plus two optional opaque tiles). These individual strings are specifications/fallbacks, not additional generations. See [owner prompt plan](../assets/image_prompts.md#p5-biome-art-plan-only-2026-11-02) and [planning JSON](../assets/environment/island/p5_biome_art_plan.json).
- [x] Tim approved all six basic categories, grouped transparent 3×2 sheets, and all 36 rare oddity concepts grouped into six biome sheet candidates. Reuse overlapping assets before final packing; no duplicate well/shed/shrine generations.
- [x] Generate ten accepted transparent sheets; cut/import all 57 sprites and integrate common replacements and sparse seeded decorative oddities. Repair all cuts with reviewed object regions; Tim accepted repaired previews.
- [x] Record source/crop audit, anchor fix, runtime integration and validation limits in the [owner prompt record](../assets/image_prompts.md#p5-biome-art-plan-only-2026-11-02).
- [x] Import wet v2/dry v1/snow v1 at native 2172 × 724; implement continuous terrain-border ribbons, material/repeat blending, feathering/exclusions and chunk disposal without gameplay/collision changes. [Owner status](../assets/image_prompts.md#coastline-plan-and-wet-trial-2026-11-02), [plan](../assets/environment/island/coastline_art_plan.json), [prompts](../assets/environment/island/coastline_prompts.txt).
- [x] Tim accepted the final water-motion/reflection/inland banks and coastal playtest (2026-11-03).
- [x] Approve eight shoreline orientations and distinct biome material/silhouette families for planning; beach banks and coastal cliffs are separate geometry families. Exact endpoints, land/water sides, corners, connectors and spans await later water design; existing eight lake images do not complete a coast kit.
- [ ] Bridges, lakes, river sources and capital silhouette remain deferred; no copy-ready prompts are approved for them. See the [island playtest notes](island_playtest_notes_2026-11-02.md) for the W3.10 walkthrough handoff.

Completed biome integration (2026-11-03): jungle, regular forest mushrooms/ferns, marsh props/textures, dry-mountain art selection, coverage map and sizing/density/ground processing are saved. [Owner record](../assets/image_prompts.md#jungle-regular-forest-and-marsh-integration-2026-11-03). Final reflection-water pass visually accepted.

#### Later (Tim OK'd)
- Chunk build and ground-paint speed-up after the main build [8].

**Phase end:** tests pass; Docs keeper commits "Walkable world"; Tim playtest W3.7.

---

## Phase W4: Wilderness content

Goal: the island has things to find: camps, resource nodes and scoutable sites.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/sim/bandits.js` (function list only).

### W4.1. Camp rules  [TIM]
Tim decides: bandit camp strength and respawn (proposed: cleared camps stay cleared for N days,
first clear gives the better reward with a claim record so reloads can't reroll it); ruin and cache
rewards. **Decided (Tim, 2026-11-01): native villages start neutral and can trade or turn hostile**
(a per-clan relation value that trades raise and attacks lower; hostile below a threshold). Richer
dynamics come later. W4.2 adds the relation record; trading itself waits for F3.
**Resources (updated Tim, 2026-11-04; no grind):** small resource spots everywhere plus the 107 nodes
as rich deposits ([Loop 3 design](#loop-3-design-tim-2026-11-04)). A town's workers work spots and
deposits within 600 units; a farther deposit needs a placed **work camp** (drop-off) linked by road
(F5.7), which makes deposits worth fighting over. Pieces never run dry: they go through harvest
stages, slow to a trickle and grow back. **Iron** from ore deposits becomes a 6th resource, used only for rifles, cannons and armory
upgrades (arrives with F6.8; the early economy stays at 5), and the governor fetches it by itself.
**Camps (decided, Tim 2026-11-02):** bandit camps are weaker near the capital and stronger farther
out; a cleared camp stays clear for 5 days, then may return somewhere nearby; the first clear gives
the better reward with a claim record, so reloads can't reroll it. Ruins and caches are one-time
finds (ryo, an item, or a map reveal). Native villages trade food and goods for special items and
scouts; relation rises with trade, falls with attacks. Fuller natives, set-piece areas and unique
items are Phase W5.

### W4.2. Camps in the world  [SMALL]
Needs: W4.1, W3 done
Files: new `game/src/sim/camps.js`, `game/data/world.json` (camp definitions), new `game/tools/test_camps_world.mjs`.
Do: when a chunk with a camp is loaded in the sim, spawn its units from the existing bandit unit
definitions with `e.camp = <id>`; store `state.world.camps[id] = { cleared, clearedDay, claimed }`;
unloading the chunk despawns the units but keeps the record. Native villages get
`state.world.relations[village][clan]` (start neutral); attacking villagers lowers it, and below the
threshold their units treat that clan as hostile. A first clear writes a claim record and
gives the reward once.
Check (pass/fail): reloading a chunk doesn't respawn a cleared camp before its respawn day; the
first-clear reward is given once, even after save/load and reload.
Done note: "W4.2 world camps in."

### W4.3. Nodes and site markers  [SMALL]
Needs: W3 done
Files: `game/src/render/world_ground.js`, `game/data/art.json` (marker props).
Do: draw resource nodes (stacked logs, stone outcrop, fishing posts) and unclaimed sites (survey
stakes with a small flag) from existing props, so they read at medium zoom.
Check (pass/fail): syntax copies pass; the pure placement helper is tested.
Done note: "W4.3 node and site markers in."

### W4.4. Scouting a site  [SMALL]
Needs: W2.3, W4.3
Files: `game/src/sim/discovery.js`, `game/src/world_map.js`, `game/tools/test_discovery.mjs`.
Do: when the hero scouts a site, compute and store its report: soil, water, defence, nodes within
600 units, distance to the capital by corridor, nearby camps. Show it in the World tab's site box and
as a small popup in the world.
Check (pass/fail): the report numbers match the world data for a test site; an unscouted site shows
no traits in the snapshot.
Done note: "W4.4 site scouting in."

### W4.5. Playtest  [TIM]
Explore, clear a bandit camp, scout three sites and compare them.

**Phase end:** tests pass; Docs keeper commits "Wilderness content"; Tim playtest W4.5.

---

## Phase C: The city in the campaign

Goal (Tim, 2026-11-02): the city keeps a real job in the campaign instead of a 10-dawn race. It is
the market, the recruiting ground and the seat of Influence, and the existing city operations become
economic warfare that feeds or starves the frontier. A lieutenant runs it while the hero is away.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/sim/bot.js` (rule list and `createBot` only),
`docs/rival_bot_plan.md` (first 40 lines).

### C1. Campaign city rules  [TIM]
Tim confirms or edits: Influence replaces the season score (Renown feeds it; it unlocks town permits,
better import prices, police leniency, elite recruits; it never ends the game); frontier goods sell
through owned businesses (more and bigger businesses = better prices); Shakedowns, Sweeps and
contracts hit the target clan's city income and trade prices; the lieutenant's standing orders and
budget; what winning the campaign means (proposed: top Influence plus key businesses plus a share of
the island; can stay open until the campaign-rules phase).

### C2. The lieutenant is the bot brain  [STRONG]
Needs: C1, F1
Files: `game/src/sim/bot.js`, new `game/src/sim/lieutenant.js`, `game/data/bots.json`
(`lieutenant` block), new `game/tools/test_lieutenant.mjs`.
Do: the lieutenant is the same bot brain the rival clans use (`createBot`), run for the player's clan
while the hero is outside the city, so he is exactly as competent as the AI by construction.
**Decided (Tim, 2026-11-02), so the lieutenant isn't overrun:** (1) the same applies to every clan:
rival bosses also leave for the frontier and their cities run on their own lieutenants with the same
rules; (2) all standing orders are on by default, so he plays at full bot strength unless the player
restricts him; (3) every lieutenant gets a **city captain** (new unit type in `units.json`: a tough
crew boss with hero-like but lower stats, using an existing sheet) who leads defence and raids while
the boss is away; (4) campaign pacing in `settings.json` `campaignCity`: a raided business can't be
raided again for N days (placeholder 3), an HQ can be hit but not lost while its boss is away, and
the leader gang-up bounty (`sim/leader.js`) is off in campaign mode. Other changes from a rival bot:
only the rule groups the player's standing orders allow run (`defend`, `retake`, `shakedown`,
`sweep`, `contracts`, `hire`); spending is capped by the player's city budget;
he never sells or abandons businesses, never moves the hero, and never touches frontier towns or
armies. He uses the match difficulty's competence settings. When the hero is back in the city, he
stops (or keeps running defend only, if the player wants).
Check (pass/fail): a Node run with the hero away and orders "defend + retake": he issues only allowed
commands, all accepted; the captain spawns when the boss leaves and stands down when he returns; a
raided business refuses a new raid for the cooldown; an away boss's HQ never changes owner; leader
bounties don't fire in campaign mode; spending never exceeds the budget; with "defend only" he never starts a
Shakedown; an all-bot comparison shows his win rate against a rival bot is close to even.
Done note: "C2 lieutenant in (bot brain with standing orders)."

### C3. Standing orders in Deployment  [SMALL]
Needs: C2
Files: `game/src/deployment_panel_ui.js`, `game/src/sim/lieutenant.js` (command `lieutenant
{ orders, budget }`), the Controls panel rows in `game/src/main.js`, `game/tools/test_lieutenant.mjs`.
Do: a "While I'm away" section in Deployment: order toggles, a budget slider, and a short log of what
the lieutenant did ("Retook the teahouse", "Shakedown on Kuroda warehouse: +180 ryo"). Big events also
use the F4.4c callouts.
Check (pass/fail): the command validates owner and values; a rejected command changes nothing; the
log keeps the last 20 entries.
Done note: "C3 standing orders panel in (controls.md line needed)."

### C4. Influence  [SMALL]
Needs: C1
Files: new `game/src/sim/influence.js`, `game/src/sim/territory.js` (campaign mode only),
`game/data/settings.json` (`influence` block), new `game/tools/test_influence.mjs`.
Do: in campaign mode, the season score becomes Influence, a running total per clan from businesses
held, Renown and frontier trade volume, with unlock thresholds from data. Classic mode is unchanged.
Check (pass/fail): Classic matches today's season tests exactly; in campaign mode Influence rises
with the listed sources and unlocks fire once per threshold.
Done note: "C4 Influence in (campaign mode)."

### C5. City ops hit rival income  [SMALL]
Needs: C4, F3
Files: `game/src/sim/shakedown.js`, `game/src/sim/sweep.js`, `game/src/sim/contracts.js` (one hook
each), `game/src/sim/frontier/logistics.js` (sale price modifier), `game/tools/test_influence.mjs`.
Do: a successful Shakedown, Sweep or sabotage contract on a clan also applies a timed modifier to that
clan's frontier sale prices and import costs (placeholders in data), shown in its alerts. Rewards stay
as they are.
Check (pass/fail): after a Shakedown on a rival, its next frontier sale earns less for the set time;
modifiers never stack past the cap; Classic mode is unaffected.
Done note: "C5 city ops now hit rival frontier income."

### C6. Playtest  [TIM]
Walk out with standing orders "defend + retake", come back after a few days and read the log. Check
Influence unlocks and that a Shakedown on a rival dents their trade.

**Phase end:** tests pass; Docs keeper commits "City in the campaign"; Tim playtest C6.

---

## Phase E: Expedition and founding

Goal (Tim, 2026-11-01): the campaign begins with founding. You lead your hero, a crew group,
settlers and riflemen into the wilderness, pick a site you like (for looks or for strategy), and
found a town there.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/sim/clans.js` (hire function only).

### E1. Expedition rules  [TIM]
**Decided (Tim, 2026-11-02):** an expedition is the hero, up to one crew group of 6, at least 5
settlers and optional riflemen. Settlers cost 60 ryo each (placeholder), are hired at HQ in campaign
mode only and don't count against the crew cap. Founding costs 500 ryo (placeholder), paid at
founding. More towns can be founded later, each with a new expedition. ~~Founding is allowed only on a
scouted site (one of the ~60 W1 sites).~~ **Updated (Tim, 2026-11-02):** the player can found a town
anywhere buildable, at least 1,000 units from other towns; the 60 sites are hint spots with known
traits. Bots found only on the 60 sites. Traits are computed for any spot from the terrain. Losses on the way: a settler who dies is gone for good; if
the hero is knocked out, he wakes in the city and the rest of the party walks home.

### E2. Settler unit  [SMALL]
Needs: E1
Files: `game/data/units.json` (settler type), `game/data/art.json` (reuse a civilian sheet first; any
new character uses the per-model sprite flow), `game/src/hire_menu.js`, new `game/tools/test_settler.mjs`.
Do: a non-fighting settler unit hired at HQ in campaign mode only. Settlers follow the hero like
crew, flee from fights, and don't count against the crew cap (E1).
Check (pass/fail): hiring a settler costs the set price; settlers can't be hired in Classic mode;
they never attack.
Done note: "E2 settler unit in."

### E3. Found a town  [SMALL]
Needs: E2, F2 done, W4.4
Files: `game/src/sim/frontier/commands.js`, `game/src/sim/frontier/world.js`, new `game/tools/test_founding.mjs`.
Do: action `found { site }` is valid when the hero and at least the E1 number of settlers stand
on a buildable spot at least 1,000 units from other towns (bots: within 30 units of an unclaimed
W1 site) in campaign mode. It pays the founding cost, turns the
settlers into the town's first people, creates a settlement record (Shared design shape) with the
spot's traits (computed from terrain), sets the owner, places a tier 1 town hall (F6.1) and queues a stockade project.
Check (pass/fail): a valid found creates exactly one settlement and removes exactly those settler
entities; founding on unbuildable ground, within 1,000 units of a town, or with too few settlers, is rejected and changes
nothing; a founded town survives save/load.
Done note: "E3 founding in."

### E4. Site traits change output  [SMALL]
Needs: E3
Files: `game/src/sim/frontier/economy.js`, `game/data/frontier.json`, `game/tools/test_frontier_economy.mjs`.
Do: soil scales farm output, resource spots and deposits within range scale timber and stone (updated Tim, 2026-11-04: lumber camps and quarries become placed node camps, see Loop 3 design), water
caps the housing per well, and defence gives the stockade a bonus. All factors live in `frontier.json`.
Check (pass/fail): two towns with different traits and identical buildings produce different
amounts in the expected direction; no factor is hard-coded.
Done note: "E4 site traits in."

### E5. The town in the world  [STRONG]
Needs: E3, W3 done
Files: `game/src/sim/areas.js`, `game/src/render/world_ground.js`, `game/src/render/view.js`.
Do: a town's economy runs from its settlement record whether or not its chunks are loaded
(decided Tim, 2026-11-02: cost grows with what is active, never with how many towns exist). Its
chunks load in the sim only while the hero, an army or a raid is there, and in render only when the
camera is near. Buildings
are drawn from the town records using existing building cutouts: unbuilt projects as a flat dirt
footprint, frames as the cutout at 50% opacity, finished as normal.
Check (pass/fail): Node: walking away from a town unloads its chunks, and its economy gives the
same numbers after 200 economy ticks as standing in it; walking back reloads the same buildings.
In game (Tim): see E7.
Done note: "E5 towns in the world."

### E6. Bot expeditions  [SMALL]
Needs: E3
Files: `game/src/sim/bot.js` (one new rule group), `game/data/bots.json`, new `game/tools/test_bot_founding.mjs`.
Do: in campaign mode, a bot clan hires settlers and sends an expedition, led by its boss (same rule
as C2: rival bosses leave for the frontier), to the best-scoring free site (traits plus distance),
using the same commands as the player. It respects difficulty settings.
Check (pass/fail): an all-bot Node run founds one bot town by the set day; the bot never issues a
rejected `found`.
Done note: "E6 bot expeditions in."

### E6b. Remove the test starter towns from real games  [SMALL]
Needs: E6, L3.1
Note (Tim, 2026-11-04): the test starter towns stay until E6 bot expeditions are complete, then this card removes them.
Files: `game/data/frontier.json` (`settlements`, `roads`), new `game/tools/fixtures/frontier_fixture.json`,
the frontier tests that load `frontier.json` (about 16 in `game/tools/`; grep first), `game/tools/make_dev_save.mjs`.
Do:
  1. Move the fixture towns `s_frontier_1` ("First Frontier") and `s_frontier_2`, and the
     fixture roads `r1`/`r2`, into `frontier_fixture.json`. Tests merge it over `frontier.json`
     with a small `withFixture(data)` helper. No test assertion changes.
  2. A real campaign then starts with only the capital, and towns come from founding. Rival towns now come from E6 bot expeditions.
  3. `dev_frontier` keeps working: it founds its town through the normal `found` command.
Check (pass/fail): every frontier test passes unchanged with the fixture; a fresh campaign game has
exactly one settlement (the capital); `make_dev_save.mjs` rebuilds `dev_frontier` with a founded town.
Done note: "E6b test starter towns removed from real games."

### E7. Playtest  [TIM]
Hire settlers, pick a site, walk the expedition there (fighting off bandits on the way), found the
town, and watch it start building. Check the bot founds its own town.

**Phase end:** tests pass; Docs keeper commits "Expedition and founding"; Tim playtest E7.

---

## Phase F3: Roads and shipments

Goal: goods really travel between the capital and the frontier town, and a blocked road stops them
without losing anything. All SMALL. In the campaign a road is a construction project along a
route the player picks between two settlements (or a settlement and the capital, or a junction on
another road), so roads form a branching network. A route planner suggests the cheapest path over
the W1 terrain grid (works without loading chunks, using the W3.1 route graph) and the player can
drag it through other points; its length and terrain set the cost. Building it costs timber, workers and 2 ryo per unit of length (placeholders in
`frontier.json`; a 540-unit road is about 1,100 ryo and a few days). Tests use the fixture road.
**Decided (Tim, 2026-11-02): roads must never become the whole game or a constant chore.** Every
cart travels with an escort that beats bandits and random trouble except in rare cases; enemy clans
can raid roads (F6), but raids are capped and spaced out (F3.6).

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02).

### F3.1. Road graph and connection state  [SMALL]
Needs: E done (F2 for the rules; fixture road in tests)
Files: new `game/src/sim/frontier/logistics.js`, new `game/tools/test_frontier_logistics.mjs`.
Do: `createLogistics({ state, data, world })` with `route(from, to)` (shortest path over links by
travel time). Each link has `mode: 'road'` now; `'rail'` and `'sea'` come later with their own speeds,
so nothing assumes every link is a road. Also add `setBlocked(road, at, by)` / `clearBlocked(road)`. A road is `threatened` when a
hostile is within 100 units of it, `blocked` when occupied. Until armies exist (F6), only Node tests set these.
Check (pass/fail): route finds the one road; with that road blocked, route returns null; with two
roads, blocking one reroutes in-flight and new shipments over the other; state
changes push one `state.news` entry `{ kind: 'roadBlocked', road, at, affects: [...] }` per change,
not one per tick.
Done note: "F3.1 roads and connection state in."

### F3.2. Shipments  [SMALL]
Needs: F3.1
Files: `game/src/sim/frontier/logistics.js`, `game/tools/test_frontier_logistics.mjs`.
Do:
  1. `send(owner, from, to, cargo)`: take the cargo from the source stock at departure (ledger
     reason `'ship out'`), create a shipment record.
  2. Each sim tick, `progress += speed × DT` while the road is not blocked; while blocked,
     `state = 'waiting'` and no progress.
  3. On arrival, credit the destination (reason `'ship in'`), mark delivered, keep the record for
     one economy tick, then remove it.
Check (pass/fail): conservation including in-flight cargo at every tick; a shipment on a blocked
road never delivers until cleared; save mid-route and load, then it arrives on the same tick as a
straight run.
Done note: "F3.2 shipments in."

### F3.3. Governor trade  [SMALL]
Needs: F3.2
Files: `game/src/sim/frontier/governor.js`, `game/tools/test_frontier_governor.mjs`.
Do: in `review`, if priority is `trade` or a stock is above 3× its need, send the surplus of goods,
timber or stone to the capital; when it arrives the capital sells it for ryo at the F0.2 prices
(ledger reason `'sold'`, treasury credited). If the town is short of a resource the capital has,
send it out. Never more than 2 shipments in flight per settlement.
Check (pass/fail): surplus goods become treasury ryo only after delivery; no more than 2 shipments
in flight; nothing is sent while the road is blocked.
Done note: "F3.3 governor trade in."

### F3.4. Isolation rules  [SMALL]
Needs: F3.3
Files: `game/src/sim/frontier/economy.js`, `game/tools/test_frontier_economy.mjs`.
Do: while a settlement has no working road to the capital, imports stop, and projects whose cost
needs an import wait with `'blocked road'` in `waiting`. Local food, jobs and buildings keep working.
No pop loss, no ownership change.
Check (pass/fail): block the road for 300 economy ticks: pop never drops, owner unchanged, local
farm output continues, an import-dependent project waits and resumes after clearing.
Done note: "F3.4 isolation rules in."

### F3.5. Carts on the road  [SMALL]
Needs: F3.2, W3.4
Files: `game/src/render/world_ground.js` (or a new `game/src/render/carts.js`), `game/data/art.json`.
Do: a shipment within view of the camera is drawn as an ox cart with two escorts moving along the
road at its `progress`; out of view it stays a record only. Placeholder art (a box cart) until the
A1 ox-and-cart art exists. Render only: reads the snapshot, never writes.
Check (pass/fail): `.mjs` syntax copy passes; the draw code only reads snapshot data.
In game (Tim): a cart rolls along the road from the town to the city gate.
Done note: "F3.5 carts drawn on roads."

### F3.6. Escorts and road raids  [SMALL]
Needs: F3.2, W4.2
Files: `game/src/sim/frontier/logistics.js`, `game/data/frontier.json` (`roadRaids` block),
`game/tools/test_frontier_logistics.mjs`.
Do: every shipment has an escort (cost built into the shipment, no unit to manage). When it passes
within 100 units of a bandit camp, the escort wins automatically except with a small chance
(placeholder 3%, lower on roads you've cleared). On a loss, part of the cargo (placeholder up to
25%) is lost and the rest arrives late; never the whole shipment. Enemy clan raids (F6) use the
same caps. Anti-chore caps, all in data: at most one raid per road per 2 days, at most one loss
per shipment, and an alert ("Bandits took 12 timber on the Kiso road") instead of anything to
manage. The governor keeps sending; you never have to reroute by hand.
Check (pass/fail): with the seeded chance forced to 0, nothing is ever lost; with a loss forced, the
cargo lost is at most the cap, the rest is conserved and delivered; a second raid on the same road
within the cooldown never happens; Classic mode is unaffected.
Done note: "F3.6 escorts and road raids in."

### F3.7. Plan a road on the World map  [SMALL]
Needs: F3.1, W2.4
Files: `game/src/world_map.js`, `game/src/sim/frontier/logistics.js` (dry-run `planRoad { from, to,
via }` returning path, length and cost, changing nothing), the Controls panel rows in `game/src/main.js`.
Do: in the World tab, pick a town, choose "Plan road", click a destination (town, capital or a point on
an existing road); the suggested cheapest route shows with its cost; drag to add a via point; confirm
queues the road project.
Check (pass/fail): the dry run changes no state; the same from/to/via always gives the same path; a
route through mountains away from a pass is refused with a reason.
Done note: "F3.7 road planning on the World map (controls.md line needed)."

**Phase end:** frontier tests and regression set pass; Docs keeper commits "Frontier roads and
shipments"; Tim playtest: watch a cart reach the city and the ryo arrive.

---

## Phase F5: Build your town

Goal: the player zones land (housing, farm, work), places buildings, roads, walls and gates, and the
governor fills what the player leaves. Design: [Loop 3 design](#loop-3-design-tim-2026-11-04) (Tim, 2026-11-04);
Loop 3 builds the first slice: cards L3.1–L3.8 replace the F5.1–F5.4 detail for that loop (Tim, 2026-11-04); F5.1–F5.4 below stay as the outline for the later deepen pass. Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `game/src/input.js` (pointer handlers only).

### F5.1. Town grid and clearing  [SMALL]
Needs: E done
Files: `game/src/sim/frontier/construction.js`, `game/src/sim/frontier/town_layout.js`,
`game/tools/test_frontier_grid.mjs`.
Do (updated Tim, 2026-11-04): the grid comes from the settlement record, centred on the town hall
(players found anywhere, so not from `world.json` sites). 1 cell = 1 small building; big buildings
take 2 × 2. The grid covers the 600-unit work range, with a pretty big core for housing and work
zones that grows with the town hall tier. It replaces the spiral slots. Each cell has `stage`
overgrown → cleared → built (decided, Tim 2026-11-02: no chore). Workers clear any zoned or placed
cell by themselves; a `clear { cells }` command also lets the player clear ahead (cost: workers and
time only, from data), ledgered as work, not resources. Store the grid as plain data in
`settlement.grid`.
Check (pass/fail): a cell goes through the three stages in order and never skips; a zoned overgrown
cell gets cleared without a `clear` command; the grid survives save/load; clearing uses only
assigned workers.
Done note: "F5.1 town grid and clearing in."

### F5.2. Roads, walls, gates and the trap check  [SMALL]
Needs: F5.1
Files: `game/src/sim/frontier/construction.js`, `game/tools/test_frontier_grid.mjs`.
Do: `place { kind: 'road' | 'wall' | 'gate', cells }` on cleared cells. A town can have several
gates (decided, Tim 2026-11-02): each world road (F3) enters at a gate on the site edge, and many
roads can join the town. Before accepting, flood-fill from the gates over road and open cells:
reject with reason `'would trap'` if any zoned or built cell would lose a path to every gate. Gates
count as passable. A market or storehouse only ships goods (F3.3) if it has a road path to a gate
whose world road reaches the buyer.
Check (pass/fail): a wall ring with no gate is rejected; the same ring with a gate is accepted; a
storehouse cut off from the gates stops shipping and resumes when reconnected; a road
cut that strands a house is rejected; rejections change nothing.
Done note: "F5.2 placement rules in."

### F5.3. Zones, health and growth  [STRONG]
Needs: F5.2
Files: `game/src/sim/frontier/construction.js`, `game/src/sim/frontier/economy.js`,
`game/src/sim/frontier/governor.js`, `game/data/frontier.json`, `game/tools/test_frontier_grid.mjs`.
Do (updated Tim, 2026-11-04): `zone { cells, kind: 'housing' | 'farm' | 'work' }` (more kinds
later). Zone output = painted cells × zone level × zone health; buildings inside a zone are its look,
not separate rules. Health = needs met (food, workers, road access). Healthy zones grow; housing grows
in stages (hut → house → bigger house). A zone short of needs for N economy ticks is abandoned (empty,
no output) and recovers when needs return; nothing is destroyed. Zone cells grow only within a few
cells of a town road (`waiting` "needs road"). Farm cells become crop fields with a farmhouse every
few cells. Commercial and military buildings are placed, not zoned (F5.4, F6.1). The governor zones
and places only what the player hasn't, and never repaints the player's cells. Rules in the sim,
numbers in `frontier.json`, same commands for players, bots and governors.
Check (pass/fail): zoned cells next to a road grow; cells away from roads stay empty with "needs road";
a starved zone abandons and recovers; the governor never overwrites a player cell; economy invariants
hold; no number is hard-coded outside `frontier.json`.
Done note: "F5.3 zones and growth in."

~~F5.3b Planning matters (desirability)~~ Removed (Tim, 2026-11-04): folded into zone health (F5.3).

### F5.4. Build bar and placement  [STRONG]
Needs: F5.3
Files: new `game/src/frontier_build_ui.js`, `game/src/input.js`, `game/src/render/view.js`, the
Controls panel source.
Do (updated Tim, 2026-11-04): a build bar in the town panel with roads, walls, gates, zone brushes
(housing, farm, work), an eraser, and the placed buildings (town hall upgrades, storehouse, node
camps, stockade, and buildings with menus). Click-drag rectangles with a ghost coloured green
(allowed) or red (with the reject reason, asked of the sim through a dry-run action that returns a
receipt and changes nothing). Buildable ground only, not road or water. Right click or Escape
cancels. The zone tint shows only while the bar is open, plus a zone health overlay. Clicking a
building shows a tooltip (what it is, its zone, its state, the zone's state); placed buildings open
their own menu. Player RTS control of workers (select, right-click a spot) comes with this step.
Mock first; Tim approves before building. All new keys and clicks go in the Controls panel.
Check (pass/fail): the dry-run action is covered in `test_frontier_grid.mjs` (no state change);
syntax copies pass.
Done note: "F5.4 build bar in (controls.md lines needed)."

### F5.5. Building art list  [TIM]
A SMALL thread lists which existing building cutouts can stand in for each building type (every
zone look per stage in F5.3, each placed building, plus gates, walls and the stockade) and which have none. Tim decides whether to make new art
(image prompts follow the project rules). New art never blocks the rules; placeholders are fine.

### F5.7. Work camps and farmsteads  [SMALL]
Needs: F5.3, F3.1
Files: `game/src/sim/frontier/construction.js`, `game/src/sim/frontier/economy.js`,
`game/data/frontier.json`, `game/tools/test_frontier_economy.mjs`.
Do (updated Tim, 2026-11-04): `place { kind: 'workcamp', node }` puts a drop-off by a deposit or
spot outside every town's 600-unit range, linked to a town by a road; workers shuttle to it and its
stock ships to that town like a shipment (F3.2). A **farmstead camp** does the same for farms beyond
600 units. The governor staffs both from the town's workers. Pieces slow to a trickle but never hit
zero, and grow back (rates in data).
Check (pass/fail): a work camp without a road link is refused; its output arrives at the linked town;
a deposit's yield never reaches zero; an unlinked camp stops shipping and resumes when relinked.
Done note: "F5.7 work camps in."

### F5.6. Playtest  [TIM]
Clear a patch, lay a road from the gate, zone houses and a workshop, wall it with a gate, try to wall
yourself in (should refuse), watch it fill and grow.

**Phase end:** tests pass; Docs keeper commits "Frontier town building"; Tim playtest F5.6.

---

## Phase F6: First frontier armies and battles

Goal: recruit troops at a barracks, march them on the road, and fight a real battle that runs the
same whether or not anyone watches. This phase is the hardest and needs Tim's choices first.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: `docs/combat_spec.md` (section list only),
`game/src/sim/combat.js` (function list only).

### F6.1. Troop roster and rival town  [TIM]
Proposed (Tim to confirm numbers): troops reuse existing models (swordsmen, Kuroda riflemen, brutes,
each clan's special unit; any new character uses the per-model sprite flow), 40 to 80 ryo of town
stock each plus food upkeep. **RTS production (decided, Tim 2026-11-02):** each troop type comes
from its own building, all one data list in `frontier.json` so more can be added later.
- **Town hall** (the command centre): every town gets one when founded. It upgrades to a **keep**
  (fortified, strongest defence) and its tier unlocks buildings, like an RTS age. Tier 1: barracks,
  rifle range, clan hall, farms, clinic, watchtower. Tier 2 (keep): stables, foundry, armory.
- **Barracks:** infantry (swordsmen, spearmen, brutes). **Rifle range:** riflemen. **Clan hall:** the
  clan's special unit. **Stables:** cavalry (sword riders, mounted rifles; waits on the A1 horse
  art). **Foundry:** field cannons, strong against walls and packed troops.
- **Support:** farms (supply cap: how many troops a town can feed), clinic (heals troops; hero
  recovers here), armory (blade and rifle upgrades), watchtower (sight, defence), supply depot
  (armies near it refill).
- **Outpost:** a small field camp built outside a town near the front, on your road network. It
  can recruit infantry and riflemen, heal, and refill like a depot; it can be attacked and burned.
  **Battles are RTS matches (Tim, 2026-11-02):** attacking and defending both use this build
  process. When the fight is at an enemy town, the attacking army pitches a **siege camp** near it,
  off your road network (a set distance outside its walls), and builds a base there during the
  fight: barracks, rifle range, clan hall, farms (supply), clinic, then upgrades and tier 2
  buildings, paid from the stock the army brought plus shipments. Defenders do the same inside
  their own town: they keep building, upgrading and recruiting during the siege and can add quick
  defences (barricades, a watchtower). The camp packs up or burns when the siege ends.
  **Fights play like an RTS (Tim, 2026-11-02):** in a battle you command troops directly with the
  existing crew controls (box select, right-click move and attack, groups), build and upgrade
  your base, and keep supply up. Workers brought with the army (or the town's own, when defending)
  gather from nodes near the camp, so the battle has its own small economy on top of shipments.
  When you aren't there, a **general** runs your side: the same bot brain as rival armies, using
  your army's stance and the aggressiveness setting, so unwatched battles still play out as RTS
  fights.
  **Attacker production (Tim, 2026-11-02):** the army sets out with **supply wagons** loaded from
  the home town's stock (the player picks how much) plus a few workers; the wagons are the camp's
  storehouse and starting bank. During the siege the camp earns from workers gathering nearby nodes
  (slower than a town) and from shipments along the road from your nearest town. Camp recruits cost
  stock and draw people from your towns, who walk in as reinforcements, so a big siege drains them.
  The defender has a full town economy; the attacker needs a strong start or must cut the
  defender's roads first.
  **Cutting roads is hard (Tim, 2026-11-02):** there are many roads (W1.1), shipments reroute by
  themselves around a block (F3.1 `route` skips blocked links), and a road is only blocked while an
  enemy army stands on it, never destroyed. A camp is cut off only when every route to it is held.
- **Every side gets all of it (Tim, 2026-11-02):** in every battle, attacker (siege camp) and
  defender (town) build and upgrade the same way. The player and every bot clan have the same
  building list, the town hall to keep tiers and the armory upgrades, attacking or defending, with
  the same costs and rules. Only the clan hall's special unit differs per clan.
First slice (F6.2 to F6.4): town hall tier 1, barracks, rifle range, clan hall, farms, clinic.
Second slice (F6.8): keep tier, stables, foundry, armory, depot, watchtower, outposts. **Stances
(decided):** the player picks per army how it fights: hold, fight to the last man, retreat at a set
loss, or pursue and finish off a fleeing enemy. Bot armies use the same stances, chosen by their
aggressiveness and retreat settings in `bots.json` (per difficulty). Rival towns come from E6 bot
founding (the fixture towns are for tests only). Each town keeps a garrison that defends itself; the
player only orders attacks. Hero recovery: the town clinic after 1 day (placeholder), or the city if
the town has none.

### F6.2. Army records and recruiting  [SMALL]
Needs: F6.1, F5 done
Files: new `game/src/sim/frontier/armies.js`, `game/data/frontier.json` (troops),
`game/tools/test_frontier_armies.mjs`.
Do: `recruit { settlement, troop, count }` at the troop's own built building (F6.1 list) while
the town is under its farm supply cap: pays from that town's stock, spawns
real entities in the town area with `e.army = <army id>` and `e.origin = <settlement id>`; army
record `{ id, owner, origin, units: [ids], order: null, stance: 'hold' }` (stances from F6.1;
command `stance { army, kind, retreatAt }`). Armies can't attack the capital city (Tim, 2026-11-02): an `attack` order
on the capital is rejected; armies only fight on the frontier. City fights stay the existing raids. `order { army, kind: 'move' | 'hold' |
'attack', to }`.
Check (pass/fail): a unit is in exactly one army; recruiting with too little stock, without the
right building, or over the supply cap is rejected and changes nothing; army origin never changes when units move.
Done note: "F6.2 army records in."

### F6.3a. Armies travel the road  [SMALL]
Needs: F6.2
Files: `game/src/sim/frontier/armies.js`, `game/src/sim/frontier/logistics.js`,
`game/tools/test_frontier_armies.mjs`.
Do: an army ordered to another settlement leaves through the gate as a road traveller (same rules as
shipments, F3.2) with `army.travel = { road, progress, dir }`. It sets the road `threatened` for
the other side while on it and `blocked` while stopped on it. `meetings()` returns pairs of hostile
travellers on the same road whose progress is within 20 units, or a traveller reaching a hostile
shipment. Attacks on shipments obey the F3.6 caps (cooldown per road, never the whole cargo unless
the escort is beaten in a real battle).
Check (pass/fail): a lone army arrives at length ÷ speed; the road state changes while it passes;
two hostile armies heading at each other are reported by `meetings()` exactly once; friendly armies
never are.
Done note: "F6.3a army road travel and meeting check in."

### F6.3b. Road battle areas  [STRONG]
Needs: F6.3a, W3.2
Files: `game/src/sim/frontier/armies.js`, `game/src/sim/areas.js`, `game/tools/test_frontier_battle.mjs`.
Do: on a meeting, create a small temporary area at that road point (own bounds, blockers, nav,
vision), place both armies' entities into it as real units, and let the existing combat and crew AI
fight. The player can enter the area and command their side with the crew controls; otherwise
the general (F6.1) commands it. A meeting with a shipment pulls the shipment's cargo into the battle as a record (no body loot).
The battle runs every tick whether viewed or not, and never calls render code.
Check (pass/fail): Node test: two armies meet, a battle area exists, units fight with normal combat;
the same seed and orders give the same result in Node; saving mid-battle and loading gives the same result as
an unbroken run; a second battle on another road can run at the
same time without cross-talk.
Done note: "F6.3b road battle areas in."

### F6.3c. Battle end and return  [STRONG]
Needs: F6.3b
Files: `game/src/sim/frontier/armies.js`, `game/tools/test_frontier_battle.mjs`.
Do: a battle ends when one side has no fighters left in the area or retreats by its stance
(retreat at its set loss; 'last man' never retreats; a 'pursue' winner chases fleeing units until
they leave the area or fall).
Survivors return to the road as their army and continue or go home; downed units follow the F6.4
recovery rules; captured cargo goes to the winner's nearest own settlement by shipment; the area is
removed and its grids freed.
Check (pass/fail): after a battle, every unit id is in exactly one army or downed list; cargo is
conserved (totals); the area count returns to its starting value; a battle with one hidden straggler
still ends within a set time.
Done note: "F6.3c battle end and return in."

### F6.4. Hero knocked out on the frontier  [SMALL]
Needs: F6.2
Files: `game/src/sim/frontier/armies.js`, `game/tools/test_frontier_armies.mjs`.
Do: if the hero goes down in a frontier area, frontier commands still work, the battle continues,
and the hero recovers at the owning town's clinic after the F6.1 delay. No raid-loss rules apply.
Gear stays equipped.
Check (pass/fail): with the hero down, `recruit` and `order` still succeed; the hero returns after
the delay with the same equipment.
Done note: "F6.4 frontier KO rules in."

### F6.5. Rival bot armies  [STRONG]
Needs: F6.3
Files: `game/src/sim/frontier/governor.js`, `game/src/sim/bot.js` (one new rule group),
`game/data/bots.json`.
Do: bot towns (E6, and the F2.9 fixture in tests) already run the same governor. Add bot army
rules: build troop buildings and farms like the player, keep a garrison, send an army at a weak
enemy town or road when its strength beats the target by its aggressiveness setting, and pick
stances from its retreat settings (`bots.json`, per difficulty).
Check (pass/fail): an all-bot Node run of 30 game minutes: both towns grow, no command is rejected
for bad input, no stock goes negative, the run finishes under the time limit.
Done note: "F6.5 rival town bot in."

### F6.6. Battle benchmark  [SMALL]
Needs: F6.3
Files: new `game/tools/profile_frontier_battle.mjs`.
Do: a Node script that spawns 100, then 200 combatants plus 30 workers in a battle area and reports
average and worst ms per tick over 600 ticks. No browser.
Check (pass/fail): the script runs and prints both results; the numbers go into the done note.
Done note: "F6.6 benchmark: 100 units X ms/tick, 200 units Y ms/tick."

### F6.7. Playtest  [TIM]
Recruit a squad, march it at the rival town, meet their army on the road, watch the fight, then try
it again without looking (stay in the city) and compare results. Get knocked out on purpose and keep
commanding. Capture a Firefox profile if it lags.

**Phase end:** tests pass; Docs keeper commits "First frontier armies"; Tim playtest F6.7.
Then F6.8 runs as its own checkpoint: Docs keeper commits "Second military slice" after Tim's g2g.

### F6.8. Second military slice  [STRONG]
Needs: F6.7 playtest feels right, A1 (horse art) for stables
Files: `game/src/sim/frontier/armies.js`, `game/src/sim/frontier/construction.js`,
`game/data/frontier.json`, `game/data/units.json`, `game/tools/test_frontier_armies.mjs`.
Do: add the F6.1 second slice: iron (6th resource, from ore nodes, used only for rifles, cannons and
armory upgrades; the governor fetches it), town hall to keep upgrade (tier gate), stables and cavalry, foundry
and field cannons (bonus against walls), armory upgrades, supply depot and watchtower, outposts
(field camps on your road network that recruit, heal and refill, and can be burned), and siege
camps pitched by an army near an enemy town. Defence while under attack: the town's own area loads (E5), the F5.4
build bar stays live and adds quick builds from data (barricade, watchtower, spike wall; seconds to
build, by workers or troops); recruiting keeps going; if the player is away, the governor barricades
the gates and the garrison defends. Bot towns use the same commands. All from data.
Check (pass/fail): tier 2 buildings are refused before the keep; an outpost off your road network is
refused unless it is a siege camp within range of an enemy town; a quick build is accepted only
while the town is under attack; cannons deal the wall bonus; a burned outpost leaves no units or stock behind.
Done note: "F6.8 second military slice in."

---

## Phase F7: Sieges and conquest

Goal (Tim, 2026-11-02): attacking a frontier town is a real RTS siege. The attacker camps outside,
breaks the walls and takes the town hall; defenders fortify buildings and shoot from them. Frontier
towns only: the capital can't be attacked (F6.1).

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: the War Lantern raid code (back-room hold only) and the city's building
interior setup (how a business's rooms are a separate place).

### F7.1. Siege rules  [TIM]
**Decided (Tim, 2026-11-02),** placeholders in data: the siege camp sits at least 150 units outside
the walls, out of watchtower range. Walls and gates have HP; infantry batter gates slowly, foundry
cannons break walls fast; a broken section becomes an opening in the F5 grid. The fight is outdoor RTS
style everywhere except the **town hall, which is a real interior fight** (Tim, 2026-11-02): it has
rooms like the city's businesses; attackers go in through the door, fight the defenders room by
room, then hold the council room for a set time with no defenders inside (same pattern as the War
Lantern back-room hold). Defenders can sally out, bring armies from other towns, rebuild walls and add quick
defences; towns feed themselves, so no starving out. The winner picks **capture** (town changes
owner, keeps people and buildings, mood drops for a while) or **plunder** (take its stock, burn some
buildings, owner unchanged). Surviving defenders retreat to their nearest town. Workers repair damage
afterwards. A captured town can't be retaken for 3 days, and a clan's **last town can be plundered but not
captured**, like the HQ rule (both decided, Tim 2026-11-02).

### F7.2. Walls, gates and building damage  [SMALL]
Needs: F7.1, F6 done
Files: `game/src/sim/frontier/construction.js`, `game/src/sim/frontier/armies.js`,
`game/data/frontier.json` (HP per building and wall, cannon bonus), new `game/tools/test_frontier_siege.mjs`.
Do: walls, gates and buildings get HP in the town area; attacks on them use the normal combat
damage with per-type multipliers (cannons high against structures). At 0 HP a wall cell becomes
`breach` (passable, nav rebuilt for that chunk only), a building becomes `ruin`. Repair is a
construction project.
Check (pass/fail): a breach makes the inside reachable and only that chunk's nav changes; a ruined
building stops producing; repair restores it; rejected attacks on own structures change nothing.
Done note: "F7.2 structure damage in."

### F7.3. Garrison buildings  [STRONG]
Needs: F7.2
Files: `game/src/sim/frontier/garrison.js` (new), `game/src/sim/combat.js` (one hook),
`game/data/frontier.json` (capacity per building), the Controls panel rows in `game/src/main.js`,
`game/tools/test_frontier_siege.mjs`.
Do (Tim, 2026-11-02, like RA2): troops enter buildings (not the town hall, which is an interior,
F7.4). Order troops into a building to **fortify** it (command `garrison
{ building, units }` / `ungarrison`). Units inside can't be hit directly. Riflemen and other ranged
units shoot out with a range bonus; melee units just hide. Each building has a capacity. Attackers
must destroy the building to get at them: at 0 HP everyone inside is **ejected** (knocked down
briefly, some damage) and the building becomes a ruin. Watchtowers and the keep are the best
garrison spots. Attackers can garrison captured buildings too. Same rules for every clan and the
bot general.
Check (pass/fail): garrisoned units take no direct damage; a garrisoned rifleman out-ranges the same
unit outside; destroying the building ejects every unit inside exactly once; capacity is never
exceeded; a unit is never both inside and outside.
Done note: "F7.3 garrisons in (controls.md line needed)."

### F7.4. Taking the town  [STRONG]
Needs: F7.2
Files: `game/src/sim/frontier/armies.js`, `game/src/sim/frontier/world.js`, `game/tools/test_frontier_siege.mjs`.
Do: the town hall interior (an area with rooms built from data, using the same place and room
system as the city's businesses; units enter by its door and fight inside with normal combat and
indoor rules), the council-room hold, then the capture or plunder choice (command `conquest { settlement, kind }`),
the last-town and retake-cooldown rules from F7.1, retreat of survivors, and alerts for both sides.
Check (pass/fail): units enter and leave the town hall only by its door; the hold timer pauses
while a defender is in the council room; capture moves owner, people and buildings exactly once; plunder moves only stock
(conserved) and leaves owner unchanged; a last town can't be captured; a retake inside the cooldown
is refused; Classic mode is unaffected.
Done note: "F7.4 conquest in."

### F7.5. Bot sieges  [STRONG]
Needs: F7.3, F7.4, F6.5
Files: `game/src/sim/bot.js` (siege rule group), `game/data/bots.json`.
Do: bot generals pitch camps, build cannons when walls are up, garrison when defending, and choose
capture or plunder by their aggressiveness setting.
Check (pass/fail): an all-bot Node run ends with at least one siege resolved; no command rejected for
bad input; no stock negative.
Done note: "F7.5 bot sieges in."

### F7.6. Playtest  [TIM]
Besiege the rival town: camp, build a foundry, breach a wall, clear a garrisoned watchtower, fight
through the town hall's rooms, hold the council room and capture it. Then defend one with riflemen in buildings.

**Phase end:** tests pass; Docs keeper commits "Sieges and conquest"; Tim playtest F7.6.

---

## Phase W5: Exploration and natives

Goal (Tim, 2026-11-02): the wilds are worth exploring: native villages with their own relations,
one-time set-piece areas, and unique items you can only find out there. Builds on W4 (basic camps,
nodes, the relation record) and runs after F7.

Reads: the WHOLE plan (`docs/frontier_build_steps.md`) and `docs/step_runner_guide.md` (Tim's rule, 2026-11-02). Extra: the existing loot and item-slot code (function list
only).

### W5.1. Natives, areas and items list  [TIM]
**Decided (Tim, 2026-11-02):**
- **Natives:** 2 to 4 villages in the wilder regions. They buy food and goods and sell herbs, furs and
  a few unique items. Favours (drive off a nearby bandit camp, escort their hunters) raise relation.
  High relation unlocks native guides (reveal part of the map) and native warriors as mercenaries.
  Hostile natives raid carts and nearby work camps under the same caps as bandits (F3.6).
- **Exploration areas:** about one set piece per region (ideas: abandoned mountain shrine, shipwreck
  cove, old flooded mine, bandit fortress, hermit's hut, old battlefield). Some are interior fights
  like the town hall (rooms, a guardian or boss), some outdoor. First visit gives lore and reveals the
  map around it; clearing gives the loot, once, with a claim record.
- **Unique items:** named items found only in the wild (for example a cursed blade, a fast-reload
  rifle, a hermit's smoke lantern, a sea captain's spyglass for longer sight). They are the top
  tier of the existing loot rarity; usable ones go in the B item slot. Some are **town relics**
  (for example a shrine bell that lifts mood when placed in a shrine).
A SMALL thread drafts the list (names follow the W1.1 names rule; image prompts follow project
rules) for Tim's OK.

### W5.2. Native villages  [SMALL]
Needs: W5.1, W4.2, F3
Files: `game/src/sim/camps.js` (natives part) or new `game/src/sim/natives.js`, `game/data/natives.json`,
new `game/tools/test_natives.mjs`.
Do: trade (command `trade { village, give, take }` at the village, prices from data), favours as
simple tasks with a reward to relation, guides and mercenaries unlocked by relation thresholds,
hostile raids through the F3.6 caps.
Check (pass/fail): trades conserve stock; a favour raises relation once; unlocks fire once per
threshold; a hostile village never raids past the caps; bots use the same commands.
Done note: "W5.2 native villages in."

### W5.3. Exploration areas  [STRONG]
Needs: W5.1, W3 done, F7.4 (interior pattern)
Files: `game/data/world.json` (`areas` list), new `game/src/sim/exploration.js`, interior data per
area, new `game/tools/test_exploration.mjs`.
Do: set pieces placed by the W1 generator (one per region) or by hand in `world_overrides.json`.
Outdoor ones are a chunk with fixed props and guards; interior ones use the town-hall room system.
First visit: lore popup plus map reveal; clearing: a one-time reward with a claim record.
Check (pass/fail): a cleared area never gives its reward twice (also after save/load); first visit
reveals the set radius; an interior area is entered only by its door.
Done note: "W5.3 exploration areas in."

### W5.4. Unique items and relics  [SMALL]
Needs: W5.1, W5.3
Files: the existing item data and loot code, `game/src/sim/frontier/economy.js` (relic effects),
`game/tools/test_items_unique.mjs`.
Do: add the W5.1 items as the top loot tier; each exists at most once per campaign; relics placed
in a town building apply their effect from data.
Check (pass/fail): a unique item can't be duplicated by reload or trade; a relic's effect applies
only while placed; usable ones go in the B slot only.
Done note: "W5.4 unique items in."

### W5.5. Playtest  [TIM]
Trade with a village and do a favour, clear one set-piece area (one interior), find a unique item,
and place a relic in a town.

**Phase end:** tests pass; Docs keeper commits "Exploration and natives"; Tim playtest W5.5.

---

## Phase S: Seafaring (outline; expand into full cards before building)

Goal (Tim, 2026-11-02): the sea is part of the campaign: trade by ship, sail the coast yourself,
fight pirates and rival navies. One phase for now; Tim will expand it later. W1 already stores harbor
spots and sea lanes, F3.1 links carry a `mode`, and W3.1 plans a `water` movement layer, so this adds
links, ships and a building, not a rewrite. Needs: W5 done (and F7 for naval sieges).

Agreed outline (Tim, 2026-11-02), each line becomes one or more cards when the phase is expanded:
1. **Harbors:** coastal towns build a harbor on their W1 harbor spot; the capital already has one.
2. **Cargo ships:** the same shipment records with `mode: 'sea'`, more cargo and faster along the
   coast, so coastal towns are valuable; the governor uses them by himself.
3. **Piloting:** the hero and crew board a boat at a harbor or landing spot and steer it freely on
   the `water` layer, landing at any landing spot. Small offshore islets with their own set pieces
   and loot (W5 pattern).
4. **Pirates:** capped like bandits (F3.6), rare, never a chore; a pirate cove can be a set piece.
5. **Navy, RTS style:** a **shipyard** (new military building) builds junks, then **steam gunboats**
   at keep tier. Ships are army units on the `water` layer, ordered like F6 armies: move, attack,
   escort, blockade a harbor, ferry troops for landings, shell coastal towns in F7 sieges. Sea
   battles use the F6.3b battle-area approach on water, so they run whether watched or not.
Checklist line is added when the cards are written.


---

## Art backlog for the frontier (Tim, 2026-11-01)

Gathered here so art can be made ahead of the code that needs it. Characters and animals use the
per-model sprite flow; static things use image prompts and the cutout tool.

| Art | Needed by | Kind |
|---|---|---|
| Mountains, rock outcrops, pass gateway, ford, lake edges (per biome) | W3.4b | static cutouts |
| Settler | E2 (reuse a civilian sheet first) | animated character |
| Ox and cart, hand cart, pack horse | F3 (shipments drawn near the camera) | animated animal + vehicle |
| Farm animals: oxen, chickens, pigs, goats, rice-paddy water buffalo | F5 (town life, cosmetic) | animated animals |
| Frontier buildings: stockade, barracks, farm plots, lumber camp, quarry, workshop, storehouse | F5.5 | static cutouts |
| Horses to ride, horse-drawn carriage | Later: mounts (faster travel) | animated animal + rider |
| Boats: fishing boat, cargo junk, a boat the hero pilots, warships | Later: sea travel and warfare | static or lightly animated |
| Native village buildings and people | W4 | cutouts + characters |

Note on animals: the sprite exporter renders rigged 3D models with animations. Mixamo only rigs
humans, so each animated animal needs a model that already comes with walk, idle and run clips, with
a licence that allows selling on Steam. Finding those (or a rigging route) is a STRONG research step
before the first animal, and image generation alone isn't enough for moving animals. Static cutouts
(carts parked, boats moored, penned animals with a simple bob) are a cheap fallback. Routes to weigh in that step: buying rigged, animated animal
packs with a commercial licence (fastest); or modelling and rigging in Blender (free; Rigify has
quadruped rigs; Blender can run scripted and headless, so threads can write the export scripts, but
walk cycles still need hand animation or a bought clip library). Hunyuan3D models are not
commercial-OK, so they can't be the source for the Steam build.

### A1. Animal and vehicle pipeline test  [STRONG + TIM]
Needs: Blender installed on Tim's laptop. Do before F3's first cart (Tim, 2026-11-01: make sure this
works; crude models are the fallback).
Do: make one ox and cart two ways. (a) A Blender Python script builds the cart from shapes, with
turning wheels. (b) A commercial-OK rigged, animated ox base model (CC0 such as Quaternius, or CC-BY
with credit) is cleaned up, given the painted-look material and exported by script. Both go through
`tools/export_sprites.mjs` into 8-direction sheets with the per-model `--pack` flow.
Check (pass/fail): both produce sheets that load in game (Node `test_packed_catalog.mjs` passes);
licences are noted.
In game (Tim): compare them beside the city characters and pick the route for the rest of the
backlog. If neither looks right, crude static cutouts ship first and get replaced later.

## Later: needs design before steps

These parts of the campaign plan are not stepped yet because their open choices decide the code.
Each becomes its own phase after a short design session with Tim:

- **Classic / Campaign select in the main menu** (Tim, 2026-11-04): a proper mode select button on the start screen. Not part of Loop 3.
- **Forts and conquest** (plan step 6; core now in F6 and F7): further center tiers, siege stages, garrison buildings, damage and
  repair. Needs: stage gates, control duration, garrison capacity.
- **Exploration rewards** (plan step 5a, frontier part; now Phase W5): ruins and caches with first-clear claim
  records so reloads cannot reroll. The capital gear, shop and item slot are already built.
- **Campaign rules** (plan step 7): expulsion, return, victory, season conversion, multiplayer
  authority.
- **Armies at the capital city** (Tim, 2026-11-02: not possible at first; maybe much later): attackers pitch a siege camp outside the
  city edge (F6.1). The city map is hand-made, so defenders don't build freely: `port_town.json`
  gets a few marked empty lots where defenders can drop quick structures (barricade, rifle nest,
  field barracks tent), and the HQ and owned businesses act as recruit points. Same commands as
  frontier building, so it adds lots and structures, not a new system.
- **Railways** (Tim, 2026-11-02: yes, later): built only on W1 rail corridors, with a permit
  unlocked by Influence and a large stone, timber and ryo cost. A train carries several carts'
  worth about 4× as fast, so far towns pay like near ones. Runs station to station only; a cut
  track stops the whole line until repaired, and train robbery is its own raid. Same shipment
  records with `mode: 'rail'` (F3.1), so it adds links and a train, not a rewrite.
- **Sea travel** (Tim, 2026-11-01: planned now, built later; now outlined as Phase S, kept here as
  background): harbors as town buildings on the W1
  harbor spots, ships carrying shipments along sea lanes (same shipment records, `mode: 'sea'`), the
  hero and expeditions sailing between harbors, and pirates or naval interception. **Piloting:** the hero and his crew board a boat at a harbor or
landing spot and steer it freely around the island with the normal movement keys (a boat entity
using the `water` movement layer from W3.1, crew carried aboard), then land at any landing spot. **Sea warfare** (later, RTS style): ships are army units on the `water`
layer, selected and ordered like F6 armies (move, attack, escort, blockade a harbor), fighting with
the same combat rules (ranged broadsides as ranged attacks). Ship battles use the F6.3b battle-area
approach on water, so they also run when nobody is watching. Because the
  transport graph already has a `mode` per link (F3.1) and W1 stores harbors and lanes, this adds
  links and a ship unit, not a rewrite.
- **Unrest events** (later, optional): very unhappy towns could have trouble (a local gang skimming
  stock, a small riot damaging a building). Tim chose the quiet version for now (2026-11-02).
- **Life on the roads** (proposed): cosmetic travelers (peddlers, pilgrims, carts) drawn near the
  camera along corridors, so the world doesn't feel empty; no gameplay effect at first.
- **Clan specialties in towns** (Tim, 2026-11-02): basic shared version first; clan-flavoured
  buildings or income (gambling halls, drill yards, spy networks) come later.
- **Seasons and weather** (Tim, 2026-11-02): visual effects only for now (snow, rain, falling
  leaves), no gameplay effect.
- **Blood** (Tim, 2026-11-01, later): a basic blood system (hit spatter, pools under the downed,
  fading over time), drawn by the renderer from existing hit events, with a Settings toggle. Check
  how it affects Steam's mature-content questionnaire before release.
- **Scale** (plan step 8): more regions only after F6.6 and Firefox profiles show room.
- **Combat AI variety** (roadmap item 13): ranged units backing off, spreading out, flanking. This is
  judgement and feel work for the default model plus Tim's playtests, not small-model work.
