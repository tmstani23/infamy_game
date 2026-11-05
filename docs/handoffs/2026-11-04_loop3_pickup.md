# Loop 3 pickup (2026-11-04)

Handoff for picking up Loop 3 (gather and build) outside Claude, e.g. in ChatGPT. Tim OK'd this note 2026-11-04.

## Read first
1. `START_HERE.md`
2. `docs/usage.md`
3. `docs/frontier_build_steps.md`: the "Loop 3 design (Tim, 2026-11-04)" section and the Loop 3 build cards L3.0 to L3.9 right under it.

## Done and committed (local, not pushed)
- L3.0 build bar mock and numbers (Tim approved).
- L3.1 town grid: `e2f532c`.
- L3.2 placement and trap check + L3.3 zones, health and housing growth: `cc4948c`.
- L3.4 resource spots (tool, `world_spots.json`, lookups): `850eba2`.
- L3.5 worker records and trip math: `00bec11`. Training/assign commands, nearest drop-offs, deterministic cargo/ledger, governor assignment, timed clearing and forage shutdown are built. Frontier data version is 5; worker defaults migrate additively. The main/worker startup now supplies `resourceSpots` and `resourceSpotRules` to the frontier hub.
- L3.6 workers wake as non-fighting laborers near activity and suspend with saved trip/cargo/wounds; loaded casualties remove one record. Node checks pass; visual verification remains pending. The necessary `areas.js` seam adds worker residency exclusion and fine path planning. Commit recorded in Git history with this update.
- L3.7 town grid and resource spots drawn using existing art; minimap, atlas Spots layer, hover and snapshot integration added. Node checks pass; visual review pending. Commit recorded in Git history with this update.
- L3.8 build bar, inspectors, worker training and orders: Node checks pass; in-game visual/interaction playtest pending. The old crew-test arrival fixture was corrected without removing assertions; `test_crew.mjs` now passes.

## Next
1. **L3.9 remains open.** The fix phase has uncommitted, Node-tested implementation ready for Tim's manual playtest, including the founding ghost and building/unit safety. Do not claim safe founding or loop acceptance yet.
2. Follow the L3.9 manual checklist for founding/egress, worker routes/cargo/selection, usage and growth explanations, visual joins, save/load and capital/frontier FPS. Preserve saves; performance is not yet accepted. Do not commit the game changes until Tim's playtest/commit instruction.
3. After Tim accepts Loop 3, update only the phase boxes actually completed, then continue Loop 4.

Current playtest checkpoint: Tim accepted plot spacing, clearing appearance, inspector dismissal, build review/confirm and fence placement except corners; full loop acceptance is pending. Worker groups/move/hold, route recovery, full Eraser refunds, food-warning fixes, building collision and quantity-based training/hiring are in this checkpoint; latest interactions need focused and manual QA. See the L3.9 card for remaining checks and deferred road/fence/ford/bridge art. No save was reset or written during diagnostics.

Additional manual playtest (2026-11-04): rounded plots, worker training/progress/confirmation, clear worker spawns, nearby spot listing, selection and movement, harvesting/returning, all three zone types growing, Eraser confirmation/refunds and resource/cutdown effects worked. Workers still disappear beyond town/grid and get stuck on buildings, so travel/visibility/pathing are not accepted. Abandonment and low health appear but need clear explanations. Safe founding and Loop 3 remain open. No new Node tests were run in this playtest; see L3.9 for the full fix sequence and current dropoff/economy behavior.

Fix-phase implementation handoff (2026-11-04): the previously reported founding, worker travel, economy/UI, cargo and visual-join changes are implemented in the uncommitted working tree and passed targeted Node checks, with manual acceptance still pending. L3.9 contains the scope, reported test results, stale realtime-loop test, performance measurement and playtest checklist. The in-memory 22-worker sim measurement is not browser FPS or proof of a performance fix; no save was written. Data version 6 is additive. Preserve the unrelated modified inn screenshot.

Further playtest: Tim likes overhead collection/cargo icons and labels, confirms minimap fixes and says timber/stone balance well. Excess goods production is deferred to a later balance pass; do not change current rates for this follow-up. Delivery notification spam was replaced with a bounded, saved per-town Workers → Log history; worker, build UI, snapshot and panel Node tests passed. The changes remain uncommitted and full acceptance is pending; see L3.9 for details.

Tim also manually accepted the Stock → Usage pane and click-to-focus plot navigation. This does not accept goods balance, performance, the full fix phase or the remaining founding/worker/corner checks; no new tests accompanied that feedback.

Latest worker playtest: selection and movement work well, but lag near harvesting and traveling workers remains open for browser retest. An uncommitted draw-order bucket optimization passed draw-sort reference/operation-count tests and related checks; CPU diagnostics and their limits are recorded in L3.9. Mapped quarry/ore markers identify rich clusters rather than separate nodes; ore clusters currently yield placeholder stone.

Tim also confirms Drop/Return, harvest-duration bars and resource-node placement rejection work. Apparent cargo loss when moving a loaded returning worker remains open despite passing targeted return/interruption conservation regressions; check Workers → Log and retest. Heavy lag was reported before refresh, so save and reload the same save in a refreshed session before judging the draw-sort fix. The game changes remain uncommitted.

L3.5 validation: `node game/tools/test_frontier_workers.mjs` passes (distance, conservation, save timing, rejected orders, training, clearing, forage and real game/save integration). Also passed frontier guards/snapshot/commands/construction/economy/governor/place/zones/world/data, town grid and founding tests; main.js/game.js syntax checks pass. No browser automation or visual acceptance claimed.

L3.6 validation: the worker test passes near/away production parity, paths, wake/suspend, chunk residency, wounds, casualties, clearing, rerouting and actual combat/save-load. Related frontier, areas, camp, combat, inventory, business, bot, sim-worker and settings tests pass. Its old crew-test fixture failure was fixed during L3.8; syntax and diff checks pass.

L3.7 validation: `test_town_drawing.mjs` and relevant frontier, worker, resource, town, map and sim checks pass. `test_town_world.mjs:20` (`zone:h` art assertion) remains a pre-existing failure. Visual acceptance pending.

L3.8 validation: build UI, frontier placement/panel/guards/zones/workers, town hover/drawing, target controls, HUD drag, shared sim and crew tests pass. The crew fixture fix preserves the old assertions. `test_town_world.mjs:20` was not rerun in L3.8. No browser automation or visual acceptance claimed.

L3.9 checkpoint: followup, Eraser refund, build UI, worker, crew, founding and Shinobi HQ tests pass; some earlier related checks predate the latest collision/training edits. `test_dismissal.mjs:61` fails on an Instant Taunt text expectation; baseline not investigated. No full-suite claim.

## Rules
- All game rules live in `game/src/sim`; players and bots use the same commands.
- Run only the Node tests relevant to the card (the full suite times out in the cloud shell).
- New controls go in the Controls (?) panel.
- Nothing is pushed; Tim pushes himself.
- Tim authorized the L3.8 local commit and this doc update. Ask before future doc edits and commits; never push. New UI controls must be listed in the in-game Controls panel.
- The test starter frontier towns stay until card E6b.

**Lag bug FIXED (2026-11-05):** stuck-worker reroutes, patrol map builds and catch-up bursts were the causes; see "Performance: lag bug FIXED" in L3.9 of `docs/frontier_build_steps.md`. Parked: city decisions at 2 Hz while the hero is away, and a spatial grid for vision.
