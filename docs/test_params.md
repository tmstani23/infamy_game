# Test switches

Single source: `game/src/test_params.js` (Tim 2026-10-19: one param, nothing hidden anywhere else). `DEV = true` at its top; set it to `false` before any public release (roadmap) and the test param and dev-only keys below all turn off. Rule: any new test switch goes in that module and gets a row here in the same batch (`documentation_role.md`).

Normal starts: [starting paths](gameplay_and_design.md#starting-paths-settled). The rich bot test remains separate; Shinobi uses a fair opening (Phase 3G, 2026-10-21).

## URL param inventory (reviewed 2026-10-31)

| Param | What it does | Status |
|---|---|---|
| `?test=bot` | See the whole rival clan fast: the bot clan starts with 5000 ryo (buys, hires, then a War Lantern raid on you); you start with the teahouse and 3000 ryo. | Retained: rival bot scenario. |
| `?test=lantern` | War Lantern testing: normal clan/difficulty menu (choose any clan); player starts with 3000 ryo, rivals with normal 200. No extra property, crew or lantern grants. DEV-only (2026-10-25). | Retained: funded normal start. |
| `?test=assignments` | DEV-only: retains clan menu, grants 5000 ryo; stages and dispatches Yakuza Shakedown or Kuroda Sweep. Shinobi gets money only (2026-10-29). | Retained: assignment staging. |
| `?test=crew` | DEV-only: retains clan selection and grants 5000 ryo to hire/playtest the expanded clan roster (2026-10-30). | Retained: roster test without staging. |
| `?test=shakedown` | DEV-only: stages three Yakuza at a rival teahouse and starts a real night Shakedown for dynamite/fire playtesting (2026-10-28). | Retained: direct night scenario. |
| `?test=ninja` | Play Shinobi at the village: hero + one ninja, 200 ryo, HQ only, against two normal Yakuza rivals. No boosted squad (2026-10-21). | Retained: fair Shinobi opening. |

All six presets have distinct starts or staging, so none were retired. The shared 3000/5000-ryo setup is consolidated in `game/src/test_params.js`; existing URLs keep their behavior. Add new manual scenarios there rather than making another test-param simulation copy. Reuse an existing playtest/server session when possible.

## Renderer comparison URL

| Param | What it does |
|---|---|
| `?sprites=original` | Reload with original sheets for all characters instead of packed sheets for visual and RAM comparison. If the URL already has parameters, append `&sprites=original` instead. Applies on page load; reload after changing it. |

## Dev-only keys and hooks (off when `DEV = false`)

| Switch | What it does | Where |
|---|---|---|
| N / the day-night button | Flips day and night at once. Any client could send the `time` command, a cheat in multiplayer. | `main.js` |
| F3 | Building footprint lines. | `main.js`, `render/view.js` |
| `window.infamy` | `{ game, view }` for the browser console (F12). | `main.js` |

Not covered by `DEV` (audited 2026-10-19): `game/server.mjs` saving the HUD layout (PUT `/game/data/ui_layout.json`), and the separate room preview page `game/tools/rooms.html` (`?type=`, `window.roomsReady`). `look_tests/sprite_render_test.html` has `window.spriteTest` for the exporter. Art tool command-line flags are in `README.md`.

## Dev test saves (2026-11-06)

`node game/tools/make_dev_save.mjs` rebuilds the dev saves in `saves/`; load them from the normal Load menu. `node game/tools/make_dev_save.mjs <name>` rebuilds only the saves named. At most 5 dev saves (Tim 2026-11-20); add one only with Tim's OK.

- `rail_rob_shinobi` (2026-11-21, replaces `rail_test_kuroda`): the Shinobi hero, 6 crew and his horse 8 off the middle of a 519-long line between two Kuroda Villages (Kurohama and Kuromine, a day old, so no war), with standing orders both ways (timber and stone plus 8000 coffers ryo to Kuromine, food and goods back) so the train runs loaded about every 2.5 minutes. A small Shinobi Village, Kagemura, about 1000 off, to cash the stolen chest. Spec option `robTest` in tools/make_dev_save.mjs.
- `dev_frontier`: a campaign save with the fixture towns and road, map revealed, spare ryo and a permit.
- `war_test_yakuza`: Yakuza at war on a rival Kuroda town (Kurogane) out on the island. The hero and 6 crew stand at the war camp; barracks, rifle range, two supply tents and stables are built, the camp hall is upgraded, the chest holds 5000 ryo and the stores 2000 timber and 1500 stone, so every roster unit can be trained at once. Kurogane has 4 houses and 2 workshops, so defender archers garrison. Black Beauty for the hero and one calico per hero crew member wait by the camp hall. A second Kuroda town, Kuroiwa, lies far from Kurogane, so the outcome picker at Kurogane offers all three outcomes. Kurogane is tier 2 with the hall war upgrade done and every military building the limits allow (stockade, stable, barracks 3, rifle range 2, clan hall, foundry, armory, field clinic, supply tents 6, watchtowers 8, plus the kennel or hidden dojo when its clan has one), and 1500 ryo in its defender war chest. Since 2026-11-18 the camp starts with the tier-2 pack (2400 ryo, 600 timber, 300 stone) instead of the 7c sandbox stock; Kurogane has a station, a line to the capital and average stock (2500 ryo coffers, 1500 timber, 800 stone) plus its 1500 war chest; Kuroiwa and the player's town Hamada (about 1160 from the camp, for the camp spur) are Villages with a station, two storehouses, a line to the capital, average stock and 2500 ryo.
- `war_defend_yakuza`: the player defends Tetsumichi (station, line to the capital, average stock, 1000 ryo in its war chest) against a Kuroda bot war camp that starts with only its hall and the tier-2 pack, no rail; the bot builds its own spur to its town Kurosaki (station and line to the capital). Replaces the 2026-11-17 pre-linked camp.
