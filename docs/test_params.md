# Test switches

Single source: `game/src/test_params.js` (Tim 2026-10-19: one param, nothing hidden anywhere else). `DEV = true` at its top; set it to `false` before any public release (roadmap) and the test param and dev-only keys below all turn off. Rule: any new test switch goes in that module and gets a row here in the same batch (`documentation_role.md`).

## URL param

| Param | What it does |
|---|---|
| `?test=bot` | See the whole rival clan fast: the bot clan starts with 5000 ryo (buys, hires, then a War Lantern raid on you); you start with the teahouse and 3000 ryo. |
| `?test=ninja` | Play the Shinobi clan (ninja leader + 2 ninja crew), starting at the village (`spawns.ninja`), until clan select exists. |

## Dev-only keys and hooks (off when `DEV = false`)

| Switch | What it does | Where |
|---|---|---|
| N / the day-night button | Flips day and night at once. Any client could send the `time` command, a cheat in multiplayer. | `main.js` |
| F3 | Building footprint lines. | `main.js`, `render/view.js` |
| `window.infamy` | `{ game, view }` for the browser console (F12). | `main.js` |

Not covered by `DEV` (audited 2026-10-19): `game/server.mjs` saving the HUD layout (PUT `/game/data/ui_layout.json`), and the separate room preview page `game/tools/rooms.html` (`?type=`, `window.roomsReady`). `look_tests/sprite_render_test.html` has `window.spriteTest` for the exporter. Art tool command-line flags are in `README.md`.
