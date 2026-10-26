# Roadmap

## Build in layers (Settled, 2026-10-14)

Each layer is playable on its own before the next one starts.

1. **Tiny version**: single player against one bot clan in one district (scope below).
2. **Small multiplayer**: a few friends in one district, with day and night.
3. **Full city**: all districts, seasons, leaderboards, many clans.

## Tiny version (Settled scope)

- One **waterfront district at night**.
- The **hero**, plus up to **3 recruits**.
- Three enterable buildings: **teahouse**, **warehouse**, **gambling den**.
- One **AI rival clan**.
- Goal: **take and hold the gambling den**.

## Tech (Settled)

- Latest three.js with ES modules. Multiplayer with Colyseus.

## Next steps

1. Art: done for the whole cast (2026-10-17). Status in `cast_tracker.md`.
2. Sprite render test: done (`look_tests/sprite_render_test.html`, `tools/export_sprites.mjs`).
3. Hero movement and camera in the district: done (2026-10-15).
4. Recruiting and commanding crew: hiring, orders and combat done (2026-10-16); downed and hospital done, plus townsfolk and night bandits (2026-10-17); playtest left (`crew_recruiting_plan.md`).
5. Interiors for the three buildings: done (2026-10-16), 3D plus a room generator.
6. Built 2026-10-19: the 2x hand-made port-town map, the game settings file, and businesses and raids (buying, attacking, War Lantern raids, defending; `business_raids_plan.md`). The rival bot clan is built too (2026-10-19, `rival_bot_plan.md`).
7. Built 2026-10-20: season score and season end, territory areas and the M game map (`territory.md`).

Tim's order from here (2026-10-20): a fully playable single-player game first, small tweaks later.

8. Ninja (Shinobi) clan fully playable: contracts only (no property), village board, stealth, assassin leader. Plan: `ninja_clan_plan.md` (being built, 2026-10-20).
9. Start menu built 2026-10-22: [clan/difficulty selection](gameplay_and_design.md#starting-paths-settled). Load/save remains future work.
10. Inventory, stash, fence and world loot; business upgrades.
11. Rival bot medium and hard tuning.
12. Before any public release: close the test switches (`test_params.md`) or put them behind sign-in (Tim 2026-10-19).
13. Later (after the core game): combat variety (Tim 2026-10-19, planned, not built), so fights aren't one big auto-attack huddle. Ideas: per-enemy special attacks (knockdowns, stuns, charged shots); police types such as ranged officers who back off and fire a charged shot, and a captain; AI that spreads out and flanks instead of piling in.

On hold: real estate (market, selling, lots, development) until the map can grow (Tim 2026-10-20).

## Architecture and maintenance pass (Tim, 2026-10-21)

After the start-menu phase and playtest, begin with a read-only architecture audit. Approve a concrete checklist before refactoring; then complete the maintenance pass before the next feature batch:

- [ ] Audit module boundaries and make a short, prioritized refactoring checklist.
- [ ] Organize growing sim/game logic and shared AI helpers; consolidate repeated interaction, targeting and lifecycle rules.
- [ ] Add regression coverage for cross-system behavior: stealth, downed units, services, contracts and raids.
- [ ] Refactor in small, tested steps, keeping gameplay behavior unchanged.
- [ ] Update [architecture.md](architecture.md) to match the code.

Phase 4 deployment/sector/Rally design (Tim, 2026-10-25; not built): [implementation plan and open decisions](deployment_sector_plan.md), including the linked Shinobi HQ raid. This records future work; it does not authorize implementation.
