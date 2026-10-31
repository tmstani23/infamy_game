# Frontier campaign plan

**Design record (2026-10-31): documentation approved; implementation is not approved or built.**

This page owns the proposed capital, frontier, settlement, supply and larger RTS campaign.
It describes the intended game after the current city match, not current gameplay.
Current city rules and build status remain in the existing owner docs.

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
- The number and scale of regions, sites, clans and capitals remain open.
- Start with curated capital and region structure so travel, defenses and resources can be balanced.
- Add procedural variation later if the curated version is good; make it optional.
- More capitals and railroads are later possibilities, not first-slice requirements.

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
- A blockade slows growth and military operations; it does not automatically collapse every settlement at once.
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
- Visiting the settlement gives the player more direct actions and control, not a production aura.
- The earlier passive five-percent presence bonus is discarded.

## Settlement building — agreed direction

- Aim for a SimCity and Settlers hybrid with fewer dependencies than a full city simulator.
- The player strategically places walls, fortifications, major roads, resource works and military facilities.
- The player reserves residential, commercial, workshop/industrial and military zones.
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
- Future capital inventory and loot can remain a separate system.
- Equipment stat carryover between capital and frontier needs a later decision.

## Army origin and capability — agreed direction

- An army has a persistent supply origin at a named settlement or network.
- Actual facilities, stockpiles and technology at that origin determine recruitment and equipment access.
- An army does not change its capabilities when crossing a nearest-settlement boundary.
- Capturing an advanced settlement does not auto-upgrade existing troops.
- Loss of a supply route does not instantly downgrade equipped units.
- Resupply, origin reassignment, field depots and transit behavior remain open choices.
- Unit, army and cargo identities survive movement, battle, save/load and view changes.

## Supply and trade — provisional starting point, not approved

This section is a proposal for discussion, especially the transport and loss rules.
The agreed constraint is that supply has a real origin, inventory and travel consequence.

- Model roads as edges between settlements and useful junctions.
- A named persistent route has an origin, destination, path, desired goods and reserve budget.
- A governor requests goods from a source only above its protected local reserve.
- Schedule batched caravans with finite cargo capacity rather than one carrier per item.
- Withdraw cargo from the source when a caravan departs; credit it only on a delivery receipt.
- The earliest version may use abstract workforce carriers rather than individual worker micro.
- Caravans have real cargo, location, travel time and stable identity.
- A caravan may be delayed, intercepted, escorted or rerouted after a road changes.
- A hostile roadblock is a route problem, never a teleport or instant-delivery trigger.
- An intercepted caravan becomes an active battle even when no player views it.
- The player gets a useful warning and can order escort or attack on the route.
- A lost shipment is not also retained in aggregate transport accounting.
- Recruitment, equipment and construction draw from the supply base or actual deliveries.
- Basic logistics are available to every clan.
- Looted supplies are handled by army or settlement logistics, not hero body-loot clicks.
- Existing equipped units keep equipment after a shipment loss.
- Route frequency, convoy size, escort budgets, reserve minima and travel speed are open.
- Loot shares, capture, recovery, insurance, transport home and attrition are open.
- A disrupted route should expose what is missing and when the next shipment is possible.

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

1. One world state owns all settlements, governors, armies, caravans and battles.
2. Peaceful economies can be records rather than fully animated individual citizens.
3. Those records include population, workforce, zones, buildings, projects and stocks.
4. They also include production, priorities, trade, recruitment, garrisons and damage.
5. Visible citizens represent activity; looking at a settlement never changes its output.
6. Economically meaningful caravans retain real cargo, location, travel time and interception.
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
18. Supply contact with an enemy activates detailed combat before a convoy could pass through unharmed.
19. Canonical unit and cargo IDs prevent double counting between aggregate and physical representations.
20. Saving includes in-flight cargo, paused operations, orders, timers and battle state.
21. Rendering has no authority over movement, economy, cargo or combat.
22. The existing Worker helps UI responsiveness but is not proof of continent-scale performance.
23. Benchmark settlement economy and simultaneous battles separately.
24. Bound work queues and snapshots; load static map chunks as needed.
25. Set world-unit counts and latency targets only after measurement.

## Edge cases to design before implementation

| Case | Agreed constraint or question |
|---|---|
| Hero KO during a siege | Player commands and the battle continue; recovery site, delay and cost are open. |
| Recovery clinic captured | No automatic free revival; choose a fallback policy. |
| Simultaneous sieges | Both resolve by the same battle rules with finite available reinforcements. |
| One reserve ordered twice | A unit has one identity and location; orders cannot duplicate it. |
| Governor bankrupt | Explain blocked projects, preserve essentials where possible; debt/bailout rules open. |
| Missing food, timber or stone | Production and growth react visibly; short shortages do not instantly erase tiers. |
| New road is impassable | Construction and route planning must identify the blocked connection. |
| Road or gate changes mid-route | Caravan and army reroute or wait; cargo never teleports. |
| Ownership changes with cargo en route | Cargo owner, delivery rights and interception result require policy. |
| Occupied building changes owner | Garrison occupation and civilian title remain separate state. |
| Blocked spawn or evacuation exit | Find a legal alternate or wait; never spawn through solid geometry. |
| Trade is interrupted | Source withdrawal stays accounted for; destination receives only delivered cargo. |
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

### 4. Physical logistics

- Add named routes, batched cargo, escorts, interception and rerouting after road changes.
- Acceptance: cargo conservation through delivery, loss, capture and save/load; no offscreen immunity.

### 5. Shared frontier RTS

- Add basic troops, army origin/supply base, real offscreen combat and continued control after hero KO.
- Propose a clinic recovery facility with a tested captured-clinic fallback.
- Acceptance: identical player/bot rules and no outcome change solely from opening a view.

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
| Supply | Route frequency, convoy size, reserve levels, rerouting and transport labor. |
| Trade loss | Loot share, cargo custody, escort cost, insurance and delivery timing. |
| Army support | Resupply, field depot, origin reassignment and transit policy. |
| Hero recovery | Clinic location, cost, delay and fallback when captured. |
| Conquest | Stage gates, defenders' mobilization, control duration and minimum contest force. |
| Occupation | Garrison capacity, civilian title, salvage, sack and raze outcomes. |
| Settlement growth | Tier thresholds, build time, upkeep and decline grace. |
| Capital | Expulsion, return, lieutenant budget, civic authority and victory. |
| Persistence | Season conversion, global clock, offline policy and multiplayer authority. |
| Clan identity | Any specialist builds after shared mechanics are balanced. |

**Deferred (2026-10-31):** true continuous MMO operation, railroads, many capitals,
power and advanced industry, refugees, fully simulated resident traffic, a complete
interior RTS and automatic procedural continent generation.
