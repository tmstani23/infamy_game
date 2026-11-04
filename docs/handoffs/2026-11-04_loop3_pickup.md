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

## Next
1. **L3.8** Build bar, tooltips and worker orders. Read its card and shared restrictions first.
2. **L3.9** Tim playtest, including L3.6 worker movement and L3.7 town/spot visuals.

L3.5 validation: `node game/tools/test_frontier_workers.mjs` passes (distance, conservation, save timing, rejected orders, training, clearing, forage and real game/save integration). Also passed frontier guards/snapshot/commands/construction/economy/governor/place/zones/world/data, town grid and founding tests; main.js/game.js syntax checks pass. No browser automation or visual acceptance claimed.

L3.6 validation: the worker test passes near/away production parity, paths, wake/suspend, chunk residency, wounds, casualties, clearing, rerouting and actual combat/save-load. Related frontier, areas, camp, combat, inventory, business, bot, sim-worker and settings tests pass. `test_crew.mjs:97` fails identically before and after (actual teahouse, expected street); pre-existing. Syntax and diff checks pass.

L3.7 validation: `test_town_drawing.mjs` and relevant frontier, worker, resource, town, map and sim checks pass. `test_town_world.mjs:20` (`zone:h` art assertion) and `test_crew.mjs:97` fail identically before and after; both pre-existing. Visual acceptance pending.

## Rules
- All game rules live in `game/src/sim`; players and bots use the same commands.
- Run only the Node tests relevant to the card (the full suite times out in the cloud shell).
- New controls go in the Controls (?) panel.
- Nothing is pushed; Tim pushes himself.
- Tim authorized the L3.6 local commit and this doc update. Ask before future doc edits and commits; never push. New UI controls must be listed in the in-game Controls panel.
- The test starter frontier towns stay until card E6b.
