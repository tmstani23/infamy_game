# Playtest follow-up phased plan

Recorded 2026-10-29 from Tim’s latest playtest notes. **Planning only:** this records priorities, proposals and decisions still needed; it does not approve every implementation or tuning number. Map performance comes first. Keep work/checks small; follow [usage rules](usage.md) and ask before substantial usage. Topic owners linked below retain detailed specifications.

Approval (Tim, 2026-10-29): plan approved; start phase 1 map performance/render lifecycle only. Deployment redesign, balance and later refactors remain queued. This approval does not settle the proposed tuning or open decisions below.

## 0. Preserve the current checkpoint

- [x] `3ae0309` contains the Sweep/crew checkpoint; preserve completed work rather than rebuild it. [Deployment status](deployment_sector_plan.md#sweep-checkpoint-tracking-2026-10-29).
- [ ] Investigate the known failing enforcer automatic-recast assertion; integration is not fully green. [Combat owner](combat_spec.md).
- Existing `?test=assignments` keeps the clan menu, grants 5000 ryo and stages/dispatches real Yakuza Shakedown or Kuroda Sweep; Shinobi receives money only. [Test switches](test_params.md). Manual visual/balance approval remains pending.

## 1. Map performance first

**Implemented / Node-checked checkpoint (2026-10-29); live visual/FPS/memory validation pending.** Phase 2 deployment redesign and balance changes remain queued.

Owners: [architecture/lifecycle and diagnostics](architecture.md#map-presentation-lifecycle-2026-10-29), [map/territory](territory.md#map-performance-checkpoint-2026-10-29), [deployment](deployment_sector_plan.md).

- [x] Small raster CPU baseline: 100 unchanged 128×128 frames measured 164.9 ms legacy versus 3.5 ms cached in implementation-thread microbenchmark. This is not full-game FPS/RAM evidence.
- [x] Opaque fullscreen map becomes active presentation; sim/AI/combat/timers/commands/news/audio continue. World WebGL/bloom, background sprite/nameplate/particle/camera-pan/fog-GPU updates, small minimap and hidden action-bar paints are skipped.
- [x] Reuse scene/resources; clear transient pooled FX on open. Close resynchronizes snapshots/fog to current state, without replaying skipped world hit/cast/dodge FX or delayed ownership celebrations.
- [x] Cache terrain buffers/dirty cells and a single honeycomb/border canvas; slow ripple at 8 Hz, immediate invalidation on size/zoom/selection/presence. Markers retain map rate; roster snapshots are lazy, honest enemy contacts observed each sim tick even closed. Deployment UI caches at 10 Hz with immediate selection/feedback changes. Hidden duplicate roster stops updating; ping queues expire/cap at 64.
- [x] Coordinator reports passing `test_map_performance` (pixel/fog/tint parity, shared buffers, 1000 lifecycle cycles, closed-map contacts), `test_deployment_map` (single-canvas reuse/ripple/zoom), `test_deployment_panel_flow`, `test_game_shell`, syntax checks for thirteen changed modules and diff check. No browser automation or live browser validation performed.
- [ ] Tim manual diagnostics via `window.infamy.mapPerformance()`: worldFrames stops while sim tick advances; map selection/zoom/transfers respond; open through combat/night/interior changes then close onto latest state without FX backlog; repeated open/close/zoom plateaus resources. Check actual browser RAM/FPS separately. Node lifecycle checks do not establish stable browser memory. Existing enforcer recast assertion remains unrelated and unresolved.

## 2. Fullscreen deployment simplification

Owners: [deployment](deployment_sector_plan.md), [controls](controls.md).

- [ ] Fit dominant map plus one wide panel into one viewport. Avoid nested scrollbars/sliders; use paging, disclosure or clear +/- controls as needed.
- [ ] Keep one selected sector, roster and selection state. Selected count/highlights must agree with map/pips. Sector changes refresh matching controls without stale selections.
- [ ] Consolidate “Transfer selected crew” and “Assign crew here” into one workflow supporting source-first and destination-first use of the same authoritative transfer command. Show destination, travel/cancel/status and accepted/rejected receipt. Selecting the destination dispatches without extra confirmation.
- [ ] Preserve capacities, physical travel, HQ pins/goals, saved assignments, groups and overflow rules.
- [ ] If action-bar pip dragging remains a supported shortcut, repair mapped-zone drops through that same command/receipt; show valid/rejected destinations. It must be optional, with no decorative nonfunctional drag affordances.

## 3. Special crew

Owner: [combat](combat_spec.md). Some channel/cooldown work already exists in checkpoint 0; verify it before extending it.

- [ ] **Proposed tuning:** Enforcer 600 HP/15 damage, primary automatic Taunt. Use **four-second cooldown** per Tim’s latest correction, superseding earlier five-second notes. Investigate existing recast eligibility failure.
- [ ] Geisha: four-second cooldown; stationary automatic Charm only against a target not taking hits or actively focused. Real one-second channel with 75% movement slow and a small pink snare while casting; complete four-second Charm only after a valid channel.
- [ ] Movement/attack commands, hit/death, visibility/range interruptions clear channel/snare. Retain hero/police/civilian exclusions and explicit command priority. Add focused target-under-fire/channel-interruption coverage; checkpointed tests alone do not establish all these cases.

## 4. Shinobi economy bug audit

Owners: [Shinobi](ninja_clan_plan.md), [economy](business_raids_plan.md).

- [ ] Trace reported instant roughly 70% money loss: authoritative transaction reasons, percentage basis, duplicate triggers and cooldowns. Identify the actual source before changing rates; provide useful loss feedback.
- [ ] Review contract Renown cadence, objective length, repeatability and cooldowns. Choose initial pacing after a short match-economy comparison; bots/humans use identical rules and contracts remain available any time of day.
- [ ] Separate verified bug fixes from proposed balance changes.

## 5. Stealth and unstuck

Owners: [Shinobi](ninja_clan_plan.md), [controls](controls.md), [combat](combat_spec.md).

- [ ] Proposed close detection: valid nearby enemy observers detect within two units independent of facing; respect rooms/solid walls and check Smoke/ability interactions. Preserve 90-degree cone, lighting and walk/run rules at longer range, with an honest warning badge.
- [ ] Proposed own-HQ Unstuck button: once per five minutes with visible cooldown; authoritative safe destination and door/order/path/camera cleanup. **Combat-use policy remains an open decision before implementation.**

## 6. Crew growth and match balance

Owners: [crew](crew_recruiting_plan.md), [bots](rival_bot_plan.md), [economy](business_raids_plan.md).

- [ ] Investigate reports of 29 crew by day 5/6, Shinobi 35 by day 7, player 22 versus Kuroda 1. Compare hiring throughput, prices/income, revive/retention, bot rebuilding and faction disparities.
- [ ] Define early/mid/late target curves before changing numbers. Preserve useful early crews while restraining runaway midmatch armies; no new caps or exact rates are approved here.
- [ ] Use short comparable seeded scenarios, avoiding broad costly simulations.

## 7. Separate architecture/refactor pass

Owners: [architecture](architecture.md), [roadmap](roadmap.md).

- [ ] Select hotspots from profiling; replace duplicated selection/render/transfer helpers and remove superseded code. Prefer net-negative diffs for replacement refactors; no arbitrary blanket “minus 150 lines” incentive.
- [ ] Trial JavaScript-aware dead-code analysis accounting for browser, test, JSON and dynamic entrypoints. Baseline legacy findings and block newly introduced confirmed orphans; do not add a major toolchain without asking.
- [ ] Verify references through LSP if available, `rg` and entrypoint inspection before removal. Zero text references alone does not establish unreachability.
- [ ] Run focused regressions, update the relevant owner docs and make checkpoint commits after phases. Tim’s visual/balance checks remain required before calling those aspects complete.

Separate docs cleanup: older Sweep-unbuilt paragraphs remain historical alongside the newer implementation checkpoint; reconcile them in a small later pass rather than a broad documentation sweep now.
