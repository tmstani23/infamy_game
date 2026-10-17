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
4. Recruiting and commanding crew: hiring, orders and combat done (2026-10-16); hospital and playtest left (`crew_recruiting_plan.md`).
5. Interiors for the three buildings: done (2026-10-16), 3D plus a room generator.
6. Rival clan AI and the den raid: next.
7. Then: inventory, stash, fence, documents.
