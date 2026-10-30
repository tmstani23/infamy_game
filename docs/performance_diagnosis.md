# Map performance diagnosis (2026-10-30)

**Status (2026-10-30):** Targeted collision and AI route-planning optimizations are implemented and Node-checked. The browser cause of the reported lag remains unverified; no Worker is implemented.

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

These before/after runs are indicative rather than directly comparable: populations and AI outcomes differ (notably 114 standing units in baseline combat versus 85 afterward), and hardware/JIT variation applies. They do not prove browser FPS, exact end-to-end parity, or that all reported lag is gone. The separate collision parity test covers 100 seeded 80-body cases, including dense overlap, blocked movement and cross-cell chain pushes. `test_separation_performance`, `test_bot`, `test_ninja_bot`, `test_map_performance`, Rally/assignment checks and changed-JS syntax/diff checks passed per coordinator. The adaptive AI opening and match scenarios passed; the legacy instant-decision run stopped at its old first-tick assertion, while the updated bounded-wait decision fixtures passed separately.

## Remaining diagnosis

During the final playtest, compare map/input responsiveness while paused versus running, exercise normal movement and bot contracts, and capture a Firefox performance profile if the lag is present. The Node harness excludes browser events, DOM/layout, paint, GPU and frame presentation. A Worker remains deferred until browser measurements show whether meaningful main-thread blocking remains after local optimization; Workers cannot directly access the DOM and require message-based data transfer.

Reference guidance: [MDN collision performance](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection#collision_performance) recommends broad- and narrow-phase collision checks instead of testing every entity pair; [web.dev long-task guidance](https://web.dev/articles/optimize-long-tasks) describes how long main-thread tasks delay input; [MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) documents worker isolation and message passing; and [Firefox performance best practices](https://firefox-source-docs.mozilla.org/performance/bestpractices.html) recommends profiling and measuring before and after changes.
