# Map performance diagnosis (updated 2026-10-31)

**Status (2026-10-31):** Targeted collision and AI route-planning optimizations and worker isolation are implemented and Node-verified. The user's measured observation that the map is snappy while paused motivated isolating the live simulation. Manual browser checks and Firefox profiling remain pending; Node protocol timings do not guarantee browser FPS or resolve every source of lag.

## Measurements

`game/tools/profile_map_runtime.mjs` uses production map, settings and sim/bot code. It warms up for 50 ticks, then records 500 ticks. The balanced full-roster case stages 20 crew per clan, with 30 civilians, 8 police and the match's two bot brains. This is a controlled stress case, not a natural late-match save. The combat case orders the roster into an encounter. Timings are per simulated tick, in milliseconds.

| Scenario | Entities (standing) | Sim mean | Total mean | Total p95 | Total max |
|---|---:|---:|---:|---:|---:|
| Startup | 61 (61) | 2.123 | 3.069 | 4.636 | 47.436 |
| Full rosters | 119 (111) | 13.549 | 14.839 | 22.333 | 62.036 |
| Combat | 116 (114) | 8.585 | 10.616 | 20.058 | 94.679 |

Map observation averaged 0.105–0.169 ms and snapshot preparation 0.008–0.010 ms across these cases. The combat case's p99 total was 49.721 ms; bot work peaked at 88.328 ms. These are Node measurements and do not include browser events, DOM/layout, painting, GPU work or frame presentation.

## Findings and limits

The scoped full-roster CPU profile points to `sim/game.js` `separate()`: it checks street-unit pairs quadratically, including civilians and police, and repeated `statsOf`/`baseStats` calls rebuild merged stats to read collision radius. Geisha focus and recovery scans are secondary costs. Strategic Shinobi contract/hunt path planning contributes spikes; the current route cache already uses a 100-tick TTL.

An isolated experiment against a temporary copy cached each unit's radius once per separation pass. In that single balanced run, mean simulation time fell from 13.549 to 10.270 ms (about 24%), and total mean from 14.839 to 11.699 ms. That experiment was preliminary; the production implementation and its parity checks are summarized below.

The results show simulation CPU cost grows substantially with roster size and identify a concrete hotspot. They do **not** establish that simulation is the cause of Tim's reported map lag: the benchmark has no browser rendering and is not a late-match save. Compare responsiveness while paused and collect a Firefox performance profile when the lag occurs.

## Implemented optimization and verification

Collision separation now caches each street body's radius once per pass, uses a dynamic spatial hash to choose nearby pairs, preserves legacy ascending pair order, and reindexes/rechecks after pushes so chain reactions remain covered. Axis checks avoid unnecessary distance work while the existing distance and response logic remain in use.

Pathfinding's A* and smoothing work can advance under a budget; synchronous `findPath` drives the same core to completion. Strategic route planning uses a queue capped at 128 jobs and a combined 1,024 work units per bot simulation tick, with duplicate-call protection and stale-origin cancellation. Static street routes use a bounded 0.5 m cell cache. Bots wait for complete candidate routes rather than continuing stale walks; reactive combat and defense still run, and Shinobi bandit jobs wait for pending routes.

The optimized balanced run measured startup (63 entities): sim mean 1.456 ms, total mean 3.178 ms, total p95 5.595 ms, max 20.940 ms; full rosters (116 entities, 116 standing): sim 8.117 ms, total 9.476 ms, p95 12.773 ms, p99 21.095 ms, max 66.276 ms; combat (109 entities, 85 standing): sim 3.314 ms, total 5.197 ms, p95 9.232 ms, p99 14.366 ms, max 19.694 ms. The full-roster baseline was 13.549 ms sim / 14.839 ms total mean; combat baseline max total was 94.679 ms. One 66 ms Node outlier remains.

These before/after runs are indicative rather than directly comparable: populations and AI outcomes differ (notably 114 standing units in baseline combat versus 85 afterward), and hardware/JIT variation applies. They do not prove browser FPS, exact end-to-end parity, or that all reported lag is gone. The separate collision parity test covers 100 seeded 80-body cases, including dense overlap, blocked movement and cross-cell chain pushes. `test_separation_performance`, `test_bot`, `test_ninja_bot`, `test_map_performance`, Rally/assignment checks and changed-JS syntax/diff checks passed per coordinator. Adaptive AI's nine openings, live three-clan match and decision scenarios passed; the bounded-planning tuning scenarios also passed in a scoped run. Two obsolete night-only Mark timing cases were removed from that tuning file because they contradicted the established all-day contract behavior. `test_contract_anytime` and `test_contract_pacing` provide the canonical coverage and passed.

## Worker isolation (2026-10-31)

The authoritative match and bots now run in one permanent module Worker. The main thread builds a read-only `createGame`/`setupMatch` replica for existing UI queries and static geometry; it never steps the sim or runs bots. There is no private RNG or path-planner handoff when opening the map.

The Worker publishes world deltas at 20 Hz. Map updates are capped at 4 Hz and include only own-crew detail, visible markers, selected visible details, own deployment/contracts, and public scores, businesses and timers. Map snapshots omit world VFX and rival deployments. Signature-based diff records carry changes; fog uses a compact sparse-or-full typed buffer that can be transferred. A single in-flight map update with acknowledgements applies backpressure. Commands are ordered and applied once; movement keeps only the latest input and expires after 250 ms. Pausing does not advance or catch up the simulation. World painting resumes after a fresh world snapshot, and a failure banner reports a stopped simulation.

The Node worker test exercises the actual Worker entry and client, including pause/resume, command aliases, query parity, visibility projection, backpressure and once-only commands. The coordinator reports `test_sim_worker`, `test_map_performance`, `test_match_setup`, `test_door_interaction`, changed-JS syntax and diff checks passing. The door-interaction helper/fix is included as a bootstrap dependency for this checkpoint; remaining recruitment and rear-entry work stays in follow-up phase 2 of [the playtest plan](playtest_followup_plan.md).

In the synthetic 121-entity protocol microbenchmark, world encode/clone/apply took 0.374/0.453/0.121 ms at 24.5 KiB; map encode/clone/apply took 0.709/0.098/0.024 ms at 5.5 KiB. These numbers measure protocol work only, not rendering, browser UI, or FPS. Runtime diagnostics are available at `window.infamy.mapPerformance` for worker encode/sim/max/apply timings, packet counts and grid bytes.

## Remaining diagnosis

During the final playtest, compare map/input responsiveness while paused versus running, exercise normal movement and bot contracts, and capture a Firefox performance profile if the lag is present. The Node harness excludes browser events, DOM/layout, paint, GPU and frame presentation. Manual browser checks remain pending. Workers cannot directly access the DOM and require message-based data transfer.

Reference guidance: [MDN collision performance](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection#collision_performance) recommends broad- and narrow-phase collision checks instead of testing every entity pair; [web.dev long-task guidance](https://web.dev/articles/optimize-long-tasks) describes how long main-thread tasks delay input; [MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) documents worker isolation and message passing; and [Firefox performance best practices](https://firefox-source-docs.mozilla.org/performance/bestpractices.html) recommends profiling and measuring before and after changes.
