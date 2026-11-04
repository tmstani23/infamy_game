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
- L3.5 worker records and trip math: completed 2026-11-04; local commit follows this handoff update. Training/assign commands, nearest drop-offs, deterministic cargo/ledger, governor assignment, timed clearing and forage shutdown are built. Frontier data version is 5; worker defaults migrate additively. The main/worker startup now supplies `resourceSpots` and `resourceSpotRules` to the frontier hub.

## Next
1. **L3.6** (new Sol chat): workers become real units within about 3 screens of a player, bot army or raid. Read its full card and shared Loop 3 restrictions before editing; tell Tim the files/test plan first. `workers.js` exposes `position(w)`; records save `trip`, integer `elapsed`, `phase`, `carrying`, and `entity:null`. Preserve loaded/unloaded cargo conservation, training queues, drop-off rerouting and worker clearing. Copy the camps lifecycle pattern without editing camps.js. Do not let workers keep their own areas awake.
2. **L3.7** Drawing the town and the spots.
3. **L3.8** Build bar, tooltips and worker orders.
4. **L3.9** Tim playtest.

L3.5 validation: `node game/tools/test_frontier_workers.mjs` passes (distance, conservation, save timing, rejected orders, training, clearing, forage and real game/save integration). Also passed frontier guards/snapshot/commands/construction/economy/governor/place/zones/world/data, town grid and founding tests; main.js/game.js syntax checks pass. No browser automation or visual acceptance claimed.

## Rules
- All game rules live in `game/src/sim`; players and bots use the same commands.
- Run only the Node tests relevant to the card (the full suite times out in the cloud shell).
- New controls go in the Controls (?) panel.
- Nothing is pushed; Tim pushes himself.
- Tim authorized the L3.5 local commit and this doc update. For L3.6: no commit/push or doc edits without a fresh instruction; ask before editing docs. New UI controls, if any, must be listed in the in-game Controls panel.
- The test starter frontier towns stay until card E6b.
