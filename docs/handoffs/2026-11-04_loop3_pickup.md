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

## Next
1. **L3.5 Workers as trip math** (Sonnet). Also: workers do the ground clearing for placed buildings (still instant in `construction.js`), and `forage` stops once a town has workers.
2. **L3.6** Workers become real units within about 3 screens of a player, bot army or raid.
3. **L3.7** Drawing the town and the spots.
4. **L3.8** Build bar, tooltips and worker orders.
5. **L3.9** Tim playtest.

## Rules
- All game rules live in `game/src/sim`; players and bots use the same commands.
- Run only the Node tests relevant to the card (the full suite times out in the cloud shell).
- New controls go in the Controls (?) panel.
- Nothing is pushed; Tim pushes himself.
- The test starter frontier towns stay until card E6b.
