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
1. **L3.9 remains open.** Founding can trap the hero inside the new hall because the hall is placed at the hero's coordinates and completed buildings now block movement. Tim requested a mouse-following hall-placement ghost with terrain/footprint/escape validation; not implemented. Fix that and prevent completed buildings from sealing units inside before claiming safe founding.
2. After Tim accepts Loop 3, update only the phase boxes actually completed, then continue Loop 4.

Current playtest checkpoint: Tim accepted plot spacing, clearing appearance, inspector dismissal, build review/confirm and fence placement except corners; full loop acceptance is pending. Worker groups/move/hold, route recovery, full Eraser refunds, food-warning fixes, building collision and quantity-based training/hiring are in this checkpoint; latest interactions need focused and manual QA. See the L3.9 card for remaining checks and deferred road/fence/ford/bridge art. No save was reset or written during diagnostics.

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
