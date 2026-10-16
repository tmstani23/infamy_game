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

1. Art: done for the ronin (model, rig, 9 animations, spritesheets). Next, make 3D models of the rest of the cast on Tencent, rig them in Mixamo, and batch-export their sprites.
2. Sprite render test: done (`look_tests/sprite_render_test.html`, `tools/export_sprites.mjs`).
3. Hero movement and camera in the district (placeholder art is fine).
4. Recruiting and commanding crew.
5. Interiors from templates for the three buildings.
6. Rival clan AI and the den raid.
7. Then: inventory, stash, fence, documents.
