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

Later UI phase proposal (Tim, 2026-10-29): a main-menu UI with icons and hover descriptions, prominent **Call Rally** and **Resume** buttons, and a clear Rally active-duration/cooldown timer; Resume appears when paused. Exact placement/design remains undecided; no implementation now. Tim reports current Duties/Rally are much clearer. The proposed Command Map button merger above also remains unimplemented.

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

- [ ] Select hotspots from profiling; replace duplicated selection/render/transfer helpers and remove superseded code. Prefer net-negative diffs for replacement refactors; no arbitrary blanket “minus 150 lines” incentive.
- [ ] Trial JavaScript-aware dead-code analysis accounting for browser, test, JSON and dynamic entrypoints. Baseline legacy findings and block newly introduced confirmed orphans; do not add a major toolchain without asking.
- [ ] Verify references through LSP if available, `rg` and entrypoint inspection before removal. Zero text references alone does not establish unreachability.
- [ ] Run focused regressions, update the relevant owner docs and make checkpoint commits after phases. Tim’s visual/balance checks remain required before calling those aspects complete.

Separate docs cleanup: older Sweep-unbuilt paragraphs remain historical alongside the newer implementation checkpoint; reconcile them in a small later pass rather than a broad documentation sweep now.

## 8. Final playtest fix pass

Added at Tim’s request (2026-10-29). After the current Geisha/status-label follow-up, preserve phases 4–7 in their existing order. New playtest reports go here for later action, not immediate scope expansion.

- [ ] Record each new report with reproduction/expected behavior and affected owner doc; do not imply implementation approval or completion.
- [ ] Triage the queued reports together after remaining scheduled phases; agree the fix scope before building.
- [ ] Apply focused fixes/checks and update owners/checkpoint commits; obtain Tim’s practical playtest confirmation, keeping exhaustive validation claims separate.

Maintenance queue: pre-existing stale `test_shinobi_pass` hidden-bonus/dawn-expiry assertions; update focused expectations without reverting correct gameplay. Original reported money-loss reproduction remains open. No other individual new fixes recorded yet. Previously listed Sweep waypoints, visual polish and menu proposals retain their existing status; this queue does not automatically authorize them.
