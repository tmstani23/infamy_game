# Phase 4: deployment, sectors and Rally

Status: built 2026-10-26 (phases 1A-5B; grouped regressions passed). This doc owns deployment, sectors and their UI, and deployment Rally. Player controls: `controls.md` "Deployment and sectors". The Shinobi HQ raid lives in `business_raids_plan.md`. The checkpoint sections at the end are the build record.

## Purpose

Keep a useful hero squad without making the full roster follow everywhere. Give spare crew local duties, retain independent group control and allow occasional large battles. Shinobi need meaningful assignments despite owning no businesses. Selection groups and deployment assignments are separate concepts.

## Shared deployment

- Hero plus at most **six assigned crew** outside deployment Rally. Numbered selection groups create no extra slots. This is **not a six-total-field cap**.
- Other crew have saved local assignments. Manual Move/Attack is allowed within their assigned sector; ordinary commands cannot take them across its boundary. Crossing sectors or joining the hero group requires an assignment-UI transfer.
- Normal group-based hero buffs affect assigned hero-group crew only, retaining each ability's range and other conditions. During deployment Rally all participating crew count as one buff-eligible group, even across separate numbered selection groups.
- Four connected, roughly quadrant-shaped town sectors are adjusted around roads/bridges; the village is a separate home area. The Deployment map below defines their presentation.
- Each town sector normally holds three crew. New overflow placement requires the hero six and **all four town sectors' normal three** to be full; home reserve occupancy is not an unlock condition. Existing overflow stays after casualties, but further overflow must meet the fullness rule again. Never overflow the hero group outside Rally. Existing total recruitment cap applies.
- Every sector always has one active assignment, including empty sectors. Temporary manual orders preserve its saved task, objective and fallback. Switching numbered groups, sectors or the hero group returns previously manually controlled sector crew to their saved task. **Return to Assignment** also ends manual control. Targeting an enemy does not. Manual orders remain legal anywhere inside the assigned sector.

## Home reserves and automatic deployment

All clans have unlimited home reserve within the existing total recruitment cap: unassigned/recovering crew and local home defense, without remote duties. Default **Keep at HQ: two ready crew** is adjustable. An individual **Keep at HQ** toggle retains a particular crew member.

Healthy idle crew above the ready reserve target automatically transfer. Injured/recovering crew wait for **100% health**, the initial conservative 2B tuning (2026-10-26). Fill empty normal sector slots first. Once hero six and all four sector threes are full, surplus may overflow into the least populated eligible sector. Hero-group transfers remain manual. Example: 21 assigned crew = hero group six, town sectors thirteen, HQ two.

Automatic transfers queue while the hero is in combat and dispatch after the six-second quiet period. Automation is one-way: lowering the reserve target dispatches eligible surplus; raising it never silently recalls assigned crew. The player chooses who returns home. New/recovered crew retain membership/hold until an explicit transfer or eligible automatic deployment sends them. Membership alone never issues Follow, including recruitment, recovery and Rally.

## Transfers

Starting a transfer requires **six seconds since the hero last dealt or received damage**. Validate a route before dispatch, reroute around dynamic gameplay changes, and show **Transfer blocked** only as a failsafe when no route remains. Sector boundaries never block an explicit transfer.

Reserve destination slots immediately to prevent simultaneous overfill. Crew physically run without automatic attacks or retaliation and remain vulnerable. The hero may resume combat after initiation. Incoming hero-group transferees join on arrival, without teleportation or automatic Follow. Death releases the reservation; clinic/jail retain saved assignment intention. Exact cancellation/recovery/reservation edge behavior remains open.

UI states: Transferring → Arrived → Starting assignment.

## Deployment Rally

Distinct from Ronin's existing combat ability. Manually select assigned groups to release location restrictions and join the hero force for **three minutes from activation**. Travel, assembly and ambush delays count inside that timer. Show time remaining and called-crew arrival count. Cooldown is **five minutes from expiry**. Survivors return to saved assignments at expiry unless deliberately permanently reassigned. Rally membership never automatically issues Follow.

Actual enemy War Lantern placement for a formal raid resets a cooldown to ready immediately. During an active Rally it does not extend the duration: instead, the next Rally is ready at current expiry. Multiple events never stack extra duration; ordinary fights do not reset it. Activation remains manual. Implemented in 4B, including Shinobi HQ raids; rejected/daytime placements do not reset it.

Hero KO does not disable remote Rally/sector control and does not automatically call crew to the hero's body. Normal group-based hero buffs remain limited to hero membership, except all Rally participants are eligible during Rally; each ability retains its ordinary range/conditions and existing local numbered selection groups.

## Shinobi assignments

One active task per sector: **Watch, Diversion or Secure Extraction**. Normal sightings/monitoring are baseline across tasks. No passive money or Renown: benefits are information, openings, escape protection and survival.

### Watch and shared sightings (5A built/sim-checked 2026-10-26)

Shared authoritative reports across all active Shinobi sector duties require actual assigned local observers, same-place normal vision within its normal range. Coordinate across zones without hidden reveal. Entry/sector-change alerts highlight own status buttons; map/minimap show live position, or last observed position/heading for ten seconds after sight loss. Hidden movement is not tracked. Active boss-contract targets (or rival leaders for clan-target contracts) get priority diamond/! and special callout. No passive ryo/Renown. Ordinary 3A UI contacts remain independent presentation memory, not extra Watch reveal.

Watch reports/defends without initiating attacks on passers; manual local attacks remain allowed.

### Manual Ambush capability (5A built/sim-checked 2026-10-26)

Remote control, including hero KO, is available from any Shinobi task. Choose a visible enemy street target, inspect spotted defender count and **Arm**. All available hired sector units participate. **Cancel** works while armed; **Retreat** during attack. States: Ambush armed → Attacking → Escaping → saved task. Normal swings/damage and execution attempts apply; no guaranteed kill or invisibility.

Initial tuning: armed wait sixty seconds, attack maximum forty-five seconds; abort below 35% aggregate HP, below half the initial available crew rounded up, or when visible defenders within eight of the target exceed crew count plus two. Death/gone target, loss of sight/area or unsafe conditions trigger escape. Fallback uses physical local travel and ordinary stealth; after arrival, resume once hidden or after ten seconds. One attempt disarms.

Direct manual orders detach chosen units. Enemy targeting/ordinary group switches do not cancel autonomous Ambush; selection-change Return affects only actually manually overridden units. Task changes/explicit Return cancel or retreat appropriately, then restore the saved task.

### Diversion (5B built/sim-checked 2026-10-26)

Use the Shinobi-only [geisha hire](crew_recruiting_plan.md#shinobi-geisha-built-2026-10-26); [cast reuse/placeholders](cast_tracker.md#shinobi-geisha-runtime-alias-2026-10-26) owns its art status. Choose Diversion, objective/fallback and manually **Start diversion**. States: Ready → Moving → Dancing → Escaping → Returning → saved task. Only one operation per sector.

Initial tuning: visible warning 1.5 seconds, attraction six seconds within radius six; thirty-second geisha cooldown starts at actual dance start. Source stays revealed/channeling. Damage, manual override, transfer, Retreat, task change or KO aborts. Fallback is physical local travel with ordinary stealth; resume saved duty once hidden or after ten seconds at fallback. Medical/jail metadata preserves cooldown; successful explicit transfer/Return clears old lure/intents.

Only idle enemy hired crew/house guards are eligible. Heroes, civilians, police, wild units, current attackers/combatants, moving active jobs, recent six-second combat, transferees and Rally participants are immune. Hired crew retain normal sector movement limits. Eligible interior guards use normal clan sight and physically leave/re-enter through their front door. No teleport or forced hero control. Target damage or explicit orders break attraction; explicit orders, break or effect end grant ten seconds of attraction immunity. Source/target warnings, map ping, question markers and cast/ring effects expose counterplay.

### Secure Extraction

Built/sim-checked in 5A (2026-10-26): hold the chosen objective, proactively intercept enemies within five, pursue on a leash of eight, then return. Uses actual normal combat. Initial tuning remains subject to playtest. States: Moving → Securing → Holding → Defending → Holding.

## Assignment UI and shared rules

Remote hero access: assign/remove individual crew, select one task and objective/fallback, transfer, return, activate/cancel. Show task, living/assigned counts, health, state, target/location and applicable buttons. Sector alerts highlight the corresponding status panel.

All rules/state live in the sim. Players, bots and multiplayer use the same commands, capacity checks and truthful clan sightings. Selection does not reveal unseen enemies. Free house guards remain distinct from hired crew and cannot join deployment Rally.

## Non-Shinobi assignments (approved 2026-10-26)

Patrol Sector, Guard Own Business (interior and nearby approaches), and Hold Position/Route use the shared four-sector UI and saved-task/manual-control rules. Guard-business assignment is optional; its hired crew count toward the containing sector's capacity. Free house guards remain separate and cannot join deployment Rally.

## Deployment map (3A built/sim-checked 2026-10-26; visual playtest deferred)

Tim approved the preview and subsequent build with glowing one-pixel hex lines, a slow nondistracting ripple and thick glowing colored sector edges. **M → Deployment** opens the layer; Deployment and Territory are mutually exclusive. Existing business/police/unit switches remain. World shape, roads/buildings, public street sector geometry and navigation grid are unchanged.

Visual radius-four hexes clip to rectangular bounds. Cells are mostly visual subdivisions of four sectors, not assignments/territory objectives; crossing cells inside a sector requires no transfer. Exterior sector contours omit bold internal building-hole outlines. Styling uses one CSS-pixel hex strokes/soft glow, a fourteen-second spatial ripple, 2.5-pixel sector borders (3.2 selected), soft halos, subtle selection pulse and framed tactical labels/sidebar. Reduced-motion preferences are respected. Fixed identity colors: Pleasure amber, Bund teal, West violet, East coral.

Shared known clan presence appears separately as divided translucent hex fills; no exclusive ownership or deployment income. Own saved task, inbound-inclusive counts/three capacity, health/downed/available counts, Holding/Moving/Fighting/Transferring/Transfer blocked/Empty state, objective/fallback rings and dashed transfer-destination links are visible. Interior markers project to public entrances. Shinobi alone sees its village outline/name and own reserve count. 3B now adds active duty AI/task controls and actual duty states; specialist abilities remain later work.

Click a sector/nameplate to close the map and open Deployment management focused on that destination, preserving crew selection. Sidebar selection highlights sectors; **Manage sector** opens the panel. Management works during hero KO. The ordinary map still navigates the camera. Sizing is responsive, hover tips clamped and sector/layer controls keyboard-accessible.

Enemy contact memory uses only normal `vision.canSee` observations, including while the map is closed; it never reads rival assignments/transfers. Live squares become hollow/dim last-known positions with last-observed travel direction for **ten seconds** after sight loss, then expire. Hidden movement/deaths are not tracked. This presentation memory is separate from the authoritative Watch reports/alerts/priority pings implemented in 5A.

`deployment_map_geometry.js` traces exterior contours and generates visual hexes. Build coordinator reports `game/tools/test_deployment_map.mjs` passed contours/anchors/nav coverage, unchanged navigation, hexes, rival-data isolation, visibility/memory/expiry/direction, shared presence, KO/health/reservation/interior projections and pure drawing/picking queries. A Node canvas/DOM adapter smoke check passed real map/minimap layer switching, management picks without camera/order side effects, ordinary map look/close and resize. Foundation, automation, transfer, vision, territory and match-setup regressions plus syntax/diff checks passed. No browser tests/screenshots. Tim's deferred check: refresh → M → Deployment.

## Decisions still needed

- Playtest implemented sector boundaries, management presentation and local manual-order boundary handling.
- Transfer cancellation and any remaining recovery/reservation edge behavior beyond the checkpoints below; playtest the initial full-health automatic-deployment threshold.
- UI representation of Rally participation and deliberate permanent reassignment.
- Playtest initial Watch contact-memory timing (ten seconds) and truthful priority reporting.
- Playtest initial Ambush thresholds and Extraction radius/leash; playtest initial Diversion hire/effect balance and placeholder visuals described in their owner sections.

## Sequential build plan (build authorized 2026-10-26)

Tim's latest authorization (2026-10-26): continue **3B–5B in order**, running focused Node/sim checks and reporting each subphase/checkpoint to Tim and Docs keeper. No further confirmation is required between these already authorized phases. This supersedes the earlier confirmation gate; it does not authorize combining the phases or skipping reports. Tim's visual/balance playtest remains deferred until the end. Future checklist items stay pending until implementation is reported. Conservative initial specialist tuning must be reported as concrete values when reached; until reported, open values remain unset. Preserve approved mechanics.

- [x] **1A — Complete (2026-10-26):** shared connected sector definitions, membership, home reserve and capacity/overflow foundation; no order restrictions yet.
- [x] **2A — Implemented/sim-checked (2026-10-26):** basic management UI, manual physical transfers/reservations and sector enforcement; Tim visual playtest pending.
- [x] **2B — Implemented/sim-checked (2026-10-26):** automatic reserve dispatch and overflow safeguards; Tim playtest deferred.
- [x] **3A — Implemented/sim-checked (2026-10-26):** visual hex Deployment map, status and selection; Tim playtest deferred.
- [x] **3B — Implemented/sim-checked (2026-10-26):** non-Shinobi and basic Shinobi local duties, including manual-return behavior; Tim playtest deferred.
- [x] **4A — Implemented/sim-checked (2026-10-26):** Rally activation, timer and arrival UI; expiry returns/buffs/raid resets followed in 4B.
- [x] **4B — Implemented/sim-checked (2026-10-26):** Rally expiry returns, hero-group buff eligibility and formal-raid resets; Tim playtest deferred.
- [x] **5A — Implemented/sim-checked (2026-10-26):** coordinated Watch, Secure Extraction and manual Ambush; initial tuning above, Tim playtest deferred.
- [x] **5B — Implemented/sim-checked (2026-10-26):** geisha Diversion and shared-command deployment AI integration; final grouped regressions passed.

- [ ] **Final Tim visual/balance playtest:** complete deployment/sector/Rally/specialist flow after implementation and internal checks.

### 1A foundation checkpoint (2026-10-26)

Completion/checks reported by Build coordinator. `sim/sectors.js` uses deterministic multi-source street-nav flooding from quarter anchors for four connected walkable sectors, separate village home geography and interior-to-public-entrance mapping. The grid stays outside syncable state; navigation and visual hexes are unchanged.

`sim/deployment.js` records plain deployment definitions, six/three limits, per-clan two-ready reserve target, saved task/objective/fallback and per-crew membership/Keep at HQ. Clan/spawn/end-step hooks classify existing starting followers as hero (maximum six), otherwise new unassigned recruits as home. Queries for membership/counts/capacity/overflow/next automatic destination are side-effect-free. Existing overflow survives casualties; moving a normal sector member cannot manufacture new overflow eligibility. Home has no deployment capacity limit; the total recruitment cap still applies. Guards, police, wild units and noncrew are excluded.

At the 1A checkpoint, `restrictionsEnabled` remained **false** (superseded by 2A match setup below). 1A created or changed no movement/Follow orders and introduced no commands or transfer UI. Medical/jail intention persistence and live reservations followed in 2A, automatic dispatch in 2B and duties in 3B; Rally activation/timers followed in 4A; expiry returns/buffs/raid resets followed in 4B.

`game/tools/test_deployment_foundation.mjs` passed connectivity/entrance mapping, membership/defaults/caps, overflow/source-slot checks, exclusions, order preservation, serialization and pure-query coverage. Existing crew and crew-services checks plus syntax/diff checks passed. Tim may defer visual playtesting until the full build; each remaining subphase requires checks and reporting, without another confirmation gate.

### 2A manual transfer checkpoint (2026-10-26)

Build coordinator reports implementation and targeted sim checks passed; Tim's visual playtest is pending. Toolbar **Deployment** opens roster/selection, health, hero-six/HQ/four-sector counts, inbound reservations and transfer/blocked/arrived status. Select crew, destination, then **Transfer selected**. In-flight crew may reroute through the same authorization. Escape closes; the panel blocks edge-panning. No new hotkey or URL parameter. At this 2A checkpoint the reserve target was read-only; 2B adds editing, Keep at HQ UI and automatic dispatch below.

Shared `deployment`/`transfer` commands validate ownership, availability, quiet period, capacity, reservation and route. Passive vulnerable travelers use normal street/interior doors and never retaliate; hero combat after authorization does not cancel travel. Arrival holds, never auto-Follows. HQ destination is inside own HQ; hero destination tracks the living hero or blocks/retries if unavailable. Remote HQ/sector transfers work during hero KO after the quiet period. Dynamic blockage retries once per second with three-second no-progress detection. Death/downing/removal releases slots; rerouting validates replacement reservations. No teleport.

Match setup enables membership limits for every clan; isolated old sim fixtures remain disabled unless opted in. Ordinary home/sector orders, targets, assistance, loot and execution obey area limits; Follow requires hero membership. Sector-local navigation masks prevent path smoothing outside the assignment, while explicit transfers use unrestricted base navigation. Home street radius is currently twelve around its HQ entrance plus its own interior. Guards/wild/police remain excluded.

Clinic/healing/jail records preserve assignment intention and Keep at HQ. Returnees have home membership at their actual clinic/police spawn and hold for later reassignment. No teleport/Follow. At this 2A checkpoint arrivals held at the saved objective. 3B now initializes saved duties after arrival and handles manual group-switch return; 3A added the hex layer. 4A adds Rally activation/timers; 4B adds buff gating and expiry returns.

`game/tools/test_deployment_transfers.mjs` passed real-match setup, passive travel under damage, continued travel after hero combat, reservation races, local path/order containment and bypass rejection, KO management, HQ entry, medical/jail intention, Kuroda/Shinobi routes including village bridges and dynamic blockage. Foundation, crew, indoor-orders, crew-services, dismissal and police regressions plus syntax/diff checks passed. No browser tests/screenshots.

Tim's checkpoint: refresh → Deployment → send selected crew to a sector → try local and cross-sector orders → transfer HQ/hero → inspect counts/status. Tim may defer this review to the final whole-build playtest; each subsequent subphase still requires checks and reporting under the latest authorization.

### 2B reserve automation checkpoint (2026-10-26)

Build coordinator reports implementation and targeted sim checks passed. Tim's playtest is deferred; 3A was subsequently completed as recorded above. Deployment exposes an editable nonnegative integer **Keep at HQ ready target** (default two) and per-hired-crew **Keep at HQ** checkbox. Healthy ready pins count toward the target and always remain pinned even at target zero. Injured/pinned/busy reserve states are shown.

Once-per-second policy passes send full-health idle home surplus to least-populated normal sector vacancies, then legally unlocked overflow. Immediate reservations prevent overfill; hero assignments stay manual. The same sim rules apply to every clan/bot. Hero combat queues dispatch until the six-second quiet period; a crew member's recent combat, current attack or active job also blocks automatic dispatch. Active manual jobs are not interrupted.

Lowering target/unpinning permits surplus on the next pass. Raising target or pinning field crew never recalls or cancels field assignments. Injured idle reserve/recruited/recovered crew outside HQ physically return to their own HQ, then wait for 100% health before field dispatch. Clinic/jail saved-group and Keep at HQ metadata persist. Passive vulnerable travel, preflight and blockage retry reuse 2A; failed routes show blocked/queued and retry, deaths release reservations. No teleport or automatic Follow.

`game/tools/test_deployment_automation.mjs` passed reserve defaults/player-bot parity, pins/configuration rejection/persistence, target changes, hero/crew combat and jobs, health/home returns, physical completion, capacity/reservations/overflow/casualties, retry/death and serialization. Foundation, transfers, crew-services and crew checks plus syntax/diff checks passed. Earlier foundation/transfer fixtures now account for automatic HQ relocation. No browser tests/screenshots; 3A–5B remain pending.

### 3B local duties checkpoint (2026-10-26)

Build coordinator reports implementation and focused checks passed; Tim's playtest remains deferred. `sim/assignments.js` owns saved Patrol Sector, Guard Own Business, Hold Position/Route and Shinobi basic passive Watch. Tasks persist even in empty sectors. Objectives/fallbacks and up to eight optional route points must be within the sector; guarded business must be owned and in that sector. Invalid cross-sector updates are rejected atomically. A lost guard target shows unavailable/fallback without replacing the saved task.

Patrol uses sector-local attack-move waypoints; its initial generated loop extends six from the objective. Hold routes pause about two seconds per point. Hold/Watch return to chosen points; Watch does not initiate attacks on passers but can defend. Guard uses normal doors to patrol the owned interior; changing task exits locally, even while the hero is KO.

Legal explicit manual orders temporarily show **Manual control**. Changing numbered groups, Deployment groups or replacing selection across assignment groups returns released sector crew to saved duty; enemy targeting alone does not. Task changes and **Return selected** restore duty. Explicit transfers clear old duty/hold-fire and initialize saved duty on arrival, never Follow.

Management adds active-task selector, guard-business chooser, objective/fallback map pickers, route add/clear (maximum eight), **Save** and **Return selected**. Picking map points stays within the selected sector and only edits the draft until Save. Map/status shows actual duty state; 3A styling is unchanged.

`game/tools/test_assignments.mjs` passed local patrol containment, hold/manual/return, atomic invalid-objective rejection, real owned-business entry/exit, KO task changes, passive Watch and manual attack. Transfers, Deployment map/automation, crew, indoor-orders, crew-groups and syntax checks passed. Transfer fixture now isolates manual containment from active patrol. 4A subsequently adds Rally activation/timers; 4B subsequently completes returns/buffs/raid resets; specialist abilities remain later work.

### 4A Rally control/timer checkpoint (2026-10-26)

Build coordinator reports implementation and `game/tools/test_deployment_rally.mjs` passed. `sim/deployment_rally.js` stores plain per-clan selected groups and a snapshot of hired participants, excluding free guards/downed crew. Three minutes begins at activation, including travel; five-minute cooldown begins at expiry. Repeated active activation cannot extend duration. Manual activation works during hero combat or KO.

Called crew gain temporary area/explicit-Follow permission without changing saved membership or numbered selection groups. Duty AI and automatic reserve dispatch yield for participants. Calling issues no movement/order/Follow. Existing in-flight selected-destination crew remain passive travelers, then can be commanded.

Deployment adds group checkboxes, **Call Rally**, remaining time, current near-hero count within eight units versus called available count, and cooldown. The toolbar Deployment button shows remaining time while closed. This near-hero count is current proximity, not a cumulative arrival history.

Checks cover KO/combat calls, selected groups/guard exclusion, no implicit Follow, temporary area/explicit Follow, three-minute duration/repeat prevention, five-minute expiry cooldown, ready recast and serialization. Existing assignment/transfer checks passed. Physical expiry returns, deliberate permanent-reassignment override, buff membership and formal-raid resets followed in 4B below. Tim's visual/balance playtest remains deferred.

### 4B Rally completion checkpoint (2026-10-26)

Build coordinator reports implementation/sim checks passed. Expiry sends surviving non-hero-group participants on physical passive vulnerable return transfers to saved sector/HQ, using normal routes/doors. Required returns bypass the initiation quiet gate, retain slots and retry blockages. Hero-group members keep existing orders; death/downing/jail produces no phantom return. A successful deliberate permanent transfer removes participation and overrides return; explicit Return releases participation early. Numbered selection changes during Rally do not return participants, preserving independent commanded groups.

Buff rules are owned by [combat spec](combat_spec.md#deployment-group-buffs-built-2026-10-26). Membership stays saved during Rally; return travel never automatically issues Follow.

Successful formal War Lantern placement resets the defender's cooldown through the shared hook, including Shinobi HQ. Failed/daytime placement does nothing. Idle cooldown becomes ready immediately; during active Rally the next use becomes ready at current expiry. Repeated events never extend duration.

Extended `game/tools/test_deployment_rally.mjs` passed actual return travel during hero combat/no teleport, arrival/no Follow, permanent override, membership/guard/transit buff eligibility and cleanup, successful Shinobi-HQ versus rejected daytime placement, repeated active resets and exact cooldown timing. Raid, Shinobi HQ raid and full Kuroda regressions plus syntax checks passed. Assignment/transfers passed in 4A. No browser/playtest/screenshots; 5A is next under existing authorization.

### 5A specialist checkpoint (2026-10-26)

Build coordinator reports `sim/shinobi_assignments.js` implemented the Watch/Extraction/Ambush rules above. `game/tools/test_shinobi_assignments.mjs` passed real-world coordinated priority sightings, hidden-movement isolation/ten-second contact loss, KO arm/cancel, ordinary kill/execution and automatic escape, Extraction radius/leash and low-health abort. Existing assignment/Deployment map and syntax checks passed. 5B subsequently completed as recorded below. Visual/balance playtest remains deferred.

### 5B Diversion/integration checkpoint (2026-10-26)

Build coordinator reports `sim/diversion.js` and `deployment_ai.js` implemented. Bots recognize permanent hero-party crew/current Rally participants only; normal match hires/recoveries hold until shared explicit transfer/Follow commands. AI sends ordinary commands for quiet reserve-to-hero fills, explicit Follow after arrival, defensive Rally even during KO, cautious visible-target Ambush and geisha task/dance. Shinobi may hire one geisha after roster eight, within existing cap/prices. No hidden intelligence, resources or sim bypass.

`game/tools/test_diversion.mjs` passed real hire/cap/faction/no implicit Follow, reused sprite existence, warning/duration, target immunity/breaks, cooldown/persistence, retreat and physical interior guard exit/re-entry. `game/tools/test_deployment_ai.mjs` passed actual commands for promotion/party isolation, observed Ambush, geisha tasks/dance and KO defensive Rally. Existing Shinobi combat, crew-groups and crew-services passed. All 1A–5B implementation items are built; final grouped integration regressions passed, and Tim's final visual/balance playtest remains unchecked.

### Final integration checks (passed 2026-10-26)

Build coordinator reports all nine focused feature checks passed: deployment foundation, automation, transfers, map, assignments, Rally, Shinobi assignments, Diversion and deployment AI. All ten relevant regressions passed: crew, crew-services, crew-groups, indoor-orders, vision, territory, raid, Shinobi HQ raid, Shinobi combat and Kuroda. All twenty-three touched JS modules passed `node --check`; targeted `git diff --check` was clean. No browser tests, screenshots or Tim playtest are claimed.

Explicit crew loot/execution/assist attacks enter temporary manual control and break Diversion; internal Ambush execution stays attached to its operation. Sector-local loot escort Follow is allowed only for existing escort intent, never as a hero-group bypass. Return/permanent transfers clear stale lure/return/dance intents while ordinary task resumption remains intact. Expiry/transfer/new-life cooldown metadata is preserved.

No implementation subphase remains. Tim's final visual/balance playtest stays unchecked; the geisha dance uses the Arms Hip Hop Dance sheet (2026-10-26); only her attack keeps the formal-bow placeholder.

Already implemented separately: [Shinobi HQ raid](business_raids_plan.md) "Shinobi HQ raid". Its status and pending playtest live in the raid owner doc; this plan does not reopen that implementation.
