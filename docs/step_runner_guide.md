# Step runner guide

How to hand one build step to a Claude thread, including a smaller, cheaper model, and get a
reliable result. Works for any step list, starting with [frontier_build_steps.md](frontier_build_steps.md).

Drafted 2026-11-01. Proposed home: `docs/step_runner_guide.md`.

## Will a smaller model manage it?

Yes for steps that are narrow, fully specified and checked by a Node test that passes or fails.
No for steps that need judgement: cross-cutting changes to `sim/game.js`, the worker and snapshot
pipeline, anything in `render/view.js`, performance work, open-ended debugging, combat AI, feel and
balance tuning. Each step in a step list carries one of these tags:

| Tag | Who runs it | Meaning |
|---|---|---|
| **SMALL** | Smaller model (Sonnet, or cheaper) | One to three files, exact spec, a named Node test decides pass/fail. |
| **STRONG** | Default (strongest) model | Touches shared plumbing, needs investigation, or has no clean automatic check. |
| **TIM** | Tim | A design choice, a mock to approve, or a playtest. Nothing after it starts until Tim answers. |

Never edit or delete an existing assertion to make a test pass. Only the card's own new test file
may change. If an older test starts failing, stop and report it.

A SMALL step that fails its test twice after honest fixes is not retried a third time. The thread
stops, reports what failed, and the step is re-run on the default model.

## What the thread reads (and nothing more)

1. `START_HERE.md` and `docs/usage.md`.
2. This guide.
3. The WHOLE plan, `docs/frontier_build_steps.md` (Tim's rule, 2026-11-02).
4. Its one step card, plus the files the card names. No other docs, no docs catch-up.

If the step needs a file the card does not name, read it only to find one function, with `grep`
and a short `sed -n` range, never the whole file.

## Rules every step follows

- **Sim owns the rules.** Game rules go in `game/src/sim` (plain JS, runs in Node, no DOM or
  three.js). Players, bots and governors change the game only through commands passed to
  `game.step([...])`. Render and UI only read state and send commands.
- **No `Math.random()` in the sim.** Use the module's seeded `rng` (see `rng()` in
  `sim/combat.js`), so games replay and saves restore the same way.
- **Numbers live in data JSON** (`game/data/*.json`), never hard-coded, so Tim can tune them.
  New placeholder numbers get a `"_note": "placeholder, Tim to tune"` beside them.
- **State must be plain data.** Everything that must survive save/load lives in `game.state` as
  plain objects, arrays, numbers and strings: no functions, Maps, Sets or class instances.
- **Syntax check gotcha.** `node --check` misses errors in `game/src/*.js`. Copy the file to a
  `.mjs` in `to_delete/_chk/` and run `node --check` on the copy.
- **Controls.** Any new or changed key, button or click goes into the in-game Controls panel
  (the `?` panel) in the same step. Pick a free key: check `docs/controls.md` first (taken
  include W A S D, Q E R F, B, C, G, H, I, J, M, N, P, T, Z, U, Space, Tab).
- **Items.** Every usable item shares the one item slot on the action bar (B, right of F).
  Never add a second item button.
- **Sprites.** New or changed characters and items use the per-model flow only:
  `node tools/export_sprites.mjs . <model> --pack` (plus `--portrait`, `--margin=N`;
  `tools/repack_model.mjs`). Never re-audit the full catalog. Details in README "Exporting sprites".
- **No test switches** (Tim, 2026-11-02). A few dev test saves, rebuilt by
  `game/tools/make_dev_save.mjs`; update one of them for a new test need, never add a `?test=` switch.
- **Files.** Never delete art or old sheets. Unwanted files move to `to_delete/`.
- **Docs and git.** Threads do not write docs and do not commit or push. Send doc changes as a
  proposal to the coordinator; the Docs keeper writes and commits after Tim's OK.
- **Testing.** Node checks only. No headless browser, no screenshots. Tim checks the look.
- **Shared files.** Re-read a file right before editing it, make small targeted edits, never
  rewrite a whole file, never revert another thread's change.

## Test pattern

Tests live in `game/tools/test_*.mjs` and run from the repo root with
`node game/tools/test_<name>.mjs`. Copy this setup (taken from `test_inventory.mjs`):

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, DT } from '../src/sim/game.js';

const data = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
function fixture() {
  const g = createGame({ district: data('data/waterfront.json'), catalog: data('data/art.json'),
    cutouts: data('art/cutouts.json'), interiors: data('data/interiors.json'),
    parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json') /* add new data files here, e.g. frontier: data('data/frontier.json') */ });
  g.clans.addClan('player', { faction: 'yakuza', kind: 'yakuza', bot: false });
  g.clans.addClan('rival');
  const hero = g.spawn('hero', 'ronin', -8, 1, { owner: 'player', holdFire: true });
  return { g, hero: g.state.entities[hero] };
}
// ... assertions ...
console.log('test_<name>: ok');
```

A test prints one `ok` line and exits 0, or throws. A pure module (one that takes `state` and
data and needs no `createGame`) can be tested directly without the fixture: prefer that.

### Regression set

Run the step's own test, then this quick set whenever `sim/game.js`, `sim_snapshot.js` or a
shared module changed. Run them **before** the change too: only new failures count (a few tests
were already failing before this plan).

```
node game/tools/test_combat.mjs
node game/tools/test_crew.mjs
node game/tools/test_inventory.mjs
node game/tools/test_businesses.mjs
node game/tools/test_bot.mjs
node game/tools/test_sim_worker.mjs
node game/tools/test_settings.mjs
```

Long sims (`test_bot_game`, `test_playtest_sim`, `test_adaptive_ai`, `test_rooms`) take over 30
seconds; skip them unless the card names them. Device shell calls stop at 180 seconds, so run tests
in small batches.

## Step card format

Every step in a step list uses this shape, so a thread can run it alone:

```
### <ID>. <Name>  [SMALL | STRONG | TIM]
Needs: <step IDs that must be done first>
Files: <exact paths to create or change>
Do:
  1. <exact change>
  2. ...
Check (pass/fail): <test file and the assertions it must contain>
In game (Tim): <what Tim looks at, or "nothing visible">
Done note: <the one-line checkpoint message to send>
```

## Finishing a step

1. The step's test passes, the regression set has no new failures, and changed browser files pass
   the `.mjs` syntax check.
2. Nothing is half-edited: the game still starts.
3. Send the coordinator the card's done note, plus any controls or doc lines that need the Docs
   keeper. Then stop. One step per thread run, unless Tim says to chain them.

## Building toward a shippable game (Tim, 2026-11-01)

Infamy is heading for a Steam release, so steps are built like production code, not prototypes:

- **Platform seams.** Anything that touches the platform (save files, settings files, window and
  fullscreen, audio devices, later Steam achievements and cloud saves) goes behind a small interface
  with a browser or dev-server backend now. The desktop wrapper later adds its own backend without
  touching game code. `save_store.js` (frontier F1.6) is the first example.
- **Versioned data.** Every saved or loaded format carries a version and a migration path.
- **No dev leaks.** Dev-only checks run in the dev build only; dev-only tools stay under `game/tools/`.
- **Licenses.** New art, sound or code from outside notes its source and license in the step's done
  note, so the pre-Steam license pass is a lookup, not a hunt.

## Improving the process as we go

At each phase end the building thread adds one or two lines to its done note under **Process**:
what slowed it down, what a card got wrong, or a rule that would have helped (for example "card
named the wrong file" or "test took 90 s, split it"). The coordinator collects these. When one
repeats, it becomes a rule in this guide or a fix in the step list, through the usual doc OK, and
the Docs keeper records it. That way the docs get better with every phase instead of drifting.

Process note (W1, 2026-11-02): validate design-tool output (generators, previews, data files) early, with the validator and a quick look, before building on it.
Process note (W2, 2026-11-02): re-run `node tools/seed_world.mjs` after editing `rules` so `world.json` keeps its formatting.
