# Phase 4: deployment, sectors and Rally

Status: built/sim-checked 2026-10-27 (original 1A–5B and authorized follow-on A–F, Contract and Stealth/HUD; all thirty final checks passed). Tim visual/balance/layout playtest remains pending. This doc owns deployment, sectors and their UI, and deployment Rally. Player controls: `controls.md` "Deployment and sectors". The Shinobi HQ raid lives in `business_raids_plan.md`. The checkpoint sections at the end are the build record.

**Completed follow-on (2026-10-27):** [simpler sector control, recovery and Ambush](#proposed-follow-on-build-plan-2026-10-27), all-day contracts and Stealth/HUD are implemented/sim-checked. Checkpoints preserve build history; only Tim playtest and separately unapproved redesign proposals remain open.

## Purpose

Keep a useful hero squad without making the full roster follow everywhere. Give spare crew local duties, retain independent group control and allow occasional large battles. Shinobi need meaningful assignments despite owning no businesses. Selection groups and deployment assignments are separate concepts.

## Shared deployment

- Hero plus at most **six assigned crew** outside deployment Rally. Numbered selection groups create no extra slots. This is **not a six-total-field cap**.
- Other crew have saved local assignments. Manual Move/Attack is allowed within their assigned sector; ordinary commands cannot take them across its boundary. Crossing sectors or joining the hero group requires an assignment-UI transfer.
- Normal group-based hero buffs affect assigned hero-group crew only, retaining each ability's range and other conditions. During deployment Rally all participating crew count as one buff-eligible group, even across separate numbered selection groups.
- Four connected, roughly quadrant-shaped town sectors are adjusted around roads/bridges; the village is a separate home area. The Deployment map below defines their presentation.
- Each town sector normally holds three crew. New overflow placement requires the hero six and **all four town sectors' normal three** to be full; home reserve occupancy is not an unlock condition. Existing overflow stays after casualties, but further overflow must meet the fullness rule again. Never overflow the hero group outside Rally. Existing total recruitment cap applies.
- Every sector always has one active assignment, including empty sectors. Temporary manual orders preserve its saved task, objective and fallback. Implemented Phase 3: confirmed manual move/attack orders continue across numbered-group, sector or hero-group selection changes, finish, then return to saved duty. **Escape** or **Return to duty** cancels immediately. This supersedes historical group-switch cancellation. Escape also releases manually overridden crew back to saved duty; targeting an enemy does not. All sector crew remain selectable by left-click/drag, with legal local move/attack orders throughout their sector.

## Home reserves and automatic deployment

All clans have unlimited home reserve within the existing total recruitment cap: unassigned/recovering crew and local home defense, without remote duties. Default **Keep at HQ: zero ready crew** (player and bots, updated 2026-10-28) is adjustable. No automatic reserve requirement starts at eighteen crew. An individual **Keep at HQ** toggle retains a particular crew member.

Healthy idle crew above the ready reserve target automatically transfer. Injured/recovering crew wait for **100% health**, the initial conservative 2B tuning (2026-10-26). First excess beyond the hero six waits for the player's first-sector choice. Fill that sector to its staffing goal before the next, then proceed cyclically; normal caps/overflow unlock still apply. Hero-group transfers remain manual. Earlier least-populated/two-reserve examples below are historical.

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

Historical 5A behavior below is superseded by [follow-on D](#follow-on-d-checkpoint-2026-10-27), including removal of the armed timeout, aggregate-HP/defender vetoes and old escape machinery.

Remote control, including hero KO, is available from any Shinobi task. Choose a visible enemy street target, inspect spotted defender count and **Arm**. All available hired sector units participate. **Cancel** works while armed; **Retreat** during attack. States: Ambush armed → Attacking → Escaping → saved task. Normal swings/damage and execution attempts apply; no guaranteed kill or invisibility.

Initial tuning: armed wait sixty seconds, attack maximum forty-five seconds; abort below 35% aggregate HP, below half the initial available crew rounded up, or when visible defenders within eight of the target exceed crew count plus two. Death/gone target, loss of sight/area or unsafe conditions trigger escape. Fallback uses physical local travel and ordinary stealth; after arrival, resume once hidden or after ten seconds. One attempt disarms.

Direct manual orders detach chosen units. Enemy targeting/ordinary group switches do not cancel autonomous Ambush; selection-change Return affects only actually manually overridden units. Task changes/explicit Return cancel or retreat appropriately, then restore the saved task.

### Geisha (autonomous, replaces manual Diversion, Tim 2026-10-27)

No manual Diversion any more. In a sector or the hero group the Shinobi geisha acts on her own (`sim/diversion.js`, numbers in `DIVERSION`):
- Lure is her auto attack: every 10 s she charms one visible enemy crew member or house guard within 6 (first whoever hits her clan, then anyone near it, then the nearest); the target stands entranced for 4 s. Never heroes, police, bandits or townsfolk.
- Anyone coming at her: she runs away and slips back into hiding. Cornered (a threat in reach 1.5 s, or nowhere to run): she fights, deadly up close (`units.json` `shinobi_geisha`).
- An explicit attack order still makes her fight like any crew member. Older 5B Diversion notes below are history.

## Recovery and reinforcement (2026-10-27)

- Sector and HQ crew who go down are not carried to the clinic: they come round at their own HQ after 30 s (`rules.sectorRespawnSeconds`) and run back to their sector. Hero-group crew still go to the clinic.
- Revived and respawned crew go back to the group they came from; new crew fill the hero group up to 6 first. Neither waits for the hero's fight to end.

## One map (2026-10-27)

The M map is the only map: its **Sectors** layer (first toggle) shows sector borders, known clan presence, last-seen squares and transfer links, with the Deployment menu docked beside it.

### Secure Extraction (historical; removed in playtest Phase 4)

Current sync migrates legacy Extraction to Watch, retaining crew. Earlier behavior below is historical.

Built/sim-checked in 5A (2026-10-26): hold the chosen objective, proactively intercept enemies within five, pursue on a leash of eight, then return. Uses actual normal combat. Initial tuning remains subject to playtest. States: Moving → Securing → Holding → Defending → Holding.

## Assignment UI and shared rules

Remote hero access: assign/remove individual crew, select one task and objective/fallback, transfer, return, activate/cancel. Show task, living/assigned counts, health, state, target/location and applicable buttons. Sector alerts highlight the corresponding status panel.

All rules/state live in the sim. Players, bots and multiplayer use the same commands, capacity checks and truthful clan sightings. Selection does not reveal unseen enemies. Free house guards remain distinct from hired crew and cannot join deployment Rally.

## Non-Shinobi assignments (updated 2026-10-27)

Current regular-clan choices are **Patrol** and **Guard Own Business** (interior/nearby approaches). Redundant Hold/Route assignment is removed; legacy Hold migrates to Patrol during shared sync, including empty sectors. Optional Patrol routes and manual station/Ctrl-right-click remain. These use the shared four-sector UI and saved-task/manual-control rules. Guard-business assignment is optional; its hired crew count toward the containing sector's capacity. Free house guards remain separate and cannot join deployment Rally.

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

Historical group-switch cancellation here is superseded by the approved, not-yet-built manual-order persistence follow-up below.

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

### Targeted corrections (verified 2026-10-27)

Build coordinator reports four fixes to the current sector/geisha/map implementation:

- Pending automatic returns retain their saved destination while the hero is unavailable or the route blocked; they cannot fall through into surplus sector dispatch and may travel home while waiting.
- Charmed geishas process entrancement before autonomous lure, flee or fight behavior.
- Active contract markers use business world coordinates, never room-local `job.spot`; visible interior bosses project to their building. Pure presentation helper: `game/src/contract_map_marker.js`.
- Boss markers use only visible, nonhidden current positions or watcher reports younger than 200 ticks (ten seconds), never unseen live coordinates.

Targeted Node checks passed with new regressions: `test_deployment_automation`, `test_deployment_transfers`, `test_geisha` and `test_deployment_map`. All four touched source syntax checks and scoped diff whitespace checks passed. No browser test or Tim playtest is claimed. No sector simplification plan is agreed by these corrections.

<a id="proposed-follow-on-build-plan-2026-10-27"></a>

## Follow-on build plan (completed/sim-checked 2026-10-27)

**Build authorized by Tim, 2026-10-27.** Build sequentially and report each phase to Tim/Docs keeper before continuing; no further confirmation is needed between phases. All authorized implementation items below are now checked after reported passing tests; Tim playtest remains unchecked. The section preserves agreed design and initial integration choices; later checkpoints record the completed implementation. Earlier authorization covers completed 1A–5B only. Historical bugfix checks above do not validate this follow-on.

### Outcome and retained rules

Reduce recurring menu use; keep detailed roster optional. Preserve current sector geometry/hex presentation, hero six, normal sector three, total recruitment cap, legal overflow unlock, pins, saved assignments, physical travel, buff rules and Rally timer/cooldown safeguards. All rules use deterministic authoritative sim and plain serializable state; humans/bots use shared commands without hidden bot intelligence.

### Simple controls and staffing

Set desired crew count per sector once; eligible HQ reserves automatically staff, recover and replace within existing health, pin, reservation, route and combat gates. No automatic hiring/payment. Useful default duties: regular clans Patrol, Shinobi Watch. Sector badges show counts/task/status and actionable exceptions (attacked, blocked, missing crew); routine operation stays quiet.

Map is the main surface. Approved replacement for built dragging: click a badge to select its crew, then use the prominent **Transfer selected crew** button in the crew-selection menu; choose a labelled destination or use explicit map transfer mode, then show clear confirmation. Remove transfer dragging/grips/icons/drop targets/instructions. Retain ownership/combat/capacity/route validation and useful rejection reasons. Small contextual action strip offers Return/task/special actions; detailed roster remains optional. Owned-business context offers Guard. Main HUD Rally uses remembered selected groups, with occasional optional group setup. Calling still grants temporary permission without forced movement/Follow.

**Proposed integration detail for confirmation:** desired counts are staffing goals, not new hard caps. Automatic reserve dispatch prioritizes deficits while respecting HQ reserve/pins. No silent recall of healthy field crew or interruption of transfers/manual jobs/Rally. Goals above three require legal overflow; manual membership remains possible within current caps.

### Shinobi assignments and standing Ambush

Current tasks are Watch and Ambush; playtest Phase 4 removed Secure Extraction and migrates saved Extraction to Watch without losing crew. Geisha autonomous charm/flee/fight is independent support; no manual Diversion setup is required. Truthful Watch reports remain baseline across duties. Watch defends without jumping passing enemies. Hero/geisha presence is not required for Ambush.

Standing Ambush patrols **together** within its sector. Without a selected target, initiate on the first personally detected enemy clan hired crew member or hero in/entering the sector. Exclude civilians, police, wild units and free house guards as automatic candidates. With a selected identity, patrol while waiting specifically for it. Actual assigned local detection is required; remembered identities/global boss markers never grant combat sight or attacks through walls. Initiate even against larger forces: remove visible-defender-count initiation/continuation vetoes. Use ordinary swings, damage and execution, with no guaranteed kill/invisibility.

### Remembered identities and coordinated target orders

A shared per-clan roster retains recent enemy identities for **120 seconds since actual sighting**, refreshing only on actual reacquisition. Show last sector/age and honest live versus remembered state; unseen movement, HP or deaths never update memory. Selecting Ambush pins identity until the attempt finishes/cancels, even beyond roster decay. Remove the sixty-second armed timeout; waiting for return may continue indefinitely.

Visible target pane or remembered map marker offers **Arm Ambush**. Contextual recent-target rows each offer Ambush; contract tracker offers **Ambush contract target**. All directly issue the same coordinated command: no dropdown or second sector-selection step. Button shows armed/Cancel; badges show Waiting/Hunting/Attacking. **Ambush next enemy** pre-arms a local untargeted opportunity.

Before attack, a coordinated target order may hand off to a staffed eligible sector that actually detects the target. Only **one sector group** commits per attempt; no cross-sector chase or piling in. Target leaving the sector after attack triggers withdrawal and ends that attempt, not chained handoffs. One-off targeting then restores saved duty. Standing Ambush resumes after recovery; chosen target clears after completion/cancel.

**Proposed lifecycle detail for confirmation:** one active coordinated targeted order per clan; explicit replacement/cancel of the old order. Prevent opportunistic Ambush from racing the coordinated claim. Persistent assignment stays separate from temporary operation/target.

### Agreed Ambush withdrawal thresholds

Snapshot initial participants; downed or killed crew count as casualties, not just executions. First casualty alone continues. Withdraw all survivors on any of:

- At least one casualty plus another standing participant at or below one-third maximum HP.
- Two casualties, immediately.
- A solo ambusher at or below one-third HP.

Larger enemy numbers alone never veto or abort. Attempt ordinary execution on a downed target unless withdrawal is triggered. Withdrawal outranks execution, retaliation, chase and casting. Manual Retreat remains available. Escape is physical/vulnerable and never guaranteed.

### Automatic fallback and recovery for every clan

All sector assignments use automatic withdrawal/recovery, differing by saved duty. Normal use requires no per-sector fallback/objective/route setup. Choose a reachable in-sector withdrawal point increasing distance from attackers and avoiding currently **visible** enemies; prefer friendly crew/owned business only where actually safe. After danger clears choose a safe regroup/patrol point. Re-evaluate if approached, rather than take hits at an unsafe fixed point. If no safe route exists, try best reachable withdrawal and defend when trapped. Use deterministic tie-breaks and bounded replanning; no teleport, invulnerability, cross-sector movement or special stealth.

Guard uses actual doors/routes and sector entrance mapping, never mixes room/outdoor coordinates. Preserve saved task/objective/manual override and return through normal travel. Withdrawing → Recovering once safely regrouping; resume only once standing survivors are gathered, six seconds out of combat and **each at least 70% HP**. Lawful existing regeneration/services only, no free healing. Replacement transfers may join under normal rules/capacity. Missing/downed/dead members cannot cause permanent gathering waits.

Standing Ambush loops Patrolling → Attacking → Withdrawing → Recovering → Patrolling; selected target displays Hunting: name. Other duties resume themselves: Patrol regroups/resumes route; Guard uses safe owned position/doors and guards again if still owned; Hold returns to hold/route; Watch stays nonaggressive; Extraction retains protection radius/leash outside retreat. Preserve manual/transfer/Rally priority; autonomous staffing never interrupts active jobs. Handle all-down groups, reinforcement arrivals, hero KO, removals, lost businesses and blocked routes.

**Authorized initial tuning, implemented in A (2026-10-27):** apply the Ambush casualty/one-third-HP withdrawal rules to every clan's automated sector groups, retaining assignment-specific initiation/objective behavior. These initial values remain subject to playtest.

### Active boss-contract tracking

Track only the actual active **boss-contract target**, not every hero belonging to a business-contract clan. First actual clan sighting during the active contract establishes a persistent exact outdoor boss-only map/minimap marker until contract end/failure/cancel. Crew/nearby enemies still require normal visibility. Marker is information, never combat/Ambush permission.

Actual stealth breaks live tracking: keep last-known position until genuine reacquisition. Indoors show building only, never interior movement/occupants. Tracker can arm the known identity while temporarily unseen, but never attack solely from the marker. Store tracking authoritatively per clan, multiplayer-safe; clear through contract/visibility/stealth lifecycle. Hidden coordinates may be used only by the explicitly approved nonstealth boss-tracking state. Keep ordinary ten-second contacts, 120-second identity memory and persistent active-contract tracking separate.

Related authorized design, implementation pending: [all-day Shinobi contracts and site-local progress](ninja_clan_plan.md#all-day-contracts-follow-on-agreed-design-2026-10-27). That owner section also separates unsettled refresh policy and other contract-assistance proposals.

Related agreed directions and proposed tuning: [readable stealth, Distract and hidden-completion Renown](ninja_clan_plan.md#readable-stealth-and-clean-contracts-follow-on-2026-10-27), authorized with implementation pending. Watch-support/Extraction removal and sabotage redesign remain proposals.

### Sequential follow-on checklist — authorized 2026-10-27, not yet complete

Tim authorizes A → B → C → D → E → Contract → Stealth/HUD → F in order, with checks and reports after each phase. All items stay unchecked until implementation/checks are reported; final Tim playtest stays unchecked. Adopt conservative initial defaults: shared Ambush casualty rules for every clan's automated sector groups, desired counts as goals rather than caps, one coordinated target order per clan, and +25% hidden-completion Renown for infiltration jobs. This authorization supersedes earlier confirmation-required wording for those defaults. Record concrete refresh/stealth tuning when implemented. Watch-helper/Extraction replacement and plant-and-leave sabotage remain separate unapproved redesigns.

- [x] **A — Implemented/sim-checked (2026-10-27):** shared all-clan withdrawal/recovery and automatic fallback, using authorized shared casualty/one-third-HP thresholds; Tim visual playtest pending.
- [x] **B — Implemented/sim-checked (2026-10-27):** staffing goals, map portrait transfers/context controls and main HUD remembered-group Rally; Tim visual playtest pending.
- [x] **C — Implemented/sim-checked (2026-10-27):** authoritative two-minute identity memory and active boss-contract tracking, with distinct visibility/lifecycle rules; Tim visual playtest pending.
- [x] **D — Implemented/sim-checked (2026-10-27):** standing group Ambush, coordinated pinned target claims/pre-attack handoffs and agreed aggressive casualty rules; action UI follows E.
- [x] **E — Implemented/logic-sim checked (2026-10-27):** target-pane/context/contract action buttons and truthful state cues; browser/visual interaction tests not performed.
- [x] **Contract follow-on — Implemented/sim-checked (2026-10-27):** separately owned [all-day contract plan](ninja_clan_plan.md#all-day-contracts-follow-on-agreed-design-2026-10-27), including rolling supply/anti-repeat policy; UI playtest pending.
- [x] **Stealth/HUD follow-on — Implemented/sim-checked (2026-10-27):** [canonical S1–S2 record](ninja_clan_plan.md#stealthhud-s2-completion-checkpoint-2026-10-27); concrete badge/bonus/quiet-work tuning and checks recorded; Tim visual/layout playtest pending.
- [x] **F — Implemented/sim-checked (2026-10-27):** shared-command bot integration and final grouped report; all thirty checks passed.
- [ ] **Tim visual/balance playtest:** after implementation; no browser/screenshot testing is planned for this build workflow.

Required checks: exact casualty/HP thresholds despite high enemy counts; safe route/replan/trap/interior doors; manual/transfer/Rally overrides; no gathering deathlock or invented healing; memory expiry versus pin and unseen-data isolation; boss stealth/indoors/contract end; one committed group/pre-attack handoff/no chase; capacity/pin/reservation/combat gates and staffing without job interruption. Existing checks remain historical until relevant follow-on regressions pass.

### Follow-on A checkpoint (2026-10-27)

Build coordinator reports `sim/sector_recovery.js` implemented for all clans before geisha/specialist/duty actions, with `game.js` tick/per-unit integration. Assignment changes clear stale recovery/engagement. First casualty alone continues; at least one casualty plus survivor at/below one-third HP, two casualties, or solo at/below one-third HP triggers withdrawal. Downed/dead/removed encounter-roster crew count; deliberate manual/transfer/Rally detachment does not.

Deterministic fallback scores reachable in-sector candidates using visible enemies only, owned sites and friendly positions. Replan at most once per second if unsafe/blocked; use actual local travel/doors, no teleport, with melee defense when trapped. Survivors and new arrivals gather within two units; resume after six seconds out of combat with each survivor at least 70% HP. No healing is invented and casualties do not block gathering. Old specialist escape integration remains to be replaced in D.

`game/tools/test_sector_recovery.mjs` passed thresholds, all three clans, reachability/physical retreat, no healing, replanning, manual/transfer/Rally priority, hidden-data isolation, trapped defense and serialization. Assignments, deployment transfers and Rally plus touched-source syntax/diff checks passed. An initial missing deployment guard was corrected before final passing checks. Tim's visual/balance playtest remains pending; B is next under existing authorization. No active-work commit requested.

### Follow-on B checkpoint (2026-10-27)

Build coordinator reports per-sector desired staffing goals (default three) implemented through shared `staffing` command accepting nonnegative safe integers. Zero disables automatic staffing there; lower goals never recall/cancel. Goals above three require legal overflow; default three retains prior legal automatic surplus overflow. Eligible reserves, pins, caps, reservations and hero quiet gate remain unchanged.

Map badges select sector crew and offer small task/goal/Return controls; optional Manage opens a docked detailed panel with folded roster and optional objective/route controls. Manual fallback picker is removed. Cached sprite portraits remain accessible on the map; drag map-tray, roster or action-bar crew onto sector geometry/badges to send normal explicit transfer commands, with authoritative sim authorization/rejection. Normal-clan owned-business cards offer Guard business. Main HUD Call Rally reuses last groups (all on first use), without changing no-Follow/timer rules. Sector badges/data show recovery/dynamic fallback and missing/staffing-goal status.

Automation checks added zero/one goals, no recall and invalid-value rejection; automation, Rally and Deployment map checks passed. Ten touched JS syntax checks and scoped diff checks passed. A null blocked-transfer target guard in map data was fixed. No browser/UI playtest claimed; C is next under existing authorization.

### Follow-on C checkpoint (2026-10-27)

Build coordinator reports `sim/shinobi_intelligence.js` implemented authoritative own-clan identity snapshots from actual vision, excluding guards, police, wild units and civilians. Store last location/sector/type/model, live state and age for 2400 ticks (120 seconds); current hunt/operation pins retain identity beyond expiry. Unseen crew position/HP/death never refresh the snapshot. Ordinary ten-second Watch reports remain separate and unchanged.

Only the actual active boss contract establishes `bossTrack`, after first real sight. Thereafter the explicitly authorized nonstealth boss marker updates exact outdoor position/building beyond ordinary vision. Actual stealth freezes last-known position; real reacquisition is required even after stealth ends. Contract end/change clears discovery. No other crew reveal, vision grant or combat permission follows from the marker.

`game/tools/test_shinobi_intelligence.mjs` passed discovery, crew isolation, memory/pins, stealth/reacquisition, interiors, lifecycle and serialization. Shinobi assignments, Deployment map and three source syntax checks passed. D connects memory to coordinated orders; E adds UI roster/actions. Tim playtest remains pending; no commit/push requested.

### Follow-on D checkpoint (2026-10-27)

Build coordinator reports `sim/ambush.js` and specialist integration implemented. Standing Shinobi Ambush patrols together using leader/formation and sector-local routes. Next-enemy and coordinated known-identity modes use the shared command; indefinite arming replaces the old sixty-second wait. Remembered/active boss identities may arm without live visibility, but attack requires actual local observation within normal range and sector.

One coordinated hunt per clan allows a staffed nonrecovering sector personally detecting the target to claim before combat. One group commits, without cross-boundary chase, piling in or post-attack chained handoff. Larger forces never veto/abort. Initial participant snapshots use A's casualty rules: first casualty alone continues; two casualties, one casualty plus a standing participant at/below one-third HP, or solo one-third HP withdraws. Ordinary attacks/execution yield to retreat.

Defeated/escaped target, cancellation or forty-five-second attack maximum leads through shared automatic fallback/recovery to saved duty; standing Ambush persists. Manual commands, transfers and Rally detach units; task changes clear operation and stale patrol. Old Escaping/aggregate-HP/defender-veto machinery is replaced.

`game/tools/test_ambush.mjs` passed standing combat against nine enemies, casualty/one-third-HP behavior, remembered waiting beyond sixty seconds, observer-sector handoff/single commitment, target exit ending attempt, cancellation and serialization. Updated Shinobi assignments passed real attack/execution/recovery, cancellation, Extraction leash and casualty behavior; deployment AI and sector recovery passed. Syntax/scoped diff checks passed. E adds target/map action UI next; Tim visual playtest remains pending. No commit/push requested.

### Follow-on E checkpoint (2026-10-27)

Build coordinator reports sector task UI exposes Watch/Ambush/Extraction. Shared remembered-target rows replace the dropdown, showing age/sector/live/tracked state and one-click Arm/Cancel, Next enemy and Retreat. Compact map controls add Next/Cancel and remembered rows with Inspect/Ambush. Truthful stored-identity markers persist and support hit-testing; Inspect opens the movable target frame over the map.

Target frame offers Arm/Armed-Cancel. Remembered inspection shows snapshot identity/age, never live HP/buffs or a hidden-entity camera jump. New world targeting/Escape clears remembered inspection. Contract tracker offers Ambush contract target/Cancel from known active boss identity, without sector selection. Tracked contract identity retains observed metadata beyond 120 seconds; coordinates use public tracked building/world point and labels distinguish tracking from actual sight. Markers never grant combat vision.

Unit-frame, Deployment map, Shinobi intelligence and Ambush checks passed; six UI source syntax checks passed. No browser/visual interaction testing is claimed. All-day Contract follow-on is next, before Stealth/HUD; Tim playtest remains pending. No commit/push requested.

### Contract follow-on checkpoint (2026-10-27)

Build coordinator reports all-day contracts/site-local counters, dawn-persistent jobs/locks and independent supply implemented; concrete cadence/repeat rules and checks live in the [contract owner](ninja_clan_plan.md#all-day-contracts-follow-on-agreed-design-2026-10-27). Normal payouts/sabotage next-payout effect, ordinary raids and HQ cancellation/lockout remain unchanged. HQ regression selects a current board row after refresh instead of stale ID, retaining headless UI adapter. Stealth/HUD bonus and quiet-work speed are next; no Watch-helper/Extraction or sabotage redesign added. Visual playtest pending; no commit/push requested.

### Stealth/HUD S1 checkpoint (2026-10-27)

Perception/patrol/Distract implementation and focused results are recorded in the [canonical S1 subcheckpoint](ninja_clan_plan.md#stealthhud-s1-subcheckpoint-2026-10-27). Full Ninja integration and S2 subsequently passed; overall Stealth/HUD is complete as recorded below. No active-work commit requested.

### Stealth/HUD completion checkpoint (2026-10-27)

S1–S2 implementation/sim checks are complete per Build coordinator; [canonical owner](ninja_clan_plan.md#stealthhud-s2-completion-checkpoint-2026-10-27) records perception, bonus, quiet speed, badge defaults and passed checks. F bot/grouped integration subsequently passed as recorded below. Tim visual/balance/layout playtest remains unchecked; no commit/push requested.

### Follow-on F final integration (passed 2026-10-27)

Build coordinator reports all agreed follow-on implementation complete. Deployment AI preserves armed/committed coordinated hunts, queues one target per decision pass and skips recovering/standing-Ambush groups. Recovery scores actual hostility, so peaceful police/wild units do not repel resting crew. Charm still freezes units; shared withdrawal outranks ordinary pebble investigation/autonomous casting. Quiet routine police patrols use readable turns; heat response/search/pursuit remain responsive, verified by full police arrest regression after restricting an overly broad slowdown. Hunting labels use remembered clan/boss/crew identity; obsolete sixty-second/aggregate-safety constants are removed. Existing cap/buff/raid/order safeguards remain.

All thirty unique checks passed: sector recovery, deployment foundation/automation/transfers/map, assignments, deployment Rally, Shinobi intelligence, Ambush, deployment AI, geisha, all-day contracts, contract refill, stealth perception, hidden-contract bonus, unit frames, vision, territory, crew, crew services/groups, indoor orders, raid, Kuroda, police, Shinobi assignments, Ninja bot, Ninja, Shinobi combat and Shinobi HQ raid. Later Hunting-label/cleanup changes were rechecked with specialist/deployment-AI checks and syntax. Thirty changed/new source modules passed `node --check`; scoped diff check was clean.

No browser, screenshot, visual or layout playtest is claimed. Tim's final visual/balance/layout item stays unchecked. Watch-helper/Extraction replacement and plant-and-leave sabotage remain separate unapproved proposals. New source/test files must be included in any later authorized commit; personal HUD layout/archives remain untouched. No commit/push requested by this handoff.

### Duty simplification follow-up (implemented/checked 2026-10-27)

Historical selection-change return behavior here is superseded by the approved pending manual-order persistence design below; Escape/explicit Return remain immediate cancellation.

Tim approved Patrol/Guard-only regular-clan duties and corrected the deselection key to **Escape**, not Control. Shared command/UI selectors reject new Hold; legacy Hold migrates to Patrol even in empty sectors. Manual station and optional Patrol routes remain. `CrewInput.clear` sends shared selection-change Return on Escape; only manual overrides resume, preserving autonomous Ambush/Rally selection safeguards.

Crew bar **↩ Duty** and map/panel **Back to duty** use shared `returnToDutyAndSelectHero`: explicitly return eligible selected/focused local sector crew, deselect and select only available permanent hero-group crew. Other released manual sector crew receive selection-change Return without duplicate explicit IDs. Hero control remains available with no crew. No movement/Follow, membership, numbered-group shortcut or Ctrl behavior changes.

Crew-group checks passed Escape return, explicit return/hero selection, no duplicate commands/Follow, numbered groups, focused map return and releasing other manual groups. Assignments passed Patrol/Guard, Hold migration/rejection, local manual/return and Guard doors; indoor-orders and Rally passed. Eight touched-source syntax and scoped diff checks passed. Invalid CP1252 bytes in recent-target panel text were normalized to UTF-8, retaining valid UTF-8. No browser/UI playtest claimed; final Tim playtest remains unchecked. No commit/push requested.

<a id="playtest-fixes-follow-on-approved-2026-10-27-not-implemented"></a>

## Playtest fixes follow-on (implemented/checked 2026-10-27)

Tim approved the numbered twenty-three-item proposal and refinements. Sequential implementation is underway; only reported completed phases are checked below. Remaining items are authorized scope, not completion. Deployment interaction requirements are now approved, including the button-based transfer flow below; a visual mockup is not yet drawn. Existing completed checkpoints remain historical. Build/check/report phased changes; Tim visual/playtesting remains unchecked.

- [x] **1 — Reliability (#12), implemented/sim-adapter checked 2026-10-27:** stable attached roster nodes and gated panel refresh; see evidence below. Full A* validation runs on command submission, not UI frames. No confirmed memory leak. Tim visual/performance playtest pending.
- [x] **2 — Focused sector interaction (#13, #14, #16), implemented/targeted-checked 2026-10-27:** clicking sector map/tab selects its crew, flashes sector and synchronizes map/tab/roster/unit selection effects; focus its roster/duty/operation with group status/counts/actions together. Remove ALL deployment transfer dragging, grips/icons/drop targets/instructions. Use a large prominent **Transfer selected crew** button in crew-selection menu, labelled destination controls or map in explicit transfer mode, then clear confirmation. Apply assignments directly; after authoritative acceptance show glow and LARGE specific status describing actual resulting action. All zone UI refreshes together. Interaction flow approved; mockup not yet drawn.
- [x] **3 — Group selection (#21, #23), implemented/checked 2026-10-27:** C replaces current selection with hero group only; Rally selects its active force. Group action-bar pips by Hero/sectors/HQ. Normal group/pip click selects the entire corresponding group, replacing others; **double-click selects the individual**. Clicking a hero-group member while another group is selected selects the whole hero group and drops all others. Ordinary switching never combines forces into a mini Rally, changes membership or shares group buffs; cross-group coordination remains sequential management. Confirmed manual move/attack orders CONTINUE when switching groups, finish then return to saved duty. Escape or Return to duty cancels immediately; no automatic cancellation merely from group selection.
- [x] **4 — Duties/hunts (#15, #17, #19, #20, #22), implemented/checked 2026-10-27:** make hunt target/selected row/status clear. GENERAL Ambush repeats nearest-valid-target attempts after withdrawal/regroup/recovery until task changes, rather than reverting to plain patrol. Remove Secure Extraction; migrate saved task to Watch retaining crew. Whole-sector walking Patrol uses reachable stable waypoints/pauses, not jitter or tiny patrol areas. Make contract boss-hunt control/status/cancel intuitive; investigate failure until boss is manually selected/armed in Deployment. Autonomous assigned crew avoid/reroute/withdraw before enemy-HQ camping infamy; manual intentional attack remains the player's choice.
- [x] **5 — Linked owner work, implemented/targeted-checked 2026-10-27:** [controls/targeting #5–7](controls.md#approved-playtest-controls-2026-10-27), [door pursuit #8](combat_spec.md#approved-pursuit-fix-2026-10-27), [contracts/stealth #2–4](ninja_clan_plan.md#approved-contractstealth-playtest-fixes-2026-10-27), [geisha #9](crew_recruiting_plan.md#approved-geisha-playtest-adjustment-2026-10-27), [rear entrance #10](interiors_spec.md#approved-rear-entrance-fix-2026-10-27), [fullscreen/audio/browser #1/#11/#18](tech_plan.md#approved-shellaudio-playtest-fixes-2026-10-27).
- [x] **6 — Focused checks/report, completed 2026-10-27:** cover authoritative acceptance/rejection, coherent UI refresh, performance/input causes, no remaining transfer drag controls, explicit transfer mode/confirmation, group replacement/individual selection and persistent manual orders versus Escape/Return cancellation, no membership/buff bypass, task migration, repeated Ambush, sector reachability and camping avoidance. Other owners list their own behavior checks.
- [ ] **Tim visual/playtest:** all changed flows and balance; never infer this from Node checks.

The approved Extraction removal supersedes its earlier unapproved status in this doc; Watch-helper contract assistance and plant-and-leave sabotage remain separate unapproved redesigns. Implementation and reported checks are recorded in the following checkpoints; no commit/push requested.

### Playtest Phase 1 reliability checkpoint (2026-10-27)

Build coordinator reports `stable_list.js` `syncChildren` keeps interactive roster nodes attached unless order/membership changes. Deployment-panel updates are gated by tick/focus/destination/selection; explicit local UI actions force refresh. `test_stable_roster` passed six hundred unchanged frames with zero structural mutations and preserved focus during regroup/removal. Panel syntax/scoped diff checks passed.

Investigation corrected the route-cost hypothesis: UI `canTransfer` uses lightweight capacity/combat checks; full A* route validation occurs on submitted commands, not every UI frame. No memory leak is confirmed. Tim visual/performance playtest remains unchecked. Phase 2 button-only deployment UI is next; no commit/push requested.

### Playtest Phase 2 focused deployment checkpoint (2026-10-27)

Build coordinator reports `deployment_panel.js` is a thin reexport of `deployment_panel_ui.js`: one focused group's roster/duty/operation, synchronized map/tab selection and sector flash. **Transfer selected crew** locks source IDs, offers labelled destinations or explicit map destination mode, then confirm/cancel. No transfer drag handlers, enabled draggable controls, grips or instructions remain in panel/map/action bar. Assignments apply directly without Save; target-row highlight persists.

`sim/deployment_feedback.js` stores serializable authoritative acceptance/rejection/request/sequence receipts, integrated with deployment, assignments, Ambush and Rally. UI shows large accepted text/glow or clear rejection only from the result; a pending click is not success.

Transfers, assignments, Ambush and Deployment map checks passed. New `test_deployment_feedback` passed real accepted/rejected duties, ownership rejection, arm/cancel, request identity and serialization; syntax/scoped diff checks passed. Tim visual/performance review pending; Phase 3 group/pip/C/manual-order persistence remains next and unchecked. No commit/push requested.

### Playtest Phase 3 command-group checkpoint (2026-10-27)

Build coordinator reports ordinary selection constrained to one deployment command group; actual Rally participants plus hero party form the active Rally force. C selects hero party/active Rally only. `grouped_crew.js` organizes Hero/sectors/HQ/active Rally pips: header/normal pip selects group, double-click selects individual; hero-party member replaces another selected group. Medical/jail visibility stays. Numbered groups remain, filtered by active deployment group. No membership/buff changes.

Sim `giveOrder` rejects mixed deployment-group manual commands outside Rally. Group switching sends shared release: manual move/attack continues with `returnWhenDone`, then saved duty resumes. Escape/explicit Return cancels immediately.

Updated crew-group checks passed hero/C/group/individual/mixed/Rally cases. New `test_manual_release` passed actual movement completion/duty, immediate Escape and mixed-group sim rejection. Assignments, Rally and deployment AI passed. Visual pips/Tim playtest remain unchecked; Phase 4 duties/hunts next. No commit/push requested.

### Playtest Phase 4 duties/hunts checkpoint (2026-10-27)

Build coordinator reports Extraction options/behavior removed; shared sync migrates legacy task to Watch retaining crew. `sector_patrol.js` caches reachable wide-sector coverage points; Patrol walks with 1.5-second pauses, Ambush patrol walks together and explicit routes remain supported. General Ambush picks nearest visible valid targets and repeats attempts after recovery without losing assignment.

`assignments.avoidCamping` runs before ordinary duty/operations: HQ warnings send automated sector crew toward reachable local safe positions, held away seventy-five seconds; manual overrides clear this behavior. Patrol/recovery goals avoid rival HQ zones; charm freeze still outranks escape.

Contract-hunt button failure was inherited `pointer-events:none` from `#contract`; explicit button pointer events and world-event isolation fix it. Labels now read **Order sectors to hunt this boss** / **Cancel boss hunt**, with authoritative hunt state. No prior boss selection is required.

New `test_sector_playtest` passed broad stable route coverage, walking/no run, actual HQ warning escape/no heat/manual override and arming a hidden contract boss without prior selection. Assignments, updated Shinobi assignments (migration), extended Ambush (nearest/repeat after recovery) and sector recovery passed. Tim visual review remains unchecked. Linked Phase 5 proceeds in subphases: targeting/pursuit; stealth/contracts/lights/rear doors; geisha; shell/audio. No commit/push requested.

### Playtest Phase 5A targeting/pursuit checkpoint (2026-10-27)

Implemented with focused checks reported: [target controls/fog memory](controls.md#approved-playtest-controls-2026-10-27) and [permission-aware door pursuit](combat_spec.md#approved-pursuit-fix-2026-10-27). Two older input tests are still being adapted; Phase 5 linked-work checkbox stays incomplete until remaining owner subphases finish. Tim visual/playtest remains unchecked; no commit/push requested.

### Playtest Phase 5B checkpoint (2026-10-27)

Build coordinator reports [contract stages/global badge/indoor snuff](ninja_clan_plan.md#approved-contractstealth-playtest-fixes-2026-10-27) and [reachable rear entries](interiors_spec.md#approved-rear-entrance-fix-2026-10-27) implemented/targeted-checked. Concrete lighting rules and checks live in those owners. Phase 5A's older crew-assist/phase3b input fixtures now pass. Phase 5 aggregate remains incomplete until geisha and shell/audio finish; Tim visuals unchecked. No commit/push requested.

### Playtest Phase 5C geisha checkpoint (2026-10-27)

Build coordinator reports [geisha adjustment](crew_recruiting_plan.md#approved-geisha-playtest-adjustment-2026-10-27) implemented/checked: current stats, stationary charm/channel rules, pink visuals and passing evidence live in that owner. Phase 5 aggregate stays incomplete until shell/audio; Tim visual/balance review unchecked. No commit/push requested.

### Playtest Phase 5D shell/audio checkpoint (2026-10-27)

Build coordinator reports [shell/audio owner work](tech_plan.md#approved-shellaudio-playtest-fixes-2026-10-27) implemented/Node-adapter checked with explicit Keyboard Lock/browser-owned-overlay limits, saved audio settings and gameplay input suppression. Phase 5 aggregate implementation is complete; Phase 6 final integration remains in progress. Tim visuals/audio/fullscreen playtest stays unchecked; no commit/push requested.

### Playtest Phase 6 final integration (passed 2026-10-27)

Build coordinator reports all authorized implementation phases 1–6 complete. New `test_deployment_panel_flow` runs actual panel handlers and sim: locked source IDs through map destination choice, no order before confirmation, pending before receipt, accepted/rejected UI only after authoritative result, direct duty/no Save, 120 unchanged frames without DOM structural mutations, no drag controls. It passed.

Final rechecks passed target controls, door pursuit (including closed rival-HQ rejection), manual release, deployment feedback, sector playtest, game shell, deployment AI, Rally, vision, combat and character stats. Prior reported groups/assignments/Ambush/recovery/geisha/indoor-stealth/Ninja/hidden-bonus/indoor-crew/crew-assist/phase3b/map checks remain passing. All fifty-four modified/new JS modules parse; scoped diff check clean.

Final review retains Keep at HQ and sector goals in focused controls; hero portrait/world body selects hero force, T ignores friendly inspection and uses enemy target. In-game controls match built Tab/T/C/group/transfer/Ambush/lamp/Settings/fullscreen behavior. Browser capability limits remain as owned in the tech plan. No browser/screenshots or Tim testing claimed. Tim visual/performance/audio/balance/layout playtests remain unchecked. No commit/push requested.

## Tim manual playtest checklist (2026-10-27)

All checks below are **unperformed**. Start a fresh match; use regular clan for Patrol/Guard and Shinobi for contracts/stealth/geisha. `?test=lantern` supplies player ryo if needed without extra crew. Recruit/transfer enough crew to compare Hero, two sectors and HQ; keep at least one enemy target available. Do one pass at a time and report the numbered test when something fails. Node checks do not tick these boxes.

### Pass 1 — Deployment and selection first

- [ ] **1. Focus/responsiveness:** open Deployment and M → Sectors. Click different sector tabs/map sectors rapidly, then pause. Expected: correct crew/roster/duty focused together, boundary flashes, clear selection highlights, no missed clicks or frozen controls.
- [ ] **2. Whole group versus individual:** click group header/pip, double-click individual, then click hero-party member/portrait or press C while a sector is selected. Expected: normal click selects entire corresponding group, double-click only individual; hero/C replaces all others. Try numbered recall/box selection spanning groups: no combined force or temporary Rally/buff sharing.
- [ ] **3. Transfers/cancel:** crew-first: select source → **Transfer selected crew** → labelled destination or explicit map pick; destination choice starts travel immediately (no confirmation step). Expected: locked source IDs, authoritative acceptance/rejection, real physical travel and no drag controls. Large button becomes **Cancel transfer** for current/latest batch; try per-traveler cancel too. Original group full/hero unavailable sends cancelled crew physically to HQ pinned Keep at HQ; no teleport/cap bypass, return leg cannot be cancelled again. Destination-first: **Assign crew to [ward]**, choose source/check crew/HP, preview, then **Assign selected crew**. Try ownership, combat, capacity and blocked-route cases.
- [ ] **4. Direct duties/staffing:** change Patrol/Guard/Watch/Ambush and optional route/duty point, sector goal, HQ reserve target and individual Keep at HQ. Expected: direct application without Save, authoritative feedback, consistent counts across panels; pins/caps/reservations respected, no silent recall or unwanted automatic Follow. Inspect a traveler while menus are open: live crew/unit cards dock inside Deployment or standalone map; closing restores HUD position/order/style and saved layout. Locks/drag disabled only while docked. Fresh default reserve should be zero. Set two, edit zero, blur/update then Apply: zero must persist. With first excess crew, choose first ward from toolbar hint/menu; verify one ward fills to goal before next, goal input draft survives refresh, and manual sector transfer/positive goal redirects priority.
- [ ] **5. Manual order lifetime:** send one sector crew on a long move or attack, switch group and observe. Expected: confirmed order finishes then saved duty resumes. Repeat and press Escape or Return to duty mid-order: immediate cancellation/return, without unintended movement/Follow or duplicate commands.

### Pass 2 — Targeting, combat and autonomous duties

- [ ] **6. Input intent:** Tab enemy, then T; separately right-click enemy body/nameplate/portrait and right-click ground. Repeat indoors with hero elsewhere and try an execution. Expected: Tab only selects, explicit attack affects current group only, ground moves, Ctrl stays crew-only, ally interaction/execution protections remain. Right-click a downed body/loot: only one nearest reachable eligible worker goes; others retain orders. With no selection use hero-party crew in viewed place before hero fallback. Change peer group orders during job: worker rejoins latest group order afterward; solo-select new order/Stop overrides immediately.
- [ ] **7. Fog memory:** select an enemy, lose sight, inspect frame and try new attack. Expected: Out of sight/stale identity and frozen observed stats/location/room, no live world marker/new hidden attack. Reacquire: normal fresh information/marker returns.
- [ ] **8. Door pursuit:** explicitly attack an enemy moving inside/outside an accessible building. Expected: same target pursued physically through permitted doors, no teleport. Try closed rival HQ and sector boundary: entry/slot/area restrictions still apply; no unseen coordinate tracking.
- [ ] **9. Ambush loop:** set General Ambush near several enemies. Expected: nearest valid visible target, ordinary fight, withdrawal/regroup/actual recovery and another attempt without reverting to plain patrol. Choose an exact remembered identity: wait for that target, not another. Verify target row/status, Cancel and Retreat.
- [ ] **10. Contract boss hunt:** accept boss contract, obtain identity, then use tracker **Order sectors to hunt this boss** without manually selecting boss first. Expected: clickable command, truthful armed/hunting/engaging state and working Cancel; unseen marker alone never permits a hit.
- [ ] **11. Patrol/migration/camping:** watch sector Patrol over time and, if available, load a saved Extraction assignment. Expected: broad reachable walking loop with steady pauses; old Extraction becomes Watch retaining crew. Near rival HQ warning, autonomous crew withdraw before camping infamy; intentional manual orders stay your decision. Leave valid downed enemy/visible loot within six units: local assigned crew clean up then resume duty; manual orders, retreat/Rally/transfer and smoke hold-fire must still take priority.
- [ ] **12. Rally isolation/return:** compare ordinary groups first, then call Rally. Expected: ordinary groups remain isolated; Rally temporarily permits its actual force/buffs/controls, no automatic Follow. Expiry sends non-hero participants physically back; normal restrictions return.

### Pass 3 — Shinobi objectives and geisha

- [ ] **13. Steal versus Sabotage:** at actual Steal stash observe work/pause and hidden double-speed. On Sabotage plant, expect explicit plant → large floating MARK PLANTED plus ground ring → hold-inside stages. Test leaving/failure conditions. Mechanics and hidden-final-actor Renown bonus remain as in [contract owner](ninja_clan_plan.md#all-day-contracts-follow-on-agreed-design-2026-10-27); wrong room/marker alone never progresses. As defender, remove mark: stop fighting and channel four continuous seconds; hit/move/new order interrupts/reset, including a hit at completion. Check REMOVING MARK bar and contract warning; multiple defenders cannot pool progress.
- [ ] **14. Global badge/layout:** with no contract, walk/run through light/dark outside and inside. Expected: obvious WALK/RUN and HIDDEN/AT RISK/SEEN, actual suspicion distinct from concealment, truthful F cue. Move/resize in HUD editor, reload/reset: round readable badge and saved layout preserved.
- [ ] **15. Indoor snuff:** by day snuff an eligible room lamp, compare brightness/detection and another room; spend shared three-snuff budget, advance dawn to check relighting, then dusk to check budget refresh. Expected: actual local darkness/stealth impact only; dawn relights lamps, dusk resets the nightly budget. Street lamps still use night rules.
- [ ] **16. Rear doors:** take selected ninja through each teahouse rear approach, enter and exit from both sides. Expected: reachable approach/landing with wall clearance, no stuck crew or wrong-room jump.
- [ ] **17. Geisha:** compare configured twelve damage/rough sustained output with Ninja; let her stand near eligible enemies, then move/attack. Expected: stationary-only charm, overrides cancel without refunding ten-second cooldown; four-second charm, pink hearts/aura and CHARMING bar. Check normal flee and cornered fight. Exact observed DPS can vary with mitigation/ticks.

### Pass 4 — Settings and a longer session

- [ ] **18. Audio:** Settings → Master/Effects/Mute/Test sound, reload, toggle K. Expected: saved values and mute agree, existing voices stop on mute, test audible at chosen gain. Move camera to remote crew/another room: appropriate camera-local sound with room isolation. Report excessive peaks/quiet effects.
- [ ] **19. Fullscreen/game surfaces:** enter fullscreen, open UI, press ordinary Escape; Alt+Enter exits. Where Keyboard Lock is supported/permitted, Escape reaches game without exiting; long Escape remains browser escape hatch. Unsupported/denied capability is honestly disclosed. Try context menu/text/native dragging on game surfaces versus editable inputs. Browser/extension-owned AI overlays may require browser settings and cannot be fully suppressed by game code. [Capability details](tech_plan.md#approved-shellaudio-playtest-fixes-2026-10-27).
- [ ] **20. Sustained session:** play across transfers, KO/recovery, recruitment, pause/resume of browser activity and repeated menu reopen. Expected: no progressive input/selection degradation, duplicated crew/commands, lost pins/goals or stuck stale focus. Repeat a few high-risk steps above after longer play.

### Issue report

Test number; clan; setup/location; expected → actual; reproducibility (always/sometimes, steps); optional screenshot/video or console error. State whether a fresh match/reload changes it. Leave failed or untested checkboxes unchecked.

## Pre-playtest simulation validation (2026-10-28)

Build coordinator reports new bounded `game/tools/test_playtest_sim.mjs` passed 260 seconds each for Yakuza, Kuroda and Shinobi (thirteen simulated minutes total), with medium rival bots, actual town/civilians/police/bandits and four staffed sectors. Coverage includes legal transfers, full three-minute Rally expiry, automatic night transition, finite position/health, hero-group cap, no non-Rally transfer attacks, supported duties and serialization.

Fourteen focused scripts passed: deployment panel flow, transfers, manual release, sector playtest, Ambush, recovery, target controls, door pursuit, indoor stealth, geisha, Rally, Shinobi HQ raid, automation and deployment AI. HQ raid rerun passed after explicit missing-deployment tracker/click regressions; [contract owner note](ninja_clan_plan.md#contract-tracker-robustness-2026-10-28). Syntax/scoped diff checks passed.

These are bounded sim/logic results, not browser, visual, manual-playtest or full-match balance approval. All manual checklist boxes above remain unchecked.

## Playtest follow-up transfer/cards/cleanup (2026-10-28)

Build coordinator reports implemented/checked: crew-first destination choice now starts immediately, superseding historical confirmation wording. Destination-first **Assign crew to [ward]** provides source-group/available crew HP rows, preview and Assign action without mixing combat selections. Both use shared authoritative transfer rules.

Batch/per-traveler **Cancel transfer** validates ownership and physically returns original group even after hero combat begins. Full original group/unavailable hero falls back to unlimited HQ, visibly pinned Keep at HQ to prevent immediate redispatch. No teleport/cap bypass; cancelled return legs cannot be cancelled again and route retries remain.

`selection_dock.js` docks the same live selection-card DOM/state/handlers inside active Deployment or standalone map. Travelers remain inspectable despite combat-selection unavailability; status names destination. Close restores HUD parent/order/styles; locks/drag disabled only while docked, personal layout untouched. [Mark removal](ninja_clan_plan.md#sabotage-mark-removal-channel-implementedchecked-2026-10-28) and [sector cleanup](crew_recruiting_plan.md#autonomous-sector-cleanup-implementedchecked-2026-10-28) live in their owners.

Twenty focused scripts passed: mark scrub, transfer cancel, sector cleanup, panel flow, selection dock, HUD drag, assignments, Ambush, recovery, manual release, Ninja, Shinobi combat, transfers, Rally, all-day contracts, hidden bonus, unit frames, target controls, Shinobi HQ raid and selection panel. Source syntax/diff checks clean. New coverage includes physical cancellation/caps/ownership, all-clan execution/loot priorities, real panel-to-sim acceptance, node-preserving docking/traveler inspection and HUD restoration. No browser/visual/full-match balance claim; every manual checkbox remains unchecked.

## Reserve priority and explicit crew-job follow-up (2026-10-28)

Default ready reserve is zero for humans/bots, preserving configurable minimum and individual pins. Roughly eighteen-plus crew was user preference context, not a new automatic reserve rule. Reserve/goal dirty input drafts survive blur/update until authoritative state matches or zone changes; panel regression explicitly covers two → edit zero → blur/update → Apply → sim zero.

New `autoSector` records first-zone priority. First crew beyond hero six waits for choice via nonblocking toolbar hint/menu. Sector/tab/map focus chooses it; manual transfer or positive staffing goal seeds/redirects it. Fill one sector to goal, then cyclically move on with existing cap/overflow/health/combat/route/reserve/pin safeguards. Bots issue the same command to choose nearest HQ sector when first excess arrives. Transfer/cancellation rules stay unchanged.

[Single-worker body jobs](crew_recruiting_plan.md#explicit-single-worker-body-jobs-2026-10-28) own execution/loot details. Eighteen focused scripts passed: crew jobs (including solo-dispatched latest-peer-order rerun), first sector, target controls, foundation, automation, deployment AI, panel flow, sector cleanup, mark scrub, downed, crew assist, crew recall, move priority, manual release, transfers, Rally, transfer cancel and selection dock. Source syntax/diff checks clean. No browser/visual claim; manual boxes remain unchecked.
