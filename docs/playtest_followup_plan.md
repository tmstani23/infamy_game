# Playtest follow-up phased plan

Recorded 2026-10-29 from Tim’s latest playtest notes. **Planning only:** this records priorities, proposals and decisions still needed; it does not approve every implementation or tuning number. Map performance comes first. Keep work/checks small; follow [usage rules](usage.md) and ask before substantial usage. Topic owners linked below retain detailed specifications.

Approval (Tim, 2026-10-29): plan approved; start phase 1 map performance/render lifecycle only. Deployment redesign, balance and later refactors remain queued. This approval does not settle the proposed tuning or open decisions below.

## 0. Preserve the current checkpoint

- [x] `3ae0309` contains the Sweep/crew checkpoint; preserve completed work rather than rebuild it. [Deployment status](deployment_sector_plan.md#sweep-checkpoint-tracking-2026-10-29).
- [x] Enforcer automatic-recast failure resolved in phase 3; focused regression passed, broader integration/playtesting remains pending. [Combat owner](combat_spec.md).
- Existing `?test=assignments` keeps the clan menu, grants 5000 ryo and stages/dispatches real Yakuza Shakedown or Kuroda Sweep; Shinobi receives money only. [Test switches](test_params.md). Manual visual/balance approval remains pending.

## 1. Map performance first

**Implemented / Node-checked checkpoint (2026-10-29); live visual/FPS/memory validation pending.** Phase 2 deployment redesign and balance changes remain queued.

Owners: [architecture/lifecycle and diagnostics](architecture.md#map-presentation-lifecycle-2026-10-29), [map/territory](territory.md#map-performance-checkpoint-2026-10-29), [deployment](deployment_sector_plan.md).

- [x] Small raster CPU baseline: 100 unchanged 128×128 frames measured 164.9 ms legacy versus 3.5 ms cached in implementation-thread microbenchmark. This is not full-game FPS/RAM evidence.
- [x] Opaque fullscreen map becomes active presentation; sim/AI/combat/timers/commands/news/audio continue. World WebGL/bloom, background sprite/nameplate/particle/camera-pan/fog-GPU updates, small minimap and hidden action-bar paints are skipped.
- [x] Reuse scene/resources; clear transient pooled FX on open. Close resynchronizes snapshots/fog to current state, without replaying skipped world hit/cast/dodge FX or delayed ownership celebrations.
- [x] Cache terrain buffers/dirty cells and a single honeycomb/border canvas; slow ripple at 8 Hz, immediate invalidation on size/zoom/selection/presence. Markers retain map rate; roster snapshots are lazy, honest enemy contacts observed each sim tick even closed. Deployment UI caches at 10 Hz with immediate selection/feedback changes. Hidden duplicate roster stops updating; ping queues expire/cap at 64.
- [x] Coordinator reports passing `test_map_performance` (pixel/fog/tint parity, shared buffers, 1000 lifecycle cycles, closed-map contacts), `test_deployment_map` (single-canvas reuse/ripple/zoom), `test_deployment_panel_flow`, `test_game_shell`, syntax checks for thirteen changed modules and diff check. No browser automation or live browser validation performed.
- [ ] Tim manual diagnostics via `window.infamy.mapPerformance()`: worldFrames stops while sim tick advances; map selection/zoom/transfers respond; open through combat/night/interior changes then close onto latest state without FX backlog; repeated open/close/zoom plateaus resources. Check actual browser RAM/FPS separately. Node lifecycle checks do not establish stable browser memory. The unrelated enforcer recast assertion was subsequently resolved in phase 3.

## 2. Fullscreen deployment simplification

**Partial implementation / Node-checked (2026-10-29):** Tim’s requested left key, map with wider attached right deployment panel, stronger Duties/operation/Rally emphasis and duplicate-own-unit presentation fix are implemented. Panel sections use paging rather than stacked scrolling; saved selection and existing gameplay rules remain. [Current controls](controls.md#deployment-layout-follow-up-2026-10-29). This does not complete every phase 2 task: transfer-workflow consolidation and any retained pip-drag shortcut remain unchecked below. Tim manually approved the current deployment layout/staffing fixes as good for now (2026-10-29). This is usability approval, not a full browser memory/FPS audit; no automated browser/screenshot test run.

Coordinator reports passing panel-flow (existing real-sim transfer/autoaccept/cancel plus paged unique roster/sections/counts), selection-dock (own-card suppression, enemy availability, world-HUD restoration), deployment-map and map-performance checks, changed-JS syntax and diff checks. No new tests run for this docs/commit handoff.

Owners: [deployment](deployment_sector_plan.md), [controls](controls.md).

- [ ] Fit dominant map plus one wide panel into one viewport. Avoid nested scrollbars/sliders; use paging, disclosure or clear +/- controls as needed.
- [ ] Keep one selected sector, roster and selection state. Selected count/highlights must agree with map/pips. Sector changes refresh matching controls without stale selections.
- [ ] Consolidate “Transfer selected crew” and “Assign crew here” into one workflow supporting source-first and destination-first use of the same authoritative transfer command. Show destination, travel/cancel/status and accepted/rejected receipt. Selecting the destination dispatches without extra confirmation.
- [ ] Preserve capacities, physical travel, HQ pins/goals, saved assignments, groups and overflow rules.
- [ ] If action-bar pip dragging remains a supported shortcut, repair mapped-zone drops through that same command/receipt; show valid/rejected destinations. It must be optional, with no decorative nonfunctional drag affordances.

Future UI proposal (2026-10-29), not implemented: merge Map and Deployment into one button, with M always opening the integrated map/deployment. Label remains undecided; “Command Map (M)” is a recommendation only.

Later UI phase proposal (Tim, 2026-10-29): a main-menu UI with icons and hover descriptions, prominent **Call Rally** and **Resume** buttons, and a clear Rally active-duration/cooldown timer; Resume appears when paused. Utility-menu placement is now settled by the section 3 requirement below; other exact designs remain undecided. No implementation now. Tim reports current Duties/Rally are much clearer. The proposed Command Map button merger above also remains unimplemented.

Future Sweep proposal: visit a few waypoints around the destination sector before its final hold; waypoint count, route and timing remain undecided. Existing hold stays twenty seconds. [Owner note](deployment_sector_plan.md#sweep-route-playtest-proposal-2026-10-29).

## 3. Special crew

Approval (Tim, 2026-10-29): deployment is good for now; start phase 3 special crew, including Enforcer 600 HP/15 damage, four-second primary Taunt/recast fix and Geisha interruption/target-under-fire checks. These approved targets are now implemented/Node-checked as reported below; manual balance/visual checks remain pending. Preserve current deployment UI. Sweep route changes, combined button and icon-menu remain future work.

Audio follow-up implemented/Node-checked alongside phase 3: in-game background music using the existing two songs in varied order, with music toggle/volume in Settings; add more tracks later.

Owner: [combat](combat_spec.md). Some channel/cooldown work already exists in checkpoint 0; verify it before extending it.

- [x] **Implemented / Node-checked (2026-10-29):** Enforcer 600 HP/15 damage, primary automatic Taunt. Use **four-second cooldown** per Tim’s latest correction, superseding earlier five-second notes. Exact-cooldown stale-taunt exclusion fixed; recast regression passes.
- [x] Geisha: four-second cooldown; stationary automatic Charm only against a target not taking hits or actively focused. Real one-second channel with 75% movement slow and a small pink snare while casting; complete four-second Charm only after a valid channel.
- [x] Movement/attack commands, hit/death, visibility/range interruptions clear channel/snare. Retain hero/police/civilian exclusions and explicit command priority. Add focused target-under-fire/channel-interruption coverage; checkpointed tests alone do not establish all these cases.

Coordinator reports passing enforcer, geisha (under-fire/leash/fifteen interruptions), character-stats and Shakedown checks. Audio checks: game-music, menu-music and game-shell passed, including streaming/shuffle/persistence/autoplay/visibility/failure cleanup. [Crew details](combat_spec.md#phase-3-crew-completion-checkpoint-2026-10-29); [music controls](controls.md#in-game-background-music-2026-10-29). Manual sound/visual/balance checks remain pending; no browser or broad-regression claim. Phase 2 workflow consolidation and future Sweep/menu proposals remain queued.

Manual confirmation (Tim, 2026-10-29): View crew, phase 3 special crew and in-game music are working in his playtest. This is a practical playtest confirmation, not exhaustive regression, sound/visual or balance testing.

Future visual-polish checklist, no code now: [Ninja hero purple effects](combat_spec.md#ninja-hero-visual-polish-proposal-2026-10-29). Preserve approved blade/effect style and gameplay stats.

Follow-up checkpoint (2026-10-29), **implemented / Node-checked, manual Geisha playtest pending**: completed the [revised Geisha specification](combat_spec.md#revised-geisha-specification-implemented-2026-10-29), superseding four-second Charm/CD with six-second Charm/ten-second CD, and added live per-crew duty/status text (Patrolling, Recovering, etc.) to pip group portraits using existing state. Tim reports other current phase parts working well. Then continue scheduled phases 4–7 in order; put newly reported playtest fixes in the final-pass queue rather than interrupting those phases. No broad side fixes now.

## 4. Shinobi economy bug audit

Status (2026-10-29): phase 4 implementation/targeted Node checkpoint complete; **stop for usage at Tim’s request**. Phase 5 built 2026-10-29 (close detection, Unstuck). Original roughly 70% money-loss report and manual match balance are unconfirmed; Geisha manual playtest remains deferred. New playtest bugs go to phase 8.

Owners: [Shinobi](ninja_clan_plan.md), [economy](business_raids_plan.md).

- [ ] Trace reported instant roughly 70% money loss: authoritative transaction reasons, percentage basis, duplicate triggers and cooldowns. Identify the actual source before changing rates; provide useful loss feedback.
- [x] Review contract Renown cadence, objective length, repeatability and cooldowns (initial implementation checkpoint; manual balance pending). Choose initial pacing after a short match-economy comparison; bots/humans use identical rules and contracts remain available any time of day.
- [ ] Separate verified bug fixes from proposed balance changes.

Completed phase 4 checkpoint: [treasury debit audit/feedback and limits](business_raids_plan.md#treasury-loss-audit-checkpoint-2026-10-29), [120-second contract start cadence, illustrative bounds and passing checks](ninja_clan_plan.md#contract-pacing-checkpoint-2026-10-29). Initial tuning is not full-match balance validation. Known stale `test_shinobi_pass` failure (38 versus 30) also occurs against pre-phase-4 HEAD; no full-suite-green claim. No more implementation before resuming.

## 5. Stealth and unstuck

Owners: [Shinobi](ninja_clan_plan.md), [controls](controls.md), [combat](combat_spec.md).

- [x] Close detection (built 2026-10-29): enemies within `rules.stealth.closeRange` 1.2 sense a ninja whatever their facing; LOS, rooms, smoke and veil still apply. Badge tooltip says "too close".
- [x] Unstuck (built 2026-10-29, `sim/unstuck.js`, `rules.unstuck`): hero only, 3 s channel, 5 min cooldown; blocked 5 s after a fight, during an HQ raid and in a contract objective room; lands inside your own hideout. Uses are logged to `state.stuckSpots` and the console as "[stuck spot]". Test `game/tools/test_unstuck.mjs`.

## 6. Crew growth and match balance

Owners: [crew](crew_recruiting_plan.md), [bots](rival_bot_plan.md), [economy](business_raids_plan.md).

- [x] Investigate reports of 29 crew by day 5/6, Shinobi 35 by day 7, player 22 versus Kuroda 1. Compare hiring throughput, prices/income, revive/retention, bot rebuilding and faction disparities.
- [x] Define early/mid/late target curves before changing numbers. Preserve useful early crews while restraining runaway midmatch armies; no new caps or exact rates are approved here.
- [x] Use short comparable seeded scenarios, avoiding broad costly simulations.
- Result (2026-10-29): cause was 20 business slots in town plus uncapped Renown slots (contracts alone gave about +2 a day). Rule now: cap = min(20, 6 + (day - 1) + business/Renown slots), no separate bonus cap; bot fix included.

## 7. Separate architecture/refactor pass

Owners: [architecture](architecture.md), [roadmap](roadmap.md).

- [x] Select hotspots from profiling; replace duplicated selection/render/transfer helpers and remove superseded code. Prefer net-negative diffs for replacement refactors; no arbitrary blanket “minus 150 lines” incentive.
- [x] Trial JavaScript-aware dead-code analysis accounting for browser, test, JSON and dynamic entrypoints. Baseline legacy findings and block newly introduced confirmed orphans; do not add a major toolchain without asking.
- [x] Verify references through LSP if available, `rg` and entrypoint inspection before removal. Zero text references alone does not establish unreachability.
- [x] Run focused regressions, update the relevant owner docs and make checkpoint commits after phases. Tim’s visual/balance checks remain required before calling those aspects complete.

Separate docs cleanup: older Sweep-unbuilt paragraphs remain historical alongside the newer implementation checkpoint; reconcile them in a small later pass rather than a broad documentation sweep now.
- Result (2026-10-29): shared sim helpers (`alive`, `dist`, `secs`, `noticeFor`) moved to `sim/util.js`, used by 17 files; 3 dead helpers removed; dead-code baseline clean; profile 2.5 ms per tick (5% of the budget). File splits: game.js done (2026-10-29, 5 modules, see `architecture.md`); main.js done (news_callouts.js, top_bar.js); render/abilityfx.js done (assets to abilityfx_assets.js, 811 to 712 lines). The abilityfx split stops there: the per-clan cast effects share mutable state (timers, particle pools) and have no test coverage. main.js and abilityfx splits await Tim's browser playtest.

## 8. Final playtest fix pass

Added at Tim’s request (2026-10-29). After the current Geisha/status-label follow-up, preserve phases 4–7 in their existing order. New playtest reports go here for later action, not immediate scope expansion.

- [x] Record each new report with reproduction/expected behavior and affected owner doc; do not imply implementation approval or completion.
- [x] Triage the queued reports together after remaining scheduled phases; agree the fix scope before building.
- [ ] Apply focused fixes/checks and update owners/checkpoint commits; obtain Tim’s practical playtest confirmation, keeping exhaustive validation claims separate.

- [x] **Ninja leader effects stronger (Tim 2026-10-30):** `render/weapon_shadow.js` (MAX_MOTES 44, faster shedding, width .009, fade .68) and `weapon_glow.json` `ninjato_hero` strength 0.75. New smoke trail: the leader sheds dark smoke curls while moving (steady when running, lighter when walking, none idle). First pass, not checked in the browser yet.

### Agreed fix list (Tim, 2026-10-30; section 1 implemented/Node-checked)

For whoever builds next (Claude or ChatGPT). Section 1 is implemented/Node-checked; sections 1–2 are now implemented/Node-checked; sections 3–4 are unstarted. Repo rules still apply: all game rules in game/src/sim; every new control goes in the Controls panel; Node tests only (copy .js to .mjs for `node --check`); Tim playtests; commit after each checkpoint.
Causes: project file `phase8/playtest_review.md`. Balance decisions also live in `business_raids_plan.md`, `ninja_clan_plan.md` and `leader_balance.md`.

#### 1. Real-time sim + map/Deployment lag (do first)

Goal (Tim): screen lag must never slow the game. Timers (jail, raids, contracts) follow real time.

- **Cause:** `src/main.js` loop: `dt = Math.min(now - last, 0.1)`. When the map or Deployment screen drops below ~10 fps, the sim runs slower than real time.
- [x] **Fix A, real-time loop:** keep the fixed 20 Hz step and allow catch-up: `dt = Math.min(now - last, 1.0)`, with at most ~10 steps per frame. If more is owed, drop the remainder (only in extreme stalls; log a counter in dev). A hidden tab is paused by the browser; the 1 s cap stops a huge catch-up when you come back.
- [x] **Fix B, move UI out of the tick loop:** inside `while (acc >= tick)` keep only `game.step`, `gameMap.observe`, the news, hits and casts hand-off (news must still be read every tick) and `sound.update`. Move the prompt, stealthBadge, characterPanel, hire/clinic/police/contract menus, deploymentPanel, topBar, crewInput, selPanel, unitFrames, bldPanel and interiorInfo updates to once per frame after the loop. Otherwise catch-up frames run all the UI several times and make the lag worse.
- [x] **Fix C, cheaper map:** `src/deployment_map_data.js update()`: build a `room -> business` Map once per tick (location() now scans all businesses per unit), and loop crew once, bucketed by sector, instead of per sector. Tim (2026-10-30): "the map doesn't need to update very often, it should be snappy". Refresh the map unit data and the Deployment panel about twice a second (every 10 ticks). Redraw the map canvas only when that data changes, or right away on the player's own input (pan, zoom, hover, clicks, layer toggles), so the map responds instantly but sits idle otherwise.
- **Devil's advocate / risks:**
  1. Catch-up costs CPU on a slow frame and can spiral. Hence the step cap, and B and C to keep frames cheap.
  2. At about 2 Hz, unit dots on the big map move in small jumps. Fine for a strategy map; interpolate later if needed.
  3. Not measured in a browser yet. Before and after, Tim can run `infamy.mapPerformance()` in the console (dev) or a 10 s Firefox profile to confirm where the time goes.
  4. Callouts and pings must not be throttled: they read each tick's `state.news`, which is only kept for one tick.
  5. Multiplayer later: the server runs the sim at real time regardless; this keeps single-player the same.

Section 1 checkpoint (2026-10-29): implemented/Node-checked. `fixed_step_clock.js` keeps 20 Hz, caps elapsed time at one second and catch-up at ten steps/frame; excess whole ticks are discarded with fractional interpolation retained, pause creates no debt, and DEV clock counters appear in `infamy.mapPerformance().clock`. Tick-level contacts/news/pings/callouts/FX/audio/police/badge events remain captured every step; UI paints run once/frame. Badge observation queues retain intermediate-tick events without replay on zero-tick frames; scores use elapsed-tick intervals. Map room index is once/tick, crew bucketed once/snapshot; snapshots and Deployment refresh at 2 Hz with immediate input/feedback invalidation. Big canvas skips idle draws and invalidates for data/input/ping/resize; small minimap cadence remains.

Coordinator reports passing `test_realtime_loop` (2–60 FPS elapsed-time equivalence, bounds/stall/pause/interpolation, per-tick/frame wiring, cached scans/receipts, real canvas invalidation, retained/nonduplicated badges), `test_map_performance`, `test_deployment_map`, `test_deployment_panel_flow`, `test_game_shell`, `test_reward_popups`; nine-module syntax and scoped diff checks passed. **Manual browser smoothness/FPS/RAM validation remains pending**; no browser/screenshot automation or measured live FPS/RAM claim. Extreme-stall dropping is intentional; the bounded catch-up cannot preserve all elapsed time in extreme stalls. Section 2 not started; other section and overall manual-confirmation checkboxes remain unchecked.

Section 1 zone-selection follow-up (2026-10-29), implemented/Node-checked: repeated click-chain redraw requests coalesce into one next-frame paint; tooltip hover does not repaint the canvas, unchanged contents are reused and reads precede position writes. Heavy glowing honeycomb bitmap survives selection/flash/time changes; selected border is separate, base uses a cheap slow opacity pulse instead of per-hex moving ripple. Zoom/size/presence still invalidate the single bounded cache. Larger three-column zone tabs/section tabs emphasize selection; selected zone tab and summary flash brightly for 900 ms via cancelable Web Animations without forced-layout restarts.

Startup Node sample (100 measured ticks after twenty warm-up; real district/settings/civilians/police/bandits, Kuroda setup, **no external bot-brain commands**): 32 entities without civilian population about 0.98 ms/tick; 62 populated entities about 2.17 ms/tick, with civilians.tick about 0.40 ms, police.tick 0.18 ms and vision.tick 0.04 ms. This is not browser/full-combat evidence or a complete bot-brain benchmark. AI is unchanged and continues normally; world rendering remains suspended on the map.

Coordinator reports passing updated realtime-loop (100 invalidations → one paint, hover without repaint), deployment-map (selection/time reuse, zoom invalidation, one canvas), panel-flow (transfer paths, focus-flash cancellation/summary) and map-performance checks; four changed-JS syntax/scoped diff checks passed. **Manual browser smoothness/visual confirmation remains pending.** Other phase 8 sections remain unstarted.

##### Separate subphase: authoritative simulation worker (deferred exploratory idea)

Status revised at Tim’s request (2026-10-29): **deferred exploratory idea only; no implementation scheduled or approved**. Current active task is diagnosis only, with no further gameplay/architecture/UI changes. First identify the primary lag source. Tim’s proposed manual comparisons: map clicks versus zone tabs; repeat while paused; then disable Sectors layer and use zone tabs. Browser/layout/GPU bottleneck remains unconfirmed; earlier startup Node AI timing cannot establish the primary cause. Revisit worker scope only if profiling demonstrates main-thread simulation blocking input. Preserve completed A–C and selection follow-up. Goal: responsive map/deployment input and local highlights during heavy combat while sim/AI continue normally and map-open world rendering stays suspended. Caching alone cannot isolate main-thread simulation stalls. [Architecture boundary](architecture.md#proposed-authoritative-simulation-worker-unbuilt).

- [ ] **1. Interface and baseline:** inventory UI’s direct sim-helper/state dependencies; separate a read-only presentation/query interface. Measure representative heavy-combat input latency and snapshot cost; agree measured acceptance targets, not absolute responsiveness promises on saturated hardware. Specify worker startup/runtime failure behavior explicitly before implementation.
- [ ] **2. Authority and lifecycle:** move one authoritative fixed-20-Hz simulation and all AI to a local-play Web Worker. Handle startup/config/test parameters, pause and lifecycle. Use the same command protocol suitable for a future authoritative multiplayer server; no duplicate mutable simulations or gameplay changes.
- [ ] **3. Bounded state/event transport:** compact latest-state snapshots/deltas, coalescing obsolete queued snapshots; avoid whole-world/static-data cloning each tick. Retain all transient news/pings/combat/audio events with sequence handling. Map/deployment data around 2 Hz with prompt command receipts.
- [ ] **4. Main-thread presentation:** retain cached UI with immediate zone/highlight/input feedback. Requests carry IDs and receive authoritative accept/reject receipts; pending never means accepted. World view consumes latest snapshots/interpolation and resumes cleanly on map close.
- [ ] **5. Verification:** focused Node coverage for command ordering, stale snapshots/backpressure, transient-event retention, worker lifecycle/pause, deterministic sim parity and existing deployment flows. Tim manually browser-tests heavy combat plus rapid zone switching, command latency, snapshot cost and memory against agreed targets before any smoothness claim.

All worker checkpoints remain unchecked/unbuilt possible future scope, gated on profiling evidence; they are not a scheduled subphase. Sections 2–4 retain their existing scope/status; this plan adds no gameplay or runtime code.

#### 2. Bugs

- [x] 1. **Loot a body lying under another body:** the click should prefer the lootable (gold) body under the cursor (`src/crew_input.js` target pick).
- [x] 2. **A loot or execute order must not cancel a running execute:** give the job to a free selected crew member from the group; if none is free, queue it after the current execute (`sim/crew_jobs.js` / `loot_execute.js`).
- [x] 3. **Hero standing on a body can't loot or execute:** if the hero is in reach, the hero does it (sim `startLoot` / `startExecute`, `preferHeroInRange`).
- [x] 4. **Patrols go into the woods and get stuck:** `sim/sector_patrol.js` makes 8 points around the sector box. Keep only points in town or on streets (nav free and not forest), along town edges and roads between bandit camps.
- [x] 5. **Patrols idle at full HP and don't fight back:** repro first; likely passive or holdFire left over after Z, Rally or Smoke. Patrol duty should clear it and always hit back.
- [x] 6. **Rallied raid group left outside:** rallied raiders should follow the hero through the raid door when they reach the ring; C+V inside should also call in group members still outside.
- [x] 7. **Couldn't enter after the lantern fell and the raid ended:** clear the "raiders wait outside" entry lock on every raid end (`sim/businesses.js` mayEnter).

Section 2 checkpoint (2026-10-29): original seven fixes implemented/Node-checked; manual confirmation pending. Body queues are deduplicated/bounded to eight jobs and preserve active executes/group return plans; free reachable selected crew take work first, including solo selection. Eligible nearby hero has priority for hero/Rally groups; Ctrl/sector groups remain crew-only, with no duplicate claims. Explicit solo nonbody/Stop/Smoke may still cancel. Patrol/Sweep nav uses town/road/boardwalk safe masks; automatic duty clears stale passive flags and pause yields to combat, preserving explicit manual Stop. Rally stragglers physically follow through normal doors/capacity checks; expired raids no longer impose entry/capacity locks.

Approved additions: Threefold Thrust Reprisal splash excludes police (including wave officers) and civilians without changing direct targeting. Running Kuroda lightning uses 0.14-second emission, 0.4-second life, 0.2 drift and fixed-at-birth correlated bends; visual approval pending. **Sweep now has three distinct reachable road-safe street positions, twenty seconds each**, superseding earlier single-point/single-sixty-second interpretations; per-position travel/contest/reset, final-only reward/scatter, Position 1/3 UI, start/advance/completion callouts and start/advance map/minimap pings. Reject routes without three valid points. [Sweep owner](deployment_sector_plan.md#sweep-three-position-checkpoint-2026-10-29).

Coordinator reports passing crew-jobs, target-controls, sector-playtest, assignments, crew-recall, raid, Shinobi-HQ-raid, Kuroda, Sweep and deployment-panel-flow checks, changed-JS syntax and scoped diff checks. No browser automation or full-match/visual claim. Tim separately reports map responsiveness improved; worker remains a deferred idea. Section 3 is next, unstarted; overall manual-confirmation checkbox remains unchecked.

#### 3. UI

- [x] **Compact utility icon menu (implemented/Node-checked):** much smaller, bottom right beside the ryo circle. Icons show action name and shortcut/control text on hover; preserve every control and accessibility (accessible names, keyboard/focus equivalent). This settles placement of the earlier generic icon-menu proposal. Combined Map/Deployment remains one action; labelled Close map/Esc closes the combined workspace. Section 3 implemented below; browser/visual checks pending. Separate prominent Rally/War Lantern action buttons retain their proposal status below.

- [x] 8. **One combined Map/Deployment screen and one button** (not separate screens). A clearly labelled **Close map** button and Esc both close the whole combined workspace. Tim uses Firefox. Implemented progressive fullscreen keyboard lock: newer Fullscreen keyboard locking uses `requestFullscreen({keyboardLock:'browser'})` plus Escape `preventDefault`, distinct from the current `navigator.keyboard.lock(['Escape'])` path. Keep existing API support progressively, unsupported-option fallback and accurate status; preserve long-Escape/browser exit. Firefox version support/manual testing remain pending; do not claim universal support. Sources: [MDN keyboard locking](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen#keyboard_locking), [Mozilla shipping record](https://bugzilla.mozilla.org/show_bug.cgi?id=2032302). Planning only; section 2 code unchanged.
- [x] 9. **Party frames:** crew pips move to a fixed-size raid-style frame in the top left with a header ("Crew"), styled differently from the selection panel (which stays where it is). The action bar goes back to one row.
- [x] 10. Big Rally and War Lantern buttons with icons next to the action bar (add to the Controls panel).

Crew-frame selection follow-up (2026-10-29): implemented/Node-checked. Suppress owned-crew selection cards (including prisoner stand-ins) while keeping enemy/civilian inspection and intentional target-frame inspection. Group pips now show shared location text in hover with live status/HP; medical tooltip names Clinic/Police HQ and bail amount. Gameplay unchanged. Coordinator reports selection-dock, selection-panel and deployment-panel-flow checks passed; manual appearance pending.

Tim reports Firefox Escape now behaves as intended and group switching feels much smoother. Practical feedback only, not exhaustive browser/accessibility validation.

Section 3 implementation/Node-check checkpoint (2026-10-29): compact nine-icon menu sits beside movable Ryo, with hover/focus action names, shortcuts and availability; existing handlers/hotkeys retained, stationary geometry cached. One Map/Deployment action and M open docked workspace; Close map/Esc close both. Fullscreen keyboard-lock option is feature-read, legacy API retained, unsupported-option-only fallback, no false lock claim for ignored dictionaries, permission denial not retried, long-Escape/browser exit preserved. Crew pips/commands sit in movable/resizable fixed top-left frame; group/solo/drag/status retained; abilities one row. Rally shows active/cooldown; War Lantern previews nearest physical entrance and uses existing authoritative command with disabled-reason tooltip, no new shortcut. Controls panel updated; pip clicks excluded from world input.

Additional approved tweaks: Reprisal cooldown 15 seconds; rifle Aimed Shot range ten (melee unchanged); Sweep holds idle within point radius rather than running in place. Coordinator reports `test_command_ui`, game-shell, deployment-panel-flow, HUD-drag, target-controls, realtime-loop, rifleman, Kuroda, Sweep passed; syntax/diff checks passed. No browser/screenshot automation. Firefox-version, fullscreen Escape, visual/layout and sound checks await Tim’s manual test.

New follow-ups, unbuilt: wide ground-route Sweep chevrons follow squad, persist until point capture and refresh on next leg; visible arrival flashes/pings only for observers with sight, with no fog leak. At hold, crimson low shield arcs/stance plus progress ring visualize existing grouped protection; **no extra defensive buff**. Approved lighter ranged Reprisal implemented: landed Aimed Shot uses existing Reprisal on normal 18-damage weapon stats (20% ≈4 splash), not 80-damage shot stats (16); all police/civilians excluded. Focused `test_kuroda`/`test_rifleman` pass per coordinator; manual balance/visual checks pending.
- [x] **Game menu / Quit game** button in Settings (Tim 2026-10-30).

#### 4. Balance (Tim decided)

- [x] **Business revenue −40%** (settings.json payouts). Diminishing returns: businesses 1–4 pay full, each one after that pays 10% less than the one before, never below 60%, so many businesses still matter.
- [x] **Property clans earn Renown (11a):** +40 raid win, +20 Shakedown success, +15 stopping a Shinobi job on your business, +5 sector clear. Renown counts toward season points like the Shinobi's (50 Renown = 1 point, `season.renownPerPoint`; Tim 2026-10-30). No crew slots from it for property clans.
- [x] **Shinobi alert window (13):** once a Steal or Sabotage job alerts the owner, at least 75–80 s must remain before it can complete. Design follow-up: give the Shinobi something to do in that time (e.g. defend the mark, plant a second one) so it isn't just standing around.
- [x] **Raid limit (14):** each clan may raid each rival at most once per night.
- [x] **Rifle Aimed Shot nerf:** 80 to 60 damage, keeping the aim time so it can be interrupted (code still at 80).
- [~] **Sounds (15), partial:** Tim makes 3–4 hero ability sounds in ElevenLabs (whoosh, impact, smoke puff, shout) and drops them in assets/sounds; wire them in render/sound.js. More music from Suno later.

Section 4 done (2026-10-30, `test_phase8_balance.mjs`): payouts cut 40%; diminishing returns (4 full, then −10% each, floor 60%); property Renown 40/20/15/5; 75 s alert window; one raid per rival per night; rifle Aimed Shot 60. Sounds partial: ability cues for Shadow Step, Red Lantern, Assassinate and Threefold are in (`render/sound.js` `ABILITY_CUE`, `assets/sounds/ability_*_1.ogg`); the rest are parked because the ElevenLabs SFX were poor. Section 3: Quit to game menu done; Edit layout mode built (Settings > Edit layout, `hud_layout.js` registry, `#lock` target-marker layer excluded); target-marker fix (`lock` added to `STRUCTURAL`).

#### 5. Clan roles (proposal, Tim 2026-10-30)

Every clan gets a taunter and a ranged class:

- [ ] Yakuza: add an archer (ranged); the existing Irezumi Enforcer is the tank/taunter.
- [ ] Kuroda: add a spear guard (taunter); the existing Teppo rifleman is the ranged class.
- [ ] Shinobi: add a shadow guard (taunter); the Geisha is the ranged control, with a new weak ranged basic attack.

#### Order

1 → 2 → 3 → 4, with a checkpoint commit after each section.

Maintenance queue: pre-existing stale `test_shinobi_pass` hidden-bonus/dawn-expiry assertions; update focused expectations without reverting correct gameplay. Original reported money-loss reproduction remains open. No other individual new fixes recorded yet. Previously listed Sweep waypoints, visual polish and menu proposals retain their existing status; this queue does not automatically authorize them.


Global Edit layout mode: built 2026-10-30 (Settings > Edit layout, hud_layout.js registry). Settings entry; while active, every UI element must be included: raid/crew frame, status panels/badges, utility icon menu, and all existing/new panels. Shared layout registry or automatic enrollment is mandatory; future UI gets no bespoke omissions. Outlines/drag/resize handles appear while editing and normal panel actions disable. Done saves/exits/locks all; Cancel restores prior layout; Reset restores defaults using existing positions. Remove permanent lock icons outside edit mode. Future regression check enumerates registered/rendered UI panels and verifies every one can move/resize and participates correctly in Done/Cancel/persistence.

## Handoff status (2026-10-30, for ChatGPT or the next session)

- First: playtest the stronger ninja leader effects and the new smoke trail (first pass, not browser-checked; top of phase 8).
- Phase 8 sections 1-4 are built; sounds are partial (see above). Everything is committed locally; Tim pushes.
- **Next step: plan the clan roles** (phase 8 section 5: Yakuza archer, Kuroda spear guard, Shinobi shadow guard, Geisha weak ranged attack). Plan first, Tim OKs before building.
- Older failing tests (also fail at HEAD, not from phase 8): test_crew, test_deployment_transfers, test_ninja, test_rewards, test_shinobi_pass, test_reprisal_mobility.
- Rules: all game rules in `game/src/sim`; every control in the Controls panel and `controls.md`; test switches only in `game/src/test_params.js`; Node tests only (copy to .mjs for `node --check`); Tim playtests, then commit per checkpoint.
