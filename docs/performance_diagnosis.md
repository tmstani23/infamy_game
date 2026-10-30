# Map performance diagnosis (2026-10-30)

**Status:** Node profiling identifies simulation CPU hotspots. This is not a browser performance diagnosis; no runtime optimization or Worker has been shipped.

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

An isolated experiment against a temporary copy cached each unit's radius once per separation pass. In that single balanced run, mean simulation time fell from 13.549 to 10.270 ms (about 24%), and total mean from 14.839 to 11.699 ms. The experiment is not in production code, does not establish behavior parity, and still had spikes (maximum total 60.285 ms). Treat it as evidence for a candidate optimization, not a final benchmark.

The results show simulation CPU cost grows substantially with roster size and identify a concrete hotspot. They do **not** establish that simulation is the cause of Tim's reported map lag: the benchmark has no browser rendering and is not a late-match save. Compare responsiveness while paused and collect a Firefox performance profile when the lag occurs.

## Next steps (proposals; no implementation authorized by this diagnosis)

1. Measure per-pass radius caching and squared-distance checks with focused behavior/parity checks.
2. If pairwise separation remains costly, evaluate a deterministic spatial broad phase that limits candidate pairs.
3. Profile Shinobi route planning and consider bounding queued path work while preserving the 20 Hz simulation, visibility rules and decision results.
4. Recheck the browser main thread, paint and input response in Firefox during actual lag. Consider a Worker only if measurements show meaningful blocking remains after local fixes; a Worker cannot directly access the DOM and requires message-based data transfer.

Reference guidance: [MDN collision performance](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection#collision_performance) recommends broad- and narrow-phase collision checks instead of testing every entity pair; [web.dev long-task guidance](https://web.dev/articles/optimize-long-tasks) describes how long main-thread tasks delay input; [MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) documents worker isolation and message passing; and [Firefox performance best practices](https://firefox-source-docs.mozilla.org/performance/bestpractices.html) recommends profiling and measuring before and after changes.
