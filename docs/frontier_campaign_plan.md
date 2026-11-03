# Frontier campaign plan

**Design record (2026-10-31): documentation approved; implementation is not approved or built.**

This page owns the proposed capital, frontier, settlement, supply and larger RTS campaign.
It describes the intended game after the current city match, not current gameplay.
Current city rules and build status remain in the existing owner docs.

## Classic snapshot before frontier build (Tim, 2026-10-31)

Tim will manually copy the existing city game outside this project folder as a
preserved Classic snapshot before frontier implementation. Development then
continues in this current project. No copy or move is requested now.

## How to read decisions

- **Agreed direction** means a design constraint Tim has settled for planning.
- **Proposed starting point** means a small first implementation to evaluate, not an approved rule or number.
- **Open choice** needs a later design decision and, where relevant, a balance playtest.
- **Deferred** stays outside the first frontier build.
- All phases below are proposed sequencing. They authorize no code, asset or data changes.

## Campaign shape — agreed direction

- The current city becomes the first capital on a larger isometric island or continent.
- Regions contain territory, limited buildable settlement sites, resources, outposts and roads.
- The hero explores the map and can lead a small crew or join larger frontier battles.
- Expansion comes from founding or capturing settlements and connecting them.
- A region's main settlement controls the region in the initial design direction.
- Remaining enemy outposts become contested after that capture; they do not instantly flip into free assets.
- Rationale: those outposts remain meaningful follow-up objectives and give defenders time to respond.
- A disconnected capture remains a real possession with a logistics problem, not a magic connection.
- The current revised sketch has **24 full land regions plus 12 coastal partial regions**. Region count and dimensions remain provisional map targets, not capacity guarantees.
- Start with curated capital and region structure so travel, defenses and resources can be balanced.
- Add procedural variation later if the curated version is good; make it optional.
- More capitals and railroads are later possibilities, not first-slice requirements.

## World map scale and visual reference (revised sketch, 2026-11-01)

The current island draft is approximately **14,000 × 8,000 world units** (the first rough draft was about 14,000 × 7,000), with **24 full land regions plus 12 coastal partial regions**. The east-coast capital sits on the right-hand side of the water. Regions in the revised sketch are nominally about **1,750 × 1,400 units**. These are provisional measurements to validate in play, not streaming, population or capacity guarantees.

The winding main route is about **18,000 units**: roughly **50 minutes at the current base hero run speed of 6**, compared with a 1.7 walk speed. A developed settlement is about **400–700 units** across, or 1–2 minutes to cross; neighboring settlements have a rough 4–8 minute travel goal. Mounts and trains are later options to change actual travel time; instant travel is not the default.

Terrain transitions across coastal plains, fertile central/eastern farmland, central mountain passes, western rain-shadow desert, northern snow and southern rainforest/bamboo. Preserve alternate corridors so one chokepoint cannot seal the island. The atlas is an illustrative old-Japan fantasy-book direction: sumi-e/watercolor land and gold detail against an indigo sea. The concept image is a style reference, not a 1:1 map overlay.

**Island art checkpoint (2026-11-02):** W3.8's 25 requested source images are in `assets/environment/island/`; see the [prompt and asset list](../assets/image_prompts.md#island-art-w38-frontier). W3.9 imports and places cliff pieces deterministically from the approved blueprint-derived 50-unit mountain cells; blockers remain the terrain cells. The art review tour and its staged review props have been removed pending a later location pass. Since the first walkthrough, 21 follow-up art assets were generated and accepted: eight numeric lake-bank pieces, four opposite-bank rims, and nine high-ground B/C/D variants. They are saved beside the original world art. Their actual dimensions and orientation inventory are in the [walkthrough follow-up prompts](../assets/image_prompts.md#walkthrough-follow-up-art-prompts-2026-11-02); they still need mapping, resizing if integration requires it, and code integration. No new dry terrain/mountain layout has been approved; do not treat the old staged samples as mapped placements. The earlier `mountain_forest_broad.png` concept is obsolete and preserved.

**Island visual notes from first walkthrough (2026-11-02):**
- [x] Gate orientation selected; the road connects through the gate and blends into the grass in Tim’s screenshot.
- [x] City gate entry/return works well in Tim’s playtest; the hero can use the gate from the outside zone.
- [x] The black triangular area at the lower-right is the world edge, and the gate connection into the world works.
- [x] Forest cliff pieces approved; snow high-ground textures approved.
- [x] Dry individual art approved at the review scale, but the staged samples were scattered and in the wrong terrain. Map a connected dry range only after the dry terrain/blueprint layout is decided; include straight A/B pieces, mirrors, inner/outer corners, rims, tops, and travel stops.
- [x] Dry outcrop art approved at roughly one tree tall; moss and snow outcrops approved.
- [x] Pass-gate art approved; tour marker T27 was in a field rather than a real pass. Fit and scale it at an actual mountain pass; avoid orphaned props.
- [x] Outer forest/snow corners approved. Forest/snow inner corners protrude, but are acceptable for now; later calibrate them with a shared measured projection anchor/shear and blend edge snow, rock, and vegetation.
- [x] Dry rims approved as art, but the staged samples were disconnected and outside intended terrain. Four forest/snow opposite-bank rims were generated and accepted; mirrored companions are separately generated reverse orientations, not pixel flips.
- [x] Ford art approved; later shrink it by 1–2 tiles to fit thin river crossings.
- [x] Dry high-ground texture approved, but shrink it to one tile as part of a larger mosaic. Forest/snow high-ground textures approved; B/C/D variants for all three biomes have now been generated and accepted.
- [x] Ground textures show long repeated lines/obvious tiling; blend the existing 16 forest texture types and the new B/C/D high-ground variants into a natural mosaic. The island still uses mostly city ground textures, and `islandBiome` currently treats regions other than snow/dry as forest for mountain art. (done in W3.10, 2026-11-03)
- [x] Map biome-specific ground appearance across whole terrain regions and blend biome transitions. Snow-code (`n`) cells currently use placeholder sand/gravel weights; `top_snow` is only applied to mountain (`m`) cells, so it does not cover snowy lowlands. `ground_snow.png` has appeared but is unverified; `ground_snow_thaw.png` is pending sequential generation. Verify both outputs before treating the art as complete, then integrate them across snow cells with thaw blending. Review corresponding dry and other regional terrain coverage as part of this pass. (done in W3.10, 2026-11-03)
- [x] Eight narrow lake-bank segments were generated and accepted with numeric filenames to avoid compass-name confusion. Order is N, NE, E, SE, S, SW, W, NW. The source prompts requested 1024 × 1024; saved files are 1254 × 1254. `lake_edge_1.png` is the approved north v3. The original lake image and specified drafts are retained; one obsolete draft was moved to `to_delete/` at Tim’s request.
- [x] Replace the old oversized repeated painted-water lake-edge decals with the accepted narrow bank segments; let the renderer supply water and align bank art/collision to the mapped shore. (done in W3.10, 2026-11-03)
- [x] Import and place the four accepted opposite-bank rim orientations on mapped forest/snow ranges; verify high-ground sides face inward. (done in W3.10, 2026-11-03)
- [x] Resize the accepted ford art by 1–2 tiles and fit it at actual thin river crossings. Fit pass gates to valid terrain crossings, not stale metadata locations. (done in W3.10, 2026-11-03)
- [ ] Map a connected dry range only after the blueprint/terrain decision adds mountain cells in a dry region; map all straight, mirrored, corner, rim, top, outcrop, and travel pieces together.
- [ ] Review mountain art contact, alignment, scale, and movement in the actual mapped terrain across biomes, corners, mirrored edges, passes, fords, lakes, and both gate directions.

The art plan’s inner-corner wording also matched straight south edges. Implementation and regression coverage use actual concave topology: south and east neighbors are mountain, while the southeast diagonal is free. The prompt list records generation; [art direction](art_direction.md#buildings-and-props-settled) links the reusable importer/fitting process.

References: **approved blueprint v2 (Tim, 2026-11-02): [overview](images/frontier/blueprint/v2_overview.png), [data](images/frontier/blueprint/world_blueprint_v2.json)**; superseded: [measured island sketch](images/frontier/measured-island.html), [island atlas](images/frontier/island-atlas.html); and concept image below.

![Illustrative frontier island concept, not a 1:1 map overlay](images/frontier/frontier-island-concept.png)

## Shared systems before clan specialties — agreed direction

- Every clan can build a complete economy and fight a complete war.
- All clans can use trade, finance, intelligence, infiltration and defensive fortification.
- All clans can garrison, replace losses, reinforce, scout, move supplies and settle territory.
- No essential economy or war function is locked behind a clan choice.
- Rationale: choosing a clan should not remove a whole way to grow or fight.
- Existing units, hero abilities, tempo and presentation provide initial clan identity.
- Balance those shared mechanics before deciding whether any specialist building is useful.
- The earlier exclusive Yakuza tradehouse, Kuroda military HQ and Shinobi intelligence house idea was corrected; it is not the baseline.
- Specialist structures and unique frontier mechanics are deferred design options.
- Player and bot clans use the same underlying rules and costs.

## Capital and frontier relationship — agreed direction

- The capital keeps its primary role as a place for hero and small-crew combat.
- Its businesses, politics, police, contracts, stealth and local rivalries still matter.
- The frontier supplies goods, raw materials and manufactured products to city trade and influence.
- The capital supplies money, specialist recruits, imports and finance for frontier expansion.
- The exact market, currency conversion and bonus rules are open.
- Basic necessities can be sustained locally in a frontier settlement.
- A blockade first slows imports, advanced recruitment, major construction and resupply.
- It does not automatically stop existing defenses or collapse a settlement.
- Capital income and frontier production must have visible source and destination records.
- No extra productivity is granted merely because the player opens a view.

## Capital authority and campaign persistence

**Agreed direction (2026-10-31):**

- Start with multiple clans and a neutral civic authority in the capital.
- A city lieutenant handles the player's routine interests while the hero is away.
- Neutral civic AI continues city services and rules without pretending to be a player clan.
- Routine defense, recruitment, repair and income continue under budgets and standing orders.
- Offensive action uses an explicit stance, budget or authorization.
- A clan may lose its HQ or district foothold yet retain frontier territory and return later.
- A single HQ raid cannot automatically award the entire capital.
- Do not force the current three clans to remain the only campaign factions forever.

**Open choices:**

- Set conditions for expulsion, return, capital control, elimination and campaign victory.
- Decide how today's ten-cycle match and season score translate into a persistent campaign.
- Decide whether an absent player leaves standing policies, an AI lieutenant, or both in multiplayer.
- First build save/resume campaigns; true continuous MMO and offline-authority rules are deferred.

## Governors in every settlement — agreed direction

- Every settlement has a governor process that keeps operating while the hero is elsewhere.
- Player and bot governors use the same economy, construction and staffing rules.
- Governors track food, housing, workforce, resources, trade and local stockpiles.
- They allocate work, repair buildings, recruit approved replacements and maintain garrisons.
- They carry out approved projects within a budget and report why a project waits.
- Player priorities may be Grow, Produce, Trade or Fortify; these are illustrative labels.
- Military stance and spending limits are distinct from civilian production priorities.
- Major war spending, large upgrades and rail projects require approval or an explicit standing policy.
- Ordinary replacement and defense can proceed under the player's chosen budget.
- Reports should show shortages, current action, next action and expected consequence.
- Good defaults make routine towns manageable without daily micromanagement.
- Governors arrange ordinary supply and trade; the player sets priorities instead of individual deliveries.
- Visiting the settlement gives the player more direct actions and control, not a production aura.
- The earlier passive five-percent presence bonus is discarded.

## Settlement building — agreed direction

- Aim for a SimCity and Settlers hybrid with fewer dependencies than a full city simulator.
- The player strategically places walls, fortifications, major roads, resource works and military facilities.
- The player reserves residential, commercial, workshop/industrial and military zones.
- Discover prepared flat build sites from the world map. Settlers physically clear each full buildable cell through overgrown → clearing/stumps → grading → prepared stakes → developed; progress and resources are accounted for, and terrain is revealed rather than arbitrarily deformed in the initial version.
- Zoning autofills reusable building prefabs. Players place roads, walls and gates manually. Buildings use one fixed facing.
- Construction visuals progress from foundation to frame to finished isometric art. Damage progresses through damaged and ruined states with a stable repair anchor; share scaffolding and construction parts.
- Population buildings and jobs fill those zones when access, people and materials permit.
- Workers harvest and transport routine resources automatically within the settlement rules.
- Roads, gates and reserved paths must remain usable by people, armies and caravans.
- Placement cannot trap a generated neighborhood behind walls or impassable buildings.
- Growth may stall or decline gracefully; the report explains the limiting factor.
- One short shortage does not instantly downgrade a castle or delete established homes.
- A proposed starter set is food, timber, stone, manufactured goods and ryo.
- Well or river access is a proposed initial water model.
- Power, complex industry chains and exact consumption/production numbers are later decisions.

## Fortified settlement center — agreed direction

- The center is a stockade, then fortified compound/garrison, fort, and castle/citadel/keep.
- Those names are a progression outline; exact names and tiers are open.
- Upgrades reflect actual population, housing, roads, food, water, storage, economy and trade.
- The center also needs materials and a build project, not only a score threshold.
- An unlocked tier waits for player authorization or a standing governor construction policy.
- The fort supports further development, garrison capacity and defense.
- The center is the control/capture objective; its structure need not be destroyed.
- An unfinished upgrade remains an unfinished project through a visit or save/load.
- Capture does not silently award a completed tier or free missing materials.
- Exact thresholds, build times, upkeep and downgrade rules are open.

## Frontier armies and the hero — agreed direction

- Frontier fights use larger RTS groups than capital street fights.
- The hero keeps current stats and the familiar hero group as the balancing baseline.
- Do not add an automatic frontier-only hero nerf.
- Balance frontier troops, fortifications and encounters around the existing hero baseline.
- The player can build, recruit, order, attack and defend after the hero is knocked out.
- Hero knockout is not an automatic battle loss or loss of all player control.
- A clinic or equivalent recovery facility is a proposed frontier recovery route.
- Recovery delay, cost and fallback when that facility is captured remain open.
- No instant resupply or free revival is inferred from current raid behavior.
- Do not import current hero-KO raid victory rules into frontier warfare.
- No battlefield body looting or inventory micromanagement for RTS armies.
- Hero equipment uses the same authoritative stat evaluation in the capital and frontier.
- Standard crew use unit-type equipment; they have no individual bags.
- Initial settlement zoom sits farther out for an RTS view. Reuse the existing packed character sprites at first; do not convert characters to 3D for this transition.

## Hero equipment, exploration and rewards — agreed direction (2026-10-31)

- Start with three hero equipment slots: weapon, armor and one accessory.
- The capital now has 12 carried slots, a separate 12-slot HQ stash and three equipment slots (Tim, 2026-11-01). Frontier item implementation remains unbuilt; see the [capital inventory status](gameplay_and_design.md#inventory-and-loot-settled).
- The earlier [capital inventory and loot outline](gameplay_and_design.md#inventory-and-loot-settled) owns the existing stash, fence and carrying concept. This plan records how hero gear fits the campaign.
- Capital encounters and raid caches can award meaningful gear.
- Later frontier hero exploration can reveal ruins, caches, outposts and gear discoveries.
- The hero can explore and collect rewards on the frontier; the restriction is on RTS battlefield bag management, not on geography.
- Army battles do not require clicking bodies, sorting bags or assigning loot to individual soldiers.
- Existing crew looting behavior may retrieve eligible items to the shared stash under later item rules.
- A weapon or armor modifier works identically wherever the hero fights, through the existing authoritative stat evaluator.
- Initial equipment remains compatible with the hero's current kit; no new ability system is implied.
- Balance frontier troops around that hero baseline with equipped variants, without equipment that invalidates armies.
- Hero knockout does not destroy or drop equipped gear in the initial version.
- Use a few meaningful items and choices rather than frequent low-value drops.
- Primarily offer sidegrades; slight power increases and bounded item synergies are allowed.
- No mandatory rare best-in-slot item or runaway multiplicative stacking.
- Avoid initial durability, inventory Tetris and a huge random-affix pool.
- Capital craftsmen, merchants and fences using frontier materials are later possibilities, not built features.
- Rationale: gear makes capital combat and exploration interesting while larger battles still need armies.

### Bandit rewards and anti-farming boundary

- Bandits may occasionally yield useful modest hero gear, not only ryo.
- The best looted gear comes from meaningful accomplishments, such as a major encounter, raid cache or exploration discovery.
- Bandit gear is not required for progression, and repeat bandit grinding should not be the optimal or necessary path.
- Equivalent basic choices should be available by other routes.
- Do not create a guaranteed item per kill, a repeatable salvage-currency farm, kill-count grind or hidden pity chore.
- **Proposed mechanism, not approved:** tie some bandit gear to a first meaningful camp clear or exploration reward with a persistent claim record and seed; respawns and reloads would not reroll high-end items.
- That mechanism, drop frequency and any repeatable reward remain open design decisions.
- No promise is made that every repeatable drop has absolutely zero incentive.

## Army origin and capability — agreed direction

- An army has a persistent supply origin at a named settlement or network.
- Actual facilities, stockpiles and technology at that origin determine recruitment and equipment access.
- An army does not change its capabilities when crossing a nearest-settlement boundary.
- Capturing an advanced settlement does not auto-upgrade existing troops.
- Loss of a supply route does not instantly downgrade equipped units.
- Resupply, origin reassignment, field depots and transit behavior remain open choices.
- Unit, army and cargo identities survive movement, battle, save/load and view changes.

## Supply and roads — agreed first-scope direction (2026-10-31)

- Logistics supports settlement building and territorial RTS war; it is not a separate micromanagement game.
- Roads connect settlements, and governors automatically handle routine supplies and trade.
- The player sets settlement and military priorities, not individual cargo loads, caravan schedules or deliveries.
- Founding or capturing towns and outposts remains the main expansion objective.
- The first slice needs roads, automatic real shipments and interruption by enemy road occupation.
- Shipments have an actual source, finite cargo, travel progress and delivery receipt.
- Withdraw stock at departure and credit it only on delivery; a blocked shipment is never also delivered.
- Shipments and units keep stable IDs through travel, battle, save/load and view changes.
- Route blockage never teleports cargo or creates free goods.
- Show simple connection states: **Working**, **Threatened**, **Blocked**.
- Give an early warning with blocked location, affected activities and a response action.
- A governor may wait or choose a valid route when a road changes; exact routing policy remains open.
- Basic logistics and the same finite economy apply to all clans, including bots.
- Rationale: roads matter strategically without turning travel into routine chores.

### Traffic, intelligence and interception

- Use a strategic map to scout and move forces, with optional isometric zoom.
- Discovered geography remains known; enemy traffic requires fresh sight.
- Show a last observed position and direction after sight is lost, not a live omniscient route.
- Road interception is optional, not required to expand or operate a first-slice town.
- When hostile units physically contact a shipment or convoy, the world causes an encounter.
- The encounter continues under the same combat rules while offscreen; a button does not resolve it.
- Named custom routes, escort micro, detailed caravan hunting and scheduled theft are later options.
- Do not require repeated travel chores to keep ordinary settlements functioning.
- Captured cargo uses army or settlement logistics, never hero RTS body looting.
- Exact captured-cargo transport, loot share and escort rules remain open.

### Forgiving shortages and isolation — agreed behavior

- Established towns can provide local food and basic water and hold emergency reserves.
- Blocking the only road to a distant town or small army does not by itself doom the town.
- Imported materials, advanced recruitment, major construction and resupply slow first.
- Garrison troops fight, towers function and equipped units keep their gear while isolated.
- No automatic surrender or ownership loss follows from an isolation timer; an enemy must assault.
- A growing new site without established food cannot receive infinite free necessities.
- That site pauses growth and nonessential projects and draws on real reserves or local emergency production.
- Exact reserve quantities, production rates and supply penalties remain open.
- Initial version has no starvation-driven population loss.
- Do not infer blanket army upkeep attrition, loss of defensive ammunition or shutdown of essential services.
- A siege is dangerous because enemy forces attack and wear defenses down, not because a roadblock counts down to death.
- Rationale: shortage remains meaningful without a remote punishment or an automatic failure spiral.

## Garrison buildings — agreed direction

- Both attacker and defender may occupy suitable buildings.
- Start with a few clearly marked types: home, inn, warehouse and barracks candidates.
- The building shows faction, troop count, capacity and rest/fight state.
- Occupation is separate from civilian property ownership.
- Ranged troops may fire in any direction with line of sight and appropriate cover.
- Directional window-fire limits were rejected.
- Melee defenders protect entrances but gain no free projectile attack.
- Capacity and cover are real, and no ordinary house should automatically beat a tower.
- Secure, out-of-combat rest may recover troops; an occupied building under attack does not heal them.
- Infantry breach, demolition and siege tools provide counterplay to an occupied building.
- Occupants may evacuate before collapse; staying risks casualties.
- Exact collapse, spill and casualty formulas remain open.
- Civilians shelter automatically under the first version's simple rules.
- A siege need not clear every home before a stronghold can be captured.
- After combat, repair and security permit civilian reuse.
- A fully featured interior RTS is not required for the first frontier slice.

## Conquest sequence — agreed direction

- A stronghold attack has several stages so defenders have time to mobilize.
- First, secure or contest the outer approach and intercept local response.
- Next, breach or neutralize walls, gates, towers and other direct defenses.
- Then reduce, capture or isolate military and supply support.
- Finally, sustain an assault or control contest at the fortified center.
- A stealth unit or fast runner cannot skip directly to the center and end the battle.
- A healthy supporting city strengthens the center through finite real reserve troops, recruitment and resources.
- Capturing intact support is a viable alternative to razing civilian homes.
- Defender governors gather and reinforce from actual available units and stockpiles.
- Reinforcements obey travel time and route access; none appear from thin air.
- The battle must still finish if one hidden straggler cannot realistically contest control.
- Exact stage gates, control duration, minimum force and contested-region conditions are open.
- Existing raid timers and hero-KO win conditions are not copied by default.

## Destruction, occupation and aftermath

**Agreed direction:**

- Buildings have physical footprints and allow street combat around them.
- Forts, gates and towers can take direct structural damage.
- Military facilities can be disabled and later repaired or captured.
- Homes and workshops start with simple intact, damaged and ruined states.
- Capture, repair, occupation, garrison and restored stability produce a usable outpost.
- Its supply foothold only works when a real route exists.
- Repeated capture cannot mint free troops, stock or rebuild materials.
- A newly captured settlement may still be unsafe or isolated.

**Design options, not settled:**

- Sack and withdraw may trade immediate resources for control and stability.
- Raze may be a slow, interruptible operation rather than instant deletion.
- Decide ownership, damage, salvage and civilian consequences of each choice.
- Refugee flows are only a possible later feature and are deferred.

## Simulation and view independence — agreed constraints

1. One world state owns all settlements, governors, armies, shipments and battles.
2. Peaceful economies can be records rather than fully animated individual citizens.
3. Those records include population, workforce, zones, buildings, projects and stocks.
4. They also include production, priorities, trade, recruitment, garrisons and damage.
5. Visible citizens represent activity; looking at a settlement never changes its output.
6. Economically meaningful shipments retain real cargo, travel progress and interruption; detailed convoy actors may come later.
7. Ordinary resident foot traffic need not be a persistent individual world simulation.
8. Unviewed peaceful settlements run the same data, economy, governor and event rules.
9. Only actors and detailed activity needed in real time stay active there.
10. All settlements use equal time and rules: no hidden productivity bonus, catch-up cheat or reset on visit.
11. Propose a shared fixed economic cadence with event deadlines and work spread across ticks; exact architecture needs profiling.
12. Active battles everywhere use actual movement, attacks, abilities, collision, damage and retreat.
13. An unviewed battle has optional graphics, not an alternate single-roll or Civ-style autoresolve.
    Rationale: camera position must not decide a battle's outcome.
14. Opening a battle view adds visuals and direct control without changing the resolution mode.
15. Ordinary combat randomness, including crits and dodges, remains part of those rules.
16. Seeded random streams, save continuity and observer-independent orders are engineering guardrails.
17. Do not promise bitwise parity until repeatable tests demonstrate it.
18. Physical hostile contact activates detailed combat before any convoy could pass through unharmed.
19. Canonical unit and cargo IDs prevent double counting between aggregate and physical representations.
20. Saving includes in-flight cargo, paused operations, orders, timers and battle state.
21. Rendering has no authority over movement, economy, cargo or combat.
22. The existing Worker helps UI responsiveness but is not proof of continent-scale performance.
23. Benchmark settlement economy and simultaneous battles separately.
24. Bound work queues and snapshots; load static map chunks as needed.
25. Set world-unit counts and latency targets only after measurement.

Initial performance target for a first visible battle is **100–200 combatants plus 20–40 visible workers**, not a proven hardware or capacity limit. Stream terrain and navigation chunks. Keep routine offscreen settlement activity in economic records, but simulate every active battle with real combat rules regardless of camera. Profile settlement economy, visible fights and multiple simultaneous active battles separately before increasing scope.

## Technical blueprint — proposed, not built (2026-10-31)

This is an implementation design to evaluate before frontier code is approved.
The [current architecture](architecture.md), [technical plan](tech_plan.md) and
[measured performance diagnosis](performance_diagnosis.md) describe today's game.
Some older main-loop prose in those docs predates the existing
sim_worker.js/runtime/client/sim_snapshot.js checkpoint; its Node microbenchmarks
are protocol evidence, not a continent-scale capacity claim.

### Authority and boundaries

    Player input + governor policies + bot decisions
                 | shared, validated commands
                 v
       One authoritative world simulation
                 | canonical records and receipts
                 v
       Bounded, interest-filtered revisioned snapshots
                 |                 |
                 v                 v
        Strategic map       Tactical view and UI

- One world state decides ownership, economy, combat, cargo, rewards and hero items.
- Player, governor and bot actions use the same validated command path.
- Validate owner, resources, placement and current version before an atomic state change.
- Return an accepted/rejected receipt with sequence and new revision so UI can explain the result.
- Renderers read snapshots; they never invent production, combat hits or loot rights.
- Single-player starts with the existing permanent simulation Worker approach.
- Multiplayer later runs the authoritative sim on a Node server with the same commands and rules.
- Clients may present pending input, but do not run independent predicted rule copies.
- Extra workers, partitions or sharding require profiling; do not create one Worker per town by default.

| Proposed logical owner | Records and boundary |
|---|---|
| World registry | Stable IDs, ownership, region-local coordinates and global road nodes. |
| Region catalog | Static terrain, sites, geometry and resource placements. |
| Settlement economy | Population, workforce, stocks, production and consumption ledgers. |
| Governor | Priorities, budgets, authorized projects, defense and readable action reasons. |
| Construction | Zones, footprints, upgrade projects, structural damage and garrison occupancy. |
| Logistics | Road graph, connection states, shipment schedule and cargo conservation ledger. |
| Armies | Supply origin, equipment access, orders, route and unit membership. |
| Active combat | Shared movement, abilities, collision, damage, retreat and siege stages. |
| Hero items | Unique item ownership and one authoritative stat evaluator in city and frontier. |
| Visibility | Discovered geography, current sight and last-observed enemy traffic. |
| Presentation | Interest-filtered snapshots, revisions, deltas, receipts and resync. |
| Persistence | Versioned checkpoint and replay-safe command/event identity. |

These are module responsibilities and interfaces, not promised file names or an approved refactor.

### One clock, distinct work rates

- Keep one authoritative world clock so viewing a place never advances it differently.
- Existing 20 Hz combat is a starting reference, not a promised continent-wide tick budget.
- Propose a coarser globally equal economy cadence, scheduled arrivals and project deadlines.
- Governors act on events and bounded reviews instead of scanning every building every combat tick.
- Unviewed peaceful settlements keep economic records without simulating every footstep.
- Visible walking citizens represent the record; they cannot create extra workers or resources.
- Opening a view does not replay a mass of missed ticks or reset a town.
- Commit food, work, cargo withdrawal, delivery and project costs once in the ledger.
- Aggregate harvesting preserves real resource availability, depletion and input costs.
- Meaningful hauling distance and route cost apply equally in viewed and unviewed towns.
- A formula or scheduled job deadline may represent hauling; the exact model remains open.
- Conservation checks compare sources, sinks, stock and in-flight cargo across save/load.
- Local essentials use finite emergency production/reserves under the agreed shortage rules.
- Exact cadence, work budgets and settlement capacity need profiling and later approval.

### Active battles and shipment contact

- Simulation activity is independent of render visibility.
- Every active battle uses the same actual combat, including offscreen movement and building damage.
- Use world positions and spatial queries to activate detailed actors before hostile physical contact.
- Do not wait for a camera view to wake a threatened army or shipment.
- A shipment keeps one ID, cargo amount, owner, travel progress and schedule across representations.
- Road occupation can stop automatic shipments in the first slice.
- Later physical interception creates an encounter from contact, not a button or alternate combat roll.
- Switching to tactical view adds graphics and control, never a new outcome rule or tick rate.
- Unit, building, garrison and cargo identities remain stable through the switch.

### Region streaming and transitions

- Keep lightweight canonical records for the whole world; load nearby visible render chunks.
- Prefetch neighboring geometry, navigation and assets for a camera destination.
- Prepare a view asynchronously, then activate it at a simulation tick boundary.
- A loading preview may appear while the world continues; asset loading cannot pause battles.
- Do not instantiate a full continent mesh or recreate the game on every view change.
- Unload distant graphics with bounded caches; reuse atlases, instances and pooled cosmetics.
- Unloading graphics cannot discard a required battle, road, cargo or navigation record.
- Preserve selection, orders, garrisons, fort damage and item identity when returning.
- Exact chunk size, prefetch distance and cache limits remain open.

### Navigation, placement and bounded queues

- Use a regional road graph for long travel and local navigation for tactical movement.
- Apply spatial broad-phase checks to nearby combat bodies, not all world pairs.
- Cache stable terrain; version roads, buildings and gates so affected routes invalidate.
- Validate footprints, street links and gate access before accepting construction.
- Replan affected agents after a road edit rather than every agent in every region.
- Reuse bounded incremental path work and deterministic ordering from current performance work.
- Bound governor, building-generation, path, snapshot and cosmetic queues with fairness across regions.
- Measure queue age so one busy siege cannot starve another region.
- Defer nonurgent work under load, but never drop combat or economic events to protect FPS.

### Client payload and input response

- A strategic snapshot contains permitted settlement summaries, connection states, alerts and visible markers.
- It also includes selected details and last-observed traffic, not a live hidden enemy route.
- Do not ship every civilian, rival deployment, path planner, private RNG state or whole town record.
- Use versioned deltas, acknowledgments and backpressure; coalesce latest positions where safe.
- Commands and critical receipts remain ordered and exactly once despite coalesced presentation.
- Reject stale or out-of-order packets and wrong region generations, then request resync.
- Keep selection feedback immediate from the latest valid snapshot and pending command receipt.
- Interpolate movement and update stable UI lists instead of rebuilding the whole DOM each tick.
- Do not paint the full world behind the strategic map.
- Existing 4 Hz map/20 Hz world publication are current checkpoint examples, not future budgets.
- Avoid a second heavy mutable world sim on the main thread; query views need versioned read-only data.

### Memory, assets and lifecycle

- Bound region, GPU, portrait, navigation, snapshot and event-queue caches.
- Dispose view-owned render resources, listeners, background workers and timers when that view ends.
- The authoritative simulation Worker stays alive across map, capital, frontier and camera changes; terminate it only at match or session shutdown.
- Repeated city/map/frontier opening should leave memory and GPU object counts stable.
- Batch asset loads; update construction visuals incrementally instead of rebuilding a town.
- Keep texture decoding, GPU uploads and full-world serialization out of input handlers and animation frames.
- A render transition cannot duplicate a sim, leak subscriptions or move a unit twice.

### Save, resume and multiplayer

- Version records for regions, buildings, armies, cargo, items, orders and reward claims.
- Save world tick, seeded random state, governor policies, projects, damage and garrison occupancy.
- Include in-flight shipments, hero KO/recovery, combat state and paused operations.
- Propose a consistent tick-boundary checkpoint with bounded background encoding and recovery checks.
- Sequence queued commands so reloading cannot apply a purchase, arrival or reward twice.
- A reload must not reroll a loot claim, refund a recruit twice or duplicate cargo.
- Multiplayer needs server authority, permissions and an explicit global-clock/offline policy.
- One client's menus cannot freeze a live shared world.
- Hero gear always uses the same stat resolver; item uniqueness is authoritative, not UI math.

### Measurement and overload gates

- Instrument combat, collision, path, AI, economy, construction, snapshot encode/apply and saves separately.
- Measure DOM/layout, draw/GPU, asset loading, memory and input-to-feedback latency in a real browser.
- Track p95/p99 frame time, long tasks, sim tick delay, queue age, packet bytes/cadence and cache counts.
- Use Node profiles for sim work and Firefox profiles for the actual UI; current synthetic packet timings are not FPS evidence.
- The intended benchmark scenario begins with one visible fight of 100–200 combatants and 20–40 visible workers; treat it as a test target only, then measure terrain/navigation streaming and additional offscreen/active battles.
- Set target budgets and hardware/session limits from measurement, not invented world-unit guarantees.
- Under load, reduce cosmetic density and presentation cadence first, then defer bounded nonurgent jobs.
- Keep world time, combat fidelity, cargo accounting and fair player/bot rules intact.
- Increase regions or simultaneous battles only after the previous slice meets its measured gates.
- No design can promise zero lag; this plan makes spikes observable and gives specific work to bound.

Reference approaches, not performance promises: [Epic World Partition](https://dev.epicgames.com/documentation/unreal-engine/world-partition-in-unreal-engine) documents streaming terrain/world cells; Factorio’s [bounded construction work and algorithm optimization (FFF #415)](https://www.factorio.com/blog/post/fff-415) and [terrain/biome distribution review (FFF #401)](https://www.factorio.com/blog/post/fff-401) illustrate incremental work and deliberate map-transition review.

### Proposed validation matrix when implementation is approved

| Load or transition | Required observation |
|---|---|
| Few, then many peaceful towns | Equal economy viewed/unviewed; governor queues and memory stay bounded. |
| Harvest at different route distances | Viewed and unviewed towns pay the same availability, depletion, input and travel costs. |
| One, then several offscreen battles | Same actual rules and outcomes for the same seed and orders. |
| Viewed battle beside offscreen battles | Sim tick lag and input response stay within measured targets. |
| Shipment crosses an encounter boundary | Contact activates combat; cargo has one owner and no duplicate delivery. |
| Heavy construction and road edits | Connectivity remains valid; replanning work stays bounded. |
| Hero KO and clinic capture | Player retains control; recovery follows the chosen facility policy. |
| Garrison capture or collapse | Occupants, title, damage and exits remain consistent. |
| Repeated world, capital and map transitions | Selection/order identity survives; memory and GPU counts do not climb. |
| Save/load during battle, arrival or upgrade | Continuous and resumed results conserve cargo, workforce, items and rewards. |

Build the capital plus one frontier town and one automatic connection first.
Add focused tests only when a phase is approved; existing regression checks remain.
Compare observed/unobserved outcomes and continuous/resumed runs with the same seed
and commands before expanding scale. Browser gameplay and profiling remain necessary.

## Edge cases to design before implementation

| Case | Agreed constraint or question |
|---|---|
| Hero KO during a siege | Player commands and the battle continue; recovery site, delay and cost are open. |
| Hero KO while equipped | Initial gear remains owned and equipped; no automatic loss or destruction. |
| Hero inventory is full | Decide pickup/stash handling without item loss, duplication or forced battlefield bag work. |
| Equipment changes during battle | Field swaps are allowed; command validation and stat refresh must use the authoritative evaluator. Exact timing is still open. |
| Recovery clinic captured | No automatic free revival; choose a fallback policy. |
| Simultaneous sieges | Both resolve by the same battle rules with finite available reinforcements. |
| One reserve ordered twice | A unit has one identity and location; orders cannot duplicate it. |
| Governor bankrupt | Explain blocked projects, preserve essentials where possible; debt/bailout rules open. |
| Missing food, timber or stone | Production and growth react visibly; short shortages do not instantly erase tiers. |
| New road is impassable | Construction and route planning must identify the blocked connection. |
| Road or gate changes mid-route | Shipment and army reroute or wait; cargo never teleports. |
| Ownership changes with cargo en route | Cargo owner, delivery rights and interception result require policy. |
| Occupied building changes owner | Garrison occupation and civilian title remain separate state. |
| Blocked spawn or evacuation exit | Find a legal alternate or wait; never spawn through solid geometry. |
| Trade is interrupted | Source withdrawal stays accounted for; destination receives only delivered cargo. |
| Only road to an established town is blocked | Warn early; local food, water, reserves, garrisons and towers continue. Imports and expansion slow first. |
| New site lacks food during a blockade | Pause growth and nonessential projects; use finite reserves or local emergency production. Exact rates are open. |
| Army supply route is cut | Equipped troops retain gear and can fight. Resupply policy is open; no blanket attrition is assumed. |
| Enemy traffic leaves sight | Keep discovered geography, but show only last observed traffic position and direction. |
| Hero changes between capital and frontier | Apply the same equipment modifiers through one stat evaluator; no mode-specific gear reset. |
| Crew finds an eligible item | A later item rule can send it to the shared stash without opening a crew bag. |
| Bandit camp respawns or save reloads | Reward identity must prevent reroll farming; first-clear claim records are proposed, not settled. |
| Multiple players claim one cache | Loot rights, sharing and persistence need a separate multiplayer rule. |
| Item moves between hero and stash | One stable owner/ID through transfer, KO and save/load; never duplicate it. |
| Upgrade unfinished at capture | Project, stock and authorization persist; new owner chooses whether to resume. |
| Repeated capture or raze | Prevent resource, reward and recruitment loops. |
| Disconnected territory | Control may persist, but supply and reinforcement use actual routes. |
| One hidden defender | Cannot hold an entire region hostage without meaningful contest. |
| Single-player pause | Exact policy is open; if paused, all world clocks pause together without view-based catch-up. |
| Multiplayer pause or offline player | Global clock and delegation authority need explicit policy. |

## Proposed implementation sequence — not code authorization

### 1. World foundation and save identities

- Define canonical world/settlement/unit/cargo IDs, time, ownership and event records.
- Establish economy cadence, active battle scheduling, save/load and deterministic test hooks.
- Acceptance: leave/revisit a settlement without changing its economic result.

### 2. Capital plus one frontier settlement

- Keep the existing city playable and add one curated frontier settlement and one working connection.
- Let hero travel, governor operate and cargo move across that connection.
- Acceptance: save/resume with the hero away, a project running and cargo in flight.

### 3. Autonomous settlement growth

- Add the starter resources, placement rules, zones, housing, jobs, production and reports.
- Add governor priorities and routine replacement/repair within a budget.
- Acceptance: view/unview economy parity, readable shortage feedback and no inaccessible generated town.

### 4. Road connections and automatic shipments

- Add connected roads, governor-managed real shipments, finite stock withdrawal/delivery and enemy-occupation interruption.
- Show Working/Threatened/Blocked with blocked location, affected activities and a response action.
- Acceptance: cargo conservation through delivery, blockage and save/load; an isolated established town still feeds itself and defends with existing gear.
- Detailed escorts, route hunting, scheduled theft and captured-cargo transport are later optional work.

### 5. Shared frontier RTS

- Add basic troops, army origin/supply base, real offscreen combat and continued control after hero KO.
- Propose a clinic recovery facility with a tested captured-clinic fallback.
- Acceptance: identical player/bot rules and no outcome change solely from opening a view.

### 5a. Hero equipment and exploration rewards

- Build on the capital inventory/stash concept with hero-only weapon, armor and accessory equipment.
- Add meaningful capital encounter and raid caches, with occasional modest bandit gear.
- Later add frontier ruins, caches and outpost discoveries for hero exploration.
- Acceptance: equipped stats agree across capital/frontier, KO retains gear, and RTS armies need no individual inventory actions.
- Review repeat-reward and multiplayer loot rights before enabling persistent campaign drops.

### 6. Forts and conquest

- Add center tiers, defensive structures, multistage siege, selected garrisons and occupation.
- Add limited damage and repair states before broad destruction features.
- Acceptance: fast or hidden units cannot bypass stages; a real garrison and road make capture useful.

### 7. Campaign integration

- Define expulsion, return, victory and capital/frontier authority.
- Build full campaign save/load and multiplayer-safe world ownership.
- Acceptance: no duplicate reserves, cargo or rewards across simultaneous conflicts or reload.

### 8. Scale after balance and profiles

- Expand curated regions, then consider optional procedural variation.
- Consider more capitals, railways and more complex industry after workload profiles.
- Acceptance targets for world scale and latency are chosen from measurements, not guessed here.

## Open choices for the next design discussion

| Topic | Choice still needed |
|---|---|
| World scale | Region count, travel scale, settlement-site limits and additional capitals. |
| Resources | Final starter goods, water rules, output rates, storage and shortages. |
| Supply | Reserve quantities, local emergency output, shortage penalty rates and valid-road rerouting. |
| Trade loss | Cargo custody and delivery timing; later loot share, escort cost, insurance and capture transport. |
| Army support | Resupply, field depot, origin reassignment and transit policy. |
| Hero recovery | Clinic location, cost, delay and fallback when captured. |
| Hero equipment | Capital bag/stash capacities are 12 each; frontier item power budget, synergy caps and compatibility rules remain open. |
| Reward cadence | Bandit drop frequency, accomplishment rewards and anti-farm mechanism; no numeric rate is approved. |
| Loot rights | Party sharing, eligible crew retrieval, claim persistence and campaign reset policy. |
| Conquest | Stage gates, defenders' mobilization, control duration and minimum contest force. |
| Occupation | Garrison capacity, civilian title, salvage, sack and raze outcomes. |
| Settlement growth | Tier thresholds, build time, upkeep and decline grace. |
| Capital | Expulsion, return, lieutenant budget, civic authority and victory. |
| Persistence | Season conversion, global clock, offline policy and multiplayer authority. |
| Clan identity | Any specialist builds after shared mechanics are balanced. |

**Deferred (2026-10-31):** true continuous MMO operation, railroads, many capitals,
power and advanced industry, refugees, fully simulated resident traffic, a complete
interior RTS and automatic procedural continent generation. Named custom routes,
escort micromanagement, detailed caravan hunting, scheduled theft and captured-cargo
transport are optional later logistics features, not first-slice requirements.
Durability, inventory Tetris, large random-affix pools and individual army bags
are outside the first hero gear slice.
