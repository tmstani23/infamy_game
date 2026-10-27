# Ninja (Shinobi) clan plan

Status: phases 1-5 built 2026-10-20 (units, stealth, village and map, leader kit, contracts); see "As built". Adaptive bot contracts and difficulty profiles built 2026-10-21; see [rival AI](rival_bot_plan.md#phase-3-adaptive-ai-2026-10-21). Clan selection: [starting paths](gameplay_and_design.md#starting-paths-settled).

Source: `next_steps/feature_ideas_2026-10-20.md` in the project files (section 2 and the DECIDED notes).

Related docs: `territory.md` (one season score for all clans; the ninja village is their only territory; hidden ninja and vision), `business_raids_plan.md` (the back-room spot the mark uses), `combat_spec.md` (targeting, executes), `roadmap.md`.

## 1. What the ninja clan is

- A fully playable clan, chosen through the [start menu](gameplay_and_design.md#starting-paths-settled). Bots can play it too, through the same commands.
- **Contracts only:** ninja hold no territory or property and can't buy businesses. Their home is the hidden village in the west forest (`assets/environment/ninja_village` art).
- **Score:** the shared season score, from Renown: 50 Renown = 1 point (`settings.json` `season.renownPerPoint`), the same as a teahouse.
- **Crew cap** grows with Renown.

## 2. Contract board

- The village board posts 3-5 jobs each dawn: jobs from the town and jobs other clans post (bots included), such as sabotage a payout, steal from a stash, scout, knock out a boss.
- Each job pays ryo + Renown. A failed job pays nothing.
- The target clan gets a warning.

## 3. Mark contract

- At night, plant a mark on the business's back-room spot (the raid hold spot: the floor spot furthest from the door, so it works in one-room buildings too). Planting is a 3 s channel; the owner is alerted.
- Hold 60 s with a ninja inside (none inside for 10 s = fail). The owner can knock the mark down with Space (4 s), like a War Lantern.
- Success = the contract pay + Renown, and the owner's next payout from that business is 0. Reward is the contract pay only (skimming the payout maybe later, for balance).

## 4. Stealth

- Hidden status, with detection ranges: short in the dark, long in lantern light, longer when running.
- Snuff lanterns: at most 3 per night.
- Back window entry into eligible businesses, ninja only; rival HQs are off-limits.
- Hidden ninja don't show even in a rival's own territory until revealed (lantern light, detection, attacking and so on; see `territory.md`).

Stealth targeting update (2026-10-21): [combat rules](combat_spec.md#now-built).

## 5. Leader kit

Current ability rules, Vanish and Assassinate crit bonus: [combat spec](combat_spec.md#f-hero-abilities-and-action-bar-approved-by-tim-2026-10-16-built).

No miss/dodge yet: that comes with combat variety (`roadmap.md`).

## 6. Dropped ideas

- Watch Posts and hidden marks as ninja territory (Tim 2026-10-20): dropped. Ninja score only through Renown.

## As built (2026-10-20)

- **Units:** `ninja_leader` hero with its own numbers via `units.json` `models` (`statsOf` is model-aware); crew types Ninja and Ninja (tanto), both using the `ninja_grunt` rig, Shinobi-only hiring in the dojo or longhouse. Clan kind `yakuza` / `ninja`. Ninja crew cap from Renown (`rules.renownPerCrew` 75). Test: `?test=ninja` (`test_params.md`), `game/tools/test_ninja.mjs`. Playing Shinobi adds a Yakuza bot clan at the inn next to Kuroda (`bots.json` `yakuza`, `main.js` `botList`); Playing Yakuza, a Shinobi bot clan (`sim/ninja_bot.js`, `bots.json` `shinobi` / `shinobiLevels`, test `test_ninja_bot.mjs`) lives in the village longhouse: hires ninja at the dojo up to its Renown cap; takes contracts at the shrine from the same fair board (easy: bandits, scout, steal; medium adds mark and boss; hard prefers mark and boss); sneaks in by back windows alone (crew wait outside) and snuffs a lantern by the window at night; brings its crew to boss and bandit hunts; flees to the longhouse below 30% HP. Abilities: R below 50% HP, F when hidden 3 s next to a target, E on a fleeing hunted boss or 2 foes close, Q to close on a boss. The game has 3 fixed clans (Shinobi, Yakuza, Kuroda); the two you don't play are bots.
- **Village and map:** see `buildings.md` "Ninja village".
- **Stealth** (`sim/stealth.js`, `units.json` `rules.stealth`): hidden unless an enemy is within 2 in the dark, 5 when lit, 4 indoors, doubled while running. Revealed for 5 s when seen, hitting or hit. Snuff lanterns 3 per night (Space; they relight at dawn). Shinobi-only back windows into eligible businesses; no rival HQ entry. Hidden units can't be seen or targeted; your own hidden ninja draw at 80% opacity with a slight purple shimmer. Badge: "HIDDEN · F in N" / "HIDDEN · F ready" / SEEN.
- **Leader kit:** numbers in `combat_spec.md` "Ninja leader kit".
- **Contracts** (`sim/contracts.js`, `units.json` `rules.contracts`, `state.contracts`; menu `contract_menu.js`): Space at the village shrine. 3-5 jobs each dawn; you hold one at a time and it runs until dawn; done pays ryo + Renown, failing or calling it off pays nothing; the target clan gets a warning callout.

| Job | What to do | Pay |
|---|---|---|
| Scout | Stay hidden inside a rival business for 10 s | 150 ryo + 15 Renown |
| Sabotage mark | At night, stand on the back-room spot 3 s, then keep a ninja inside 60 s (nobody inside 10 s = fail). Owner alerted at once if the planter was seen, else after 15 s; owner units on the mark 4 s scrub it. Done: that business pays 0 next dawn | 300 + 30 |
| Steal | Stand on the target scoring business stash for 10 s; stepping off pauses progress | treasury share and accepted cap below; base 25 Renown |
| Boss | Knock out the rival boss | 400 + 40 |
| Bandits | Knock out 5 bandits | 200 + 20 |

- **Fair board:** at most 2 jobs per clan (`perClan`); a clan hit by a finished contract in the last 2 dawns (`recentDays`) is drawn 1/(1+hits) as often; the season leader 2x (`leaderWeight`); taking a job swaps that clan's other jobs for other clans or the town, or drops them.
- **Renown:** 75 = +1 crew slot; 50 = 1 season point; top bar "Renown N" (ninja only).
- **HUD:** contract tracker at the top (job, what's left, "until dawn"); minimap and map ping on taking a job; callouts for done / failed, "Shinobi took a job on you", the mark alert (with a ping) and a sabotaged payout.
- **Polish (2026-10-20):** Shadow Step on a visible enemy or townsperson lands next to them with one sure crit and a big violet slash, then auto-attacks. Snuff: hover a lit lantern within 7 ("Snuff (N left tonight)"), then left-click or Space; dark purple smoke flash; the badge shows snuffs N/3 at night. Assassinate reach about 4.4, with a lunge and a thin V flash. Hidden opacity is now 0.8 (`cast_tracker.md`). Glowing mushrooms along the two village bridges (`port_town.json` `glowShrooms`): drawing only, no light or stealth effect.
- **Update 2026-10-21 (overrides older numbers above):**

  - Snuff: hover measured from the lamp's glow on screen; one snuff puts out every lantern within 2.5 (`snuffArea`); only being downed cancels it. Back-window rings violet, drawn over walls.
  - Shadow Step: a target-frame target within range+1 comes first (step on, crit, auto-attack), else toward the mouse. Assassinate: frame target first, else the unit at the mouse; both can hit townsfolk and police. Assassinate cooldown 45 s.
  - FX: bigger white crit slash and Assassinate (~0.8 s), lunge streak + white V, short hit-pause on the crit. Bridge mushrooms: 42, 3 shapes, soft glow.
  - Renown: 1 season point per 50 (`settings.json` `season.renownPerPoint`), 1 crew slot per 75 (`units.json` `renownPerCrew`). Map shows "N Renown (M to next)". Shinobi appear on the results screen and can win.

Phase 3E access (Tim, 2026-10-21): all ten ownable businesses have Shinobi back-window entry/exit and reachable sabotage objectives. The interior sabotage ring appears during an active contract; Scout needs no interior circle. Steal now targets these scoring businesses.

## Phase 3G rules (Tim, 2026-10-21)

- Rival HQs are off-limits through fronts, back windows and crew commands, including legacy contracts. Own HQ access remains. Steal, Scout and Sabotage target scoring rival-owned businesses, never HQs or services.
- Clan-target ryo/Renown uses rounded base reward × (1 + 0.1 × target owned business score). Board quotes follow current strength; acceptance locks rewards. Town/bandit jobs are unchanged.
- Steal takes 20% of completion-time treasury, capped at the accepted 500 + 100 × target owned business score. Zero treasury pays zero ryo but normal Renown.
- Initial defender warning stays generic; failure reveals contract type. Reveal-triggered theft alerts name the business.
- Shinobi earn +2 Renown per rival crew execution and +8 per rival leader defeat, including crew actions, stacking with contracts. Knockdowns alone give no crew Renown; wild enemies, police, civilians and house guards give no passive Renown. Existing cash bounty/claim rules remain.
- Progression stays 75 Renown per crew slot and 50 per season point, without an extra hard maximum; raid limit unchanged. Established bots recruit toward affordable unlocked capacity and rally outdoor recruits before camp/job evaluation.
- Ninja (tanto) is one additional recruit beside Ninja; both share stats, prices and timers: 180 HP, 15 damage, 15% crit, base price 90, base hire 6 s. Normal price scaling and doubled HQ hire time apply. Both recruit at dojo/longhouse; bots can mix them. Stealth, capacity, clinic and rewards support both.
- Purple Renown appears above matching gold ryo in one rising badge, combining combat/contract bonuses; Renown-only gains still display. No duplicate central combat Renown alert.

Contract board follow-up (2026-10-21): the first successful bandit contract per dawn unlocks one replacement, with at most two taken that dawn; dropping or failing does not refill it. Newly eligible owned-business jobs fill spare board slots during the day within existing board/per-clan limits. Active terms remain locked.

## Village routes and deferred work (Tim, 2026-10-22)

Village now has four stream crossings (2026-10-22): [bridge locations and approaches](buildings.md#village-crossings-tim-2026-10-22).

- Later combat/inventory pass: hero/selected-unit stats pane, fuller recruit-window stats and configurable overhead combat/buff duration text. Current overhead duration text is Vanish only.

## Phase 4 status (updated 2026-10-27)

Sector Watch, manual Ambush, geisha Diversion, Secure Extraction, deployment/UI and open decisions: [deployment and sector plan](deployment_sector_plan.md). HQ raid, suppression, rewards and recovery protection: [businesses and raids](business_raids_plan.md) "Shinobi HQ raid". Deployment/sector features and authorized follow-on are implemented/sim-checked; Tim visual/balance/layout review remains pending. The linked HQ raid is built and sim-checked (2026-10-25), awaiting Tim's visual/balance playtest.
- **Stealth rules (2026-10-26):** knocking down a lantern always reveals and ends Vanish; attacking inside your own smoke reveals, stopping hides again; taking damage does not break Vanish (only attacking does). Code: `sim/stealth.js`, `sim/game.js`.

## All-day contracts follow-on (agreed design 2026-10-27)

**Authorization update (Tim, 2026-10-27):** all-day contracts and the readable-stealth/HUD follow-on below are authorized in the sequential [deployment follow-on build](deployment_sector_plan.md#sequential-follow-on-checklist--authorized-2026-10-27-not-yet-complete). This supersedes earlier pending-build-confirmation wording in these follow-on sections. Initial +25% hidden-completion Renown for infiltration jobs is authorized; record actual refresh/stealth tuning when implemented. No item is complete until implementation/checks are reported. Watch-helper/Extraction replacement and plant-and-leave sabotage remain unapproved.

**Implemented/sim-checked 2026-10-27; UI visual playtest pending.** Any Shinobi contract may be accepted, progressed and completed at any time of day. Sabotage planting, generated flags/tonight labels, bot waits/cutoff scoring and active-job expiry no longer depend on night/dawn. Accepted jobs and their own progress survive dusk/dawn; no replacement hard deadline is approved.

Progress depends on the actual job location, conditions and actions: scouting hidden-observation seconds; sabotage planting then hold seconds (retain existing detailed mechanics until separately reworked); theft stash seconds; boss defeat; bandit kills. Show relevant local interior objective/ring progress and tracker counters. Boss/bandit jobs use actual target/camp or kill counters, not invented indoor rings. Wrong-location units and marker visibility never grant progress. Sabotage's next-business-payout effect is separate and never delays contract completion/reward until dawn.

Initial rolling supply tuning: `refreshSeconds` 120, independent of day/night. Eligible vacancies refill immediately subject to fairness and active-job/active-clan exclusion. Same nonbandit kind/site/owner repeats wait 120 seconds after success or thirty seconds after failure/cancel. Bandits allow two earned jobs per 120-second supply cycle; dropping does not create a replacement. Legacy `perDawn` is only board-size configuration. Active jobs/reward locks survive refresh; no hard contract deadline. Existing public camps provide all-day opportunities without changing unrelated night-spawn rules.

Preserve HQ-raid cancellation/lockout, explicit cancellation, ownership invalidation, one-active-contract/reward locks, normal stealth/lighting, ordinary business payout schedules and War Lantern/HQ raid timing. Sim, bots and UI share independent objective logic.

- [x] All-day acceptance/progression/completion and independent rolling supply implemented/sim-checked (2026-10-27).
- [x] Reported checks passed: new `test_contract_anytime` (daytime mark plant/completion, transitions, local/wrong-site counters, repeats/refresh/lifecycle); updated `test_contract_refill`, `test_ninja`, `test_ninja_bot` and `test_shinobi_hq_raid`; source syntax checks. Local objective counters draw only in the viewed objective room, alongside tracker progress. No UI visual test claimed.
- [x] Hidden-completion bonus and quiet-work speed implemented/sim-checked in S2 below (2026-10-27).

Still proposals: removing Secure Extraction and folding contract assistance into Watch (one stealth helper, no multiplied progress/reward/hero-group buffs), and plant-and-leave sabotage replacing the hold. The approved stealth/clean-reward directions below do not approve these redesigns.

## Readable stealth and clean contracts follow-on (2026-10-27)

**Implemented/sim-checked in S1–S2 (2026-10-27); visual/layout playtest pending.** Tim approved avoidable/readable detection, usable entrance openings, shorter quiet interactions and an additional clean-job reward. The extra reward is **Renown**, replacing the suggested extra-ryo bonus; baseline contract ryo remains. No direct extra season points: Renown uses existing season progression.

### Agreed stealth and interaction behavior

- Stealth spotting generally indoors/outdoors by armed observers (guards, police, bandits, clan units) requires their forward view cone, actual simulated facing and line of sight. Walls/opaque cover block it. Walking has smaller detection and a short suspicion buildup, shown over the guard, rather than instant detection.
- Patrol starting positions/timing must offer at least one usable entrance opening, with timing the player can observe instead of guards parked over entry. Movement should be predictable without sudden random direction shifts.
- Quiet objective completion should use faster/short interactions. No exact timers are approved. Plant-and-leave sabotage instead of hold remains a separate redesign proposal.
- **Distract:** normal travel to the reachable landing spot, then **four seconds investigating/staring on arrival**; travel never consumes this window. Face the spot, then resume saved patrol/duty. Facing-cone threats remain perceptible; damage/confirmed combat may interrupt. This is not a stun or mind control. Preserve existing eligibility/cooldown and caltrop slow unless separately changed.

Scope excludes arbitrary player attack restrictions or a global map-fog rewrite. Attacks/contact/established combat are distinct from stealth spotting. No approved omnidirectional awareness bubble may negate sneaking behind.

**Chosen initial view angle (Tim, 2026-10-27): 90 degrees total, ±45 degrees from actual simulated facing**, subject to playtest tuning. Proposed supporting tuning: steady loops/pauses and readable turning outside combat, responsive combat; exact ranges, suspicion and turn rates remain pending confirmation/playtest. This design choice does not authorize gameplay implementation.

### Hidden-status suspicion warning (agreed requirement 2026-10-27)

The circular movable/resizable Shinobi hero badge, suspicion ring and near-reveal warning are **global stealth HUD**: indoors/outdoors, day/night, with or without an active contract. They never depend on contract acceptance, business assignment or an objective. The separate contract hidden-completion bonus reads this same normal stealth state.

Replace the large Hidden pill with a compact **round icon badge**, clear hidden/seen icons/states and a circular suspicion meter. Give early warning before reveal; gently flash/pulse near the actual suspicion threshold, stopping/resetting consistently with sight break/detection and real state. **Proposed state colors:** violet hidden → amber hidden/suspicion rising → red seen only on actual detection. Threshold/flash cadence remain tuning proposals, never fake probability or altered detection timing. Preserve truthful F-ready/countdown and snuff information through a compact supplemental cue/tooltip; exact presentation is an implementation detail and must not restore the large pill. Warning is not a buff/debuff and never extends stealth/detection grace or labels a still-hidden unit as seen.

Agreed feedback requirement: visibly reflect walking versus running and entering/leaving darkness so changing concealment is readable. **Accepted compact presentation direction (Tim, 2026-10-27):** center icon remains hidden/seen; violet backplate/halo strength conveys concealment (stronger with darkness/walking/stillness, weaker with light/running), with small walk/run glyph and tooltip naming dark/lit/interior and movement conditions. Keep the outer amber/red ring exclusively for actual observer suspicion/near reveal; environmental detectability alone never implies observation. Exact colors, flash cadence and minimum size remain tuning details; accepting this presentation does not authorize gameplay implementation.

Drive concealment feedback from authoritative stealth modifiers/effective detection range, including indoor rules, running multiplier, day/night illumination and smoke/veil overrides. Respect distinct override states; no new regenerating stealth resource, probability or extra time to hide. Use modest transitions on condition changes, no perpetual motion or expanding geometry that obscures the map; retain compact round resizing/reduced motion. This adds no cone/lighting rule changes beyond the separately pending stealth rework and remains design-only pending implementation confirmation.

Register the badge with the existing HUD layout editor so it is movable/resizable using normal persist/reload/reset mechanisms. Preserve saved layouts; do not create separate controls or overwrite personal `ui_layout.json`. Keep the circle round on resize, with a useful minimum icon/ring size, coherent icon/border scaling and viewport clamping. Respect reduced-motion preferences and keep state readable through icons as well as color.

Use actual simulated facing, 90-degree cone, LOS, range and suspicion progress—not random probability or a UI-only reveal threshold. With multiple observers show the highest imminent detection progress, never an average that hides danger. Clear/decay consistently with real sim suspicion after sight breaks. No warning through walls/outside valid detection conditions. The warning must not expose unseen guard identity, position or cones beyond the information intentionally afforded by suspicion itself.

Replicate source warning state to its owning clan only; never show rival-private detector data. Render only draws. Optional advance proximity/cone “at risk” hint from already visible guards remains a proposal, not required omniscient warning. No numeric suspicion timing is newly approved; implemented S1–S2 values/checks below now govern; visual review remains pending.

### Hidden-completion Renown bonus (design updated 2026-10-27)

Renown bonus type and hidden-at-completion eligibility are agreed design; implementation still awaits confirmation. Initial implemented tuning: **25% for scout/mark/steal infiltration jobs**, under Tim's authorized conservative defaults:

- Add 25% of the accepted locked contract Renown, rounding once at payout. No extra ryo bonus or separate season-point award.
- Eligible jobs remain infiltration-only: scout/mark/steal, excluding boss/bandit jobs.
- Check the actual objective-completing participant's normal hidden state at the actual objective/site at **final completion**. Earlier detection or combat/defender damage never permanently disqualifies: regaining stealth before finishing can qualify. Allowed smoke/veil hidden states apply; no never-fought rule or minimum hidden seconds. An unrelated hidden unit elsewhere cannot qualify the job.
- For multi-stage jobs, check final actual objective completion, not an earlier plant or scouting-progress stage.
- Visible completion earns normal base ryo/Renown only. Pay the hidden-completion bonus once on accepted locked Renown and show an honest hidden-completion eligibility cue, not a historical clean/compromised label.

Illustrations using base rewards only: scout 15 → 19, steal 25 → 31, mark 30 → 38. Actual scaled accepted reward governs, not these examples.

### Implementation checks and pending Tim review

- [x] Implemented authorized bonus tuning/job scope, forward-facing LOS/suspicion and predictable patrol/entrance behavior; reported S1–S2 checks passed.
- [x] Verify the 90-degree total cone (±45 from actual facing), behind/ahead and boundary cases, walls/cover, suspicion/walking and readable patrol turns without changing established-combat response.
- [x] Verify HIDDEN during buildup, warning matches real progress/LOS break and highest of multiple observers, SEEN only on actual reveal, no private-detector leakage and preserved F readiness.
- [ ] Verify no-contract street and interior warnings, round badge icons/state/ring, near-reveal pulse/reset and reduced-motion readability; move/resize with round aspect/minimum size/viewport clamp, saved-layout persistence/reload/reset and preserved F/snuff access. Tim visual check remains pending; no browser test run is claimed.
- [ ] Verify walking/still versus running concealment cues, dark/light transitions, indoors and smoke/veil overrides; environmental feedback stays independent of the actual-suspicion danger ring. Tim visual review remains pending.
- [x] Verify Distract travel plus four full arrival seconds, facing, duty resumption, threat/damage interruptions and preserved cooldown/eligibility/caltrop behavior.
- [x] Verify spotted earlier then rehidden finish qualifies; visible finish gets base only; unrelated hidden units cannot qualify; earlier defender damage alone does not disqualify; final-stage/site participant check; allowed smoke/veil; one accepted locked-reward payout with rounding/scaling, honest eligibility cue and no extra ryo/direct points.


Watch support/Extraction removal and sabotage hold replacement remain separate proposals. Implementation/check status is reported in the subcheckpoints below; S1–S2 implementation/sim checks are complete, with visual/layout checks pending.

### Stealth/HUD S1 subcheckpoint (2026-10-27)

Build coordinator reports perception/patrol/Distract implementation and focused checks passed; the full Ninja rerun subsequently passed in S2 below. Overall Stealth/HUD is implemented/sim-checked; visual/layout playtest remains pending.

`perception.js` uses a ninety-degree forward cone with inclusive ±45-degree boundaries and raw-segment opaque-blocker LOS. Game geometry supplies street buildings, interior blockers and closed interior doors. `stealth.js` uses per-observer 1.2-second suspicion, decaying two ticks per tick after sight loss. Owning-unit summary exposes highest active observer only, so no through-wall warning; known-visible observer summaries support HUD without hidden detector IDs. Indoor walking range two/running four; street dark two/lit five and running multiplier two remain. Veil/smoke/lantern reveal behavior is preserved.

Patrol guards follow deterministic sequential waypoints with fixed three/3.5/four-second pauses by ID. Patrol/investigation turns use forty-five degrees per 0.1 seconds; combat/pursuit remain responsive. Starting spots are deeper (3.5 maximum), facing inward. `distraction.js` shares guard/police/bandit behavior: travel timeout twenty seconds, then four full investigation seconds on arrival facing the spot. Combat/damage interrupts and saved orders resume; patrol pauses during distraction. Existing eligibility/caltrops remain.

`game/tools/test_stealth_perception.mjs` passed cone/LOS/warnings, multiple observers, movement/light, veil and Distract travel/arrival duration. Shinobi combat, geisha and police checks passed after fixtures were aligned to suspicion/actual visible threats. An initial gradual-turn change slowed pursuit and failed police arrest; restricting turns to patrol/investigation restored passing police checks. Ninja full integration and S2 badge/bonus/quiet-work subsequently passed as recorded below; no commit/push requested.

### Stealth/HUD S2 completion checkpoint (2026-10-27)

Build coordinator reports S1–S2 implemented/sim-checked. `hiddenProgressRate` two doubles scout/plant/hold/stash work only while the actual participating actor is hidden. Accepted `hiddenBonusShare` 0.25 is locked: final actual site participant hidden on scout/mark/steal awards rounded 25% bonus Renown once, without extra ryo/direct points. Earlier detection/combat does not disqualify; unrelated hidden units cannot qualify. Resolve actual stealth before completion to prevent stale awards. Visible completion gets base only; tracker uses `hiddenEligible` cue.

`stealth_badge.js` replaces the old pill/updater with a global 64-pixel round hidden/seen eye badge. Actual suspicion drives its ring; amber pulse starts at 65% with one-second cadence, SEEN only on actual reveal. Violet concealment reflects movement/light/interior/smoke/veil, with compact still/›/» glyph, F readiness/countdown and accessible tooltip/snuff information. Already-visible suspecting guards show question/progress overhead; private detector IDs are not exposed. Existing HUD registration supports scale 0.5–2.5 (32-pixel minimum), round aspect, viewport clamp, saved layout/reset and reduced motion. Personal layout file is untouched.

`game/tools/test_hidden_contract_bonus.mjs` passed final actor/earlier combat/unrelated hidden/locked rounding/single payout/no extra ryo/quiet speed and badge state/F/veil. Stealth perception, all-day contracts, refill, full Ninja, Ninja bot, Shinobi HQ raid and Shinobi combat passed. Twelve touched JS syntax and scoped diff checks passed. No browser, visual interaction or drag-layout playtest claimed. Final F bot/integration review is next; Tim visual/balance/layout review stays unchecked.

### Final follow-on status (2026-10-27)

All agreed contract/stealth/HUD implementation and final grouped sim checks passed per Build coordinator; [complete integration record](deployment_sector_plan.md#follow-on-f-final-integration-passed-2026-10-27). No browser/visual/layout testing claimed. Tim review remains pending; Watch-helper/Extraction replacement and sabotage redesign remain unapproved.
