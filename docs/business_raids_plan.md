# Businesses and raids plan

Status: agreed with Tim 2026-10-18 (map, build order and phases added the same day); still evolving. Built so far (2026-10-19): the 2x map, the settings file and checkpoints 1-3 (section 8). Phase 1 expansion and balance approved and visually playtested by Tim 2026-10-21; targeted Node checks passed. Later camps/rewards, targeting changes and unfinished UI tweaks are outside this Phase 1 record.

Goal: finish the tiny version loop. You take businesses, they pay you, and you (and later the rival bot clan) fight over them.

## 0. Build order (Tim, 2026-10-18)

1. **Bigger map** (section 0a). Moved first by Tim 2026-10-18.
2. **Game settings file**: one data file for police count, bandits, day/night length, townsfolk count and costs (later a settings menu before a game; a multiplayer host picks from the same settings).
3. **Businesses and raids** (this plan, sections 1-8).
4. **Rival bot clan**, using the same commands (plan: `rival_bot_plan.md`, not built).

## 0a. Bigger map (Tim OK'd layout v2, 2026-10-18)

- Sketch: [map_2x_sketch_v2.png](images/map_2x_sketch_v2.png) (top-down, north up, water south). Hand-made, not generated; later districts are their own hand-made data files joined by road edges, with the rickshaw station as paid fast travel.
- About **2x area**: town ~100 x 90 (today 72 x 67), forest ring ~2x. Run across town ~17 s.
- Laid out like a real 1870s port town: **the Bund** (docks: warehouse, rice storehouse, fish market, dock warehouse, piers, boatbuilder), **modern quarter** (police HQ, customs house, telegraph office), a bending **main road** (inn, pawnshop, shop, sake brewery, police box, rickshaw station), a walled **pleasure quarter** with one gate and a plaza in front of the den (den, teahouse, geisha house, kabuki theatre, food stalls), a **canal** with 5 bridges (chokepoints) and the **back alleys** beyond it (tenements, abandoned house, bathhouse), **temple hill** (temple up steps, manor, shrine, clinic), ragged forest edges (bandit camp, forest hut, trails west/east/north).
- Buildings stay square to the camera; streets, canal and edges bend.
- **Rival clan starts at the izakaya**, so the den starts unowned (race to buy or attack it).
- Townsfolk ~30 instead of 20 (a setting).
- New buildings need cutting into game/art first (tools/cut_environment.py).

### Phase checklist (small phases, usage is low; tick as each lands)

- [x] S1 Settings file (done 2026-10-19): `game/data/settings.json` holds townsfolk, bandits, police officers per tier, jail, bribe, heat, costs, crew cap and `dayNight` (auto: 240 s day, 360 s night). A manual N into day counts as a dawn (payouts at dawn).
- [x] M1 Cut the new buildings into game/art + cutouts.json (Sonnet thread).
- [x] M2 New ground: shoreline, Bund boardwalk, piers, canal + bridges, roads, town edge, forest ring (bounds, blockers, nav).
- [x] M3 Place all buildings, doors, props, lanterns; pleasure-quarter wall + gate.
- [x] M4 Townsfolk pois/homes, bandit edges, police patrol points, forest noPoliceAreas; 30 townsfolk.
- [x] M5 Tim playtest + tune (Tim approved the map 2026-10-19).
- Then businesses and raids checkpoints (section 8), then the rival bot clan.

## 1. Owning a business

- Ten purchasable businesses start unowned (table below). Phase 3E (Tim, 2026-10-21) adds Pawnshop, Bathhouse, Sake Brewery, Manor and Customs House from existing scenery. All support normal purchase, guards, attacks/raids, territory and AI investment. No building perks.
- Manor entrance ring is outside its courtyard fence beside the front gate (2026-10-21).
- Once you own one, it stays yours until someone takes it. You don't have to leave crew there.
- Every owned business comes with **2 house guards** (free, no upkeep). Crew you station there defend automatically too.
- Each business adds the crew capacity below; capacity does not grant free crew. Hiring venues: [crew recruiting](crew_recruiting_plan.md).

## 2. Payouts

- Each owned business pays ryo **once per day/night cycle, at dawn** (default; Tim to confirm).
- Approved Phase 3E balance (Tim, 2026-10-21); prices and dawn income are ryo:

| Business | Buy price | Dawn income | Added crew capacity |
|---|---|---|---|
| Teahouse | 400 | 200 | +1 |
| Shop | 400 | 200 | +1 |
| Warehouse | 700 | 350 | +2 |
| Gambling den | 1200 | 600 | +2 |
| Tenements | 1600 | 800 | +3 |
| Pawnshop | 400 | 200 | +1 |
| Bathhouse | 700 | 350 | +2 |
| Sake Brewery | 700 | 350 | +2 |
| Manor | 1600 | 800 | +3 |
| Customs House | 1600 | 800 | +3 |

- The police payout cut already hooked in (Manhunt tier, see `police_spec.md`) applies.
- A gold ryo notice shows the payout (reuse the bandit ryo notice).

## 3. Taking an unowned business

Two ways, both from the **building panel** (left-click the building; already built):

**Buy** (day or night)
- Prices: see the balance table in section 2.
- Hero must be at the door ring.

**Attack** (night only, no lantern needed)
- Click Attack in the building panel while the hero is at the door ring.
- The owner calls the police: officers come through the door in **waves of 2**. Starting point: 3 waves, plus 1 more wave per heat tier you're on.
- **Win:** beat all waves, then hold the back room for **30 s**. The business is yours.
- **Lose:** hero KO'd (by police that means arrest, as today), or your side leaves the building.
- **Heat after a win:** set back to what it was before the attack, **+15**. Heat during the fight builds as usual, so losing leaves you hot.

## 4. Raiding a rival's business (War Lantern)

- A rival-owned business (bought or seized) can only be taken by a raid, and a raid always needs a **War Lantern** (Tim 2026-10-19): a tall red lantern on a pole with your clan crest, with a red aura.
- **Where to get it:** the **moneylender's house** (building 43 in `buildings.md`, b16 on the map, M on the minimap), from its building panel at the door ring. Moneylender only; no Shop discount. Until inventory exists it's a counter on your clan ("War Lanterns: 1").
- **Cost: 1,200 ryo** (Phase 3D, Tim, 2026-10-21). **Carry at most 1.** No per-night cap. Out of reach early game on purpose; affordable once you hold a few businesses.
- **Starting a raid:** night only. Hero at the door ring, building panel, Raid. Greyed out without a lantern.
- The lantern is planted beside the door ring and the aura starts. **Raiders can't enter for 45 s** (warm-up; `rules.raid.warmupSeconds`; 60 s until 2026-10-26). Then the doors open to raiders and they must hold the back room for 30 s; the timer pauses while a defender stands in the zone.
- **Lost** (changed 2026-10-20): the raiding boss going down doesn't end it. During the warm-up only a knocked-down War Lantern does; once the doors are open, nobody of yours inside for 10 s in a row loses it (the screen counts it down). Also lost if the business changes owner.
- **Joining late:** any of your crew who walk in count, up to **6 crew inside** at once (plus the hero).
- **Used up** whether the raid wins or loses.
- No police come to a rival raid (yakuza don't call the police on each other). Normal heat rules for hitting townsfolk still apply.

## 5. Defending

Attack warning (2026-10-25): the owner receives an alert naming the building when a rival starts a War Lantern raid. Guard replacements arrive at dawn/dusk; see section 8.

- **Alert (built 2026-10-19):** a bell (WebAudio, no sound file) and a red banner at the top: first the doors-open countdown, then the hold time and whether the raiders are held off. Double-click the banner to jump the camera there. A red ping pulses on the minimap.
- **Time to get there:** 45 s warm-up + the time to beat your guards/crew + the 30 s hold. Crossing the district takes the hero about 15 s (estimate).
- **Contested back room:** while any of your units stand in the back room, the 30 s hold timer pauses.
- **Knock down the lantern (built):** the owner's hero stands within 1.6 of it and presses Space: a **5 s** channel (4 s until 2026-10-26; `raid.knockSeconds`, `knockReach`) that moving or any hit cancels; he doesn't auto-attack meanwhile (the channel clears his swing and locked target). Lantern down = the raid is lost for the raider. So you must clear or KO the attackers near the door first.
- **Send crew in:** right-click your own business and the selected crew go to its door, go in and hold near the entrance (station order).
- Offline or too far away: house guards and stationed crew fight on their own, and defenders in the back room pause the hold timer (built in checkpoint 4).
- **Fighting inside (2026-10-20):** everyone inside a raided or attacked business fights on their own, raiders and defenders alike.
- **Seeing a knock-down (2026-10-20):** when an enemy boss is knocking down your War Lantern, raiders see a red bar (click it to target him; any hit stops his channel), hear a bell, and a red ring fills at his feet. Tab picks him first.

## 6. Controls to add (Controls panel, ? key)

- Building panel buttons: **Buy**, **Attack**, **Raid** (moneylender's house: **Buy War Lantern**).
- **Space** at a lantern (defender): knock it down (5 s channel).
- Double-click raid banner = camera jump.

## 7. Multiplayer and bots

- Buy, Attack, Raid, Buy Lantern and Knock Down are sim commands in game/src/sim, used the same way by players and bots. The rival bot clan (next feature) uses exactly these.

## 8. Build checkpoints (each: game runs, Node tests pass)

1. [x] Ownership + payouts at dawn + Buy button (built 2026-10-19). Payout at every dawn (a manual N into day counts as a dawn). Current prices and payouts: section 2 (`settings.json` `businesses`). A rival-owned business can't be bought; payouts are 0 during a Manhunt (`police.payoutShare`).
2. [x] House guards (built 2026-10-19): 2 per owned business, unit type `guard` (thug sprite, 260 HP, hit 10). They patrol the building's rooms at a walk, pausing 3-8 s per spot, and defend on their own. They die outright; the same owner gets replacements at the next dawn or dusk (`units.json` `rules.houseGuards`). Not crew: no cap, no orders, not on the action bar. The building panel shows "Guards N of 2".
3. [x] Attack on an unowned business (built 2026-10-19): night only, hero at the door ring. After a 5 s countdown, police come through the room door in waves: teahouse 3, warehouse 4, den 6, plus 1 per heat tier (`settings.json` `businesses[kind].attackWaves`; count fixed at the start). Waves bring 2 officers, 3 from halfway (`attack.bigWave`, `bigWavesFrom`), 5 s apart, at full street HP, with no heat for fighting them (retuned 2026-10-19). Then hold the back room (radius 2.5) for 30 s; the timer runs only while one of yours stands in it and no defender does. Lost if the hero goes down (arrested) or nobody of yours is inside for 10 s. Win or lose, heat is set once at the end to the pre-attack value +15. A win gives the business, its guards and the clan banner. Numbers in `units.json` `rules.attack`.
   - Visuals: clan banner (a nobori in the clan colour, about 2.4 tall, soft glow and faint ring at its foot, swaps on owner change; `render/banners.js`), a gold claim burst, and the clan badge (crest + name) in the top bar.
4. [x] War Lantern raids (built 2026-10-19, as section 4). Crew slots by business type: section 2 (`settings.json` `businesses[kind].crewSlots`); no hard cap (base plus the sum; see [crew recruiting](crew_recruiting_plan.md)). Test param `?rival=den|teahouse|warehouse` gives a rival clan that business. Art: `game/art/props/war_lantern.png` (a recoloured lantern_post) with a soft 1.6 s pulsing red glow and a ground ring.
5. [x] Defending (built 2026-10-19, as section 5). Test with `?raidme=den` (see `test_params.md`).
6. Controls panel entries + doc notes to the coordinator.

Visuals that need a preview for Tim first: War Lantern prop + aura, raid banner, back-room hold timer.

## 9. Territory (Tim, 2026-10-19)

- Territory = the businesses a clan holds. The clan holding the most at season end wins.
- Holding every business in one quarter (Bund, pleasure quarter and so on) controls that quarter: a small extra payout and a map tint.
- Once a business is revealed (explored in the fog), the minimap (and a full map later) shows it in its owner's colour.
- A War Lantern is always needed to take a rival-owned business, however the rival got it (bought or seized). See section 4.
- Full plan for territory areas, the M game map, home-turf bonuses and the season score: `territory.md`.

## Open (small, can decide during build)

- Payout at dawn: confirmed 2026-10-19.
- How long a newly taken business stays "contested" (no payout, guards not back yet), if at all.
- Wave count for police attacks: per business + 1 per tier (retuned 2026-10-19); tune in playtests.

## Alerts (built 2026-10-19)

Top-of-screen callouts, one at a time: "<clan> boss knocked out!" and "<clan> boss arrested!" (only if visible), "War Lantern destroyed!" (defender), "Your War Lantern was destroyed" (raider). The sim pushes `state.news` (`bossDown`, `bossArrested`, `lanternDown`, `crewOut`) from `game.js` `hit()`, `police.js` `jailHero()` and the knock in `businesses.js`; `main.js` `callout()` queues them into `#callout`.

War Lantern burns out when the doors open (2026-10-19): the fight moves to the back room, so the lantern can only be knocked down during the warm-up (45 s since 2026-10-26). `raidTick` keeps `a.spot` where it stood (the alarm double-click jumps there); the bot boss goes in to the hold spot once the hold starts.

Back-room alerts (built 2026-10-19): during the hold, `raidTick` pushes `state.news` `backRoom` (`taking` / `contested`) whenever the zone changes. The defender sees "Your back room is being taken!" when raiders step onto the hold spot; both sides see "Back room contested!" when defenders step in while raiders are on it.

<a id="planned-shinobi-hq-raid-tim-2026-10-25-not-built"></a>

## Shinobi HQ raid (built 2026-10-25; playtested 2026-10-26)

A raid without permanent capture. Use normal lantern price/night rules and the existing raid sequence: enemy plants a War Lantern at HQ → alert Shinobi → normal warmup → enter and win the normal inside hold-circle contest. [Deployment Rally](deployment_sector_plan.md#deployment-rally), its defensive cooldown reset, crew separation and sectors are deferred; do not implement Rally/reset until that subsystem exists. Business capture/raid hold rules are unchanged.

Only a **successful inside hold** causes all of the following:

- Cancel any active Shinobi contract immediately, without completion reward. Contracts are unavailable for **three minutes**, then reopen automatically rather than waiting for dawn.
- Show the HQ **on fire throughout those three minutes**, ending when contracts reopen. This is suppression feedback; no extra fire damage/casualties are approved.
- Award the winning clan **two season points**, **600 ryo bounty**, plus **floor(10% of Shinobi treasury), capped at 400 ryo**. Only the theft portion leaves Shinobi treasury; no points are removed directly from Shinobi. Total cash is 600–1000 according to available treasury. Pay exactly once per victory.
- After suppression ends, protect the HQ from raids for one configured full day/night cycle, shared across both enemy clans. At current 4-minute day + 6-minute night settings this is **ten elapsed minutes**; alternating attackers cannot bypass it.

Lantern placement or failure alone grants no burning, contract cancellation/lockout, payout or points. HQ never changes owner. This provides a deterrent/comeback opportunity while accounting for lantern cost, missed business income/score and casualty/revival risk.

### Implemented behavior (2026-10-25)

Only Shinobi HQ is eligible; other HQs remain closed to raids. After warmup only the attacking clan may enter the enemy HQ, with six interior raiding crew maximum, including independent late arrivals. Defenders retain normal access. Formal raiders are exempt from HQ camping penalties during their raid. After victory, existing raiders can leave normally; new enemy entry closes. No teleport or forced ejection.

`sim/hq_raids.js` processes `hqRaidWon` before contract progression, so cancellation wins against same-tick contract completion. Suppression blocks board and number-key acceptance for 180 seconds, with tracker/board countdown and automatic reopening mid-day. Fixed tick deadlines survive serialization and manual day flips. Shared protection ends at suppression expiry plus configured day and night durations.

Persistent `clan.raidPoints` contributes to live score breakdown and final standings. Exactly-once rewards use the treasury flooring/cap above. Known, unprotected Shinobi HQs participate in business-clan bots' existing scout/budget/raid rules; Shinobi bots prioritize formal HQ defense and avoid jobs while suppressed.

The building panel exposes Raid, status, protection and rewards. Existing raid alarm/minimap behavior is reused with HQ-specific alerts/entry prompts. Fog-aware animated flames use building extras only while `suppressedUntil > state.tick`; they cause no damage.

### Playtest changes (2026-10-26)

- Victory exit: 2.5 s after a won raid (HQ or business) the raiders are put out of the building.
- Every clan sees an alert "X successfully raided Y's HQ" / "...Y's business".
- Raid fire (`render/hq_fire.js`, `shading.js`, `view.js`): Tim-approved look for the burning HQ.
- Shinobi bot: a badly hurt leader stays inside the HQ during a raid and heals to 80% (no doorway flicker).
- Shinobi bot sends all its crew to defend a War Lantern at its HQ (`ninja_bot.js`).
- Fire: flame-lick particles added (`hq_fire.js`).
- Every clan starts just outside its own HQ door (`setup_match.js`).
- Raid tuning (`units.json`): knock-down 5 s, warm-up 45 s.

### Sequential implementation phases (2026-10-25)

Completion and checks reported by Build coordinator; Tim's visual/balance review remains pending.

- [x] **Phase 1 — Raid mechanics:** formal Shinobi HQ eligibility, normal warmup, interior entry/caps, inside hold-circle contest and no permanent takeover.
- [x] **Phase 2 — Victory and recovery:** contract cancellation, 180-second lockout, exactly-once points/bounty/theft, automatic reopening and configured full-cycle shared protection starting at reopening.
- [x] **Phase 3 — Feedback and sim verification:** raid UI/status/alerts, suppression-only HQ fire and targeted sim regressions.
- [ ] **Tim visual/balance playtest:** roof flame size/placement, raid/contract HUD and gameplay balance.

`game/tools/test_shinobi_hq_raid.mjs` passed coverage for eligibility, entry/caps, contest/failure, camping exemption, cancellation ordering, lockout/UI/reopening, rewards, protection, serialization, scoring and bot attack/defense. Existing raid, defense, bot, ninja bot, ninja, building panel, crew services, territory and contract-refill regressions passed, as did syntax/diff checks. Two older fixtures were aligned with approved KO hold and explicit street-Move recall behavior. No browser tests/screenshots or new URL parameters.

Deployment Rally/reset, crew separation and sector implementation remain deferred.

Economy catch-up (2026-10-28): current dawn payouts are doubled versus the original Phase 3E table; prices/schedules unchanged. Building-defended reward is 150 ryo when an alerted owner defeats a Shinobi Sabotage/Steal attempt (job fails). Sector-cleared reward is 200 ryo when rival street presence of at least two has contested with yours and only yours remains; three-minute per-clan/sector cooldown, no passive ownership income. Source: settings rewards, contracts and sim/rewards.js. No new test run claimed.

## Planned balance changes (Tim 2026-10-30, phase 8, not built)

- Business revenue -40%. Diminishing returns: businesses 1-4 pay full, each later one pays 10% less than the one before, never below 60%, so many businesses still matter.
- Property clans earn Renown: +40 raid win, +20 Shakedown, +15 stopping a Shinobi job on your business, +5 sector clear. It counts toward season points like Shinobi Renown (50 Renown = 1 point, `season.renownPerPoint`); no crew slots for property clans.
- Raid limit: each clan may raid each rival at most once per night.
- Checklist: `playtest_followup_plan.md` phase 8.

## Leader balance (Tim 2026-10-29)

Leader bounty and underdog help: see `leader_balance.md` (important mechanic, needs balancing).

## Shakedown and Sweep rewards (approved design 2026-10-28; not built)

[Operation lifecycle/checklist](deployment_sector_plan.md#shakedown-and-sweep-plan-approved-design-2026-10-28-not-built) owns eligibility/hold/retreat. Successful Yakuza Shakedown grants immediate clan-treasury bonus and claims **50% of next actual business payout after modifiers**. No stacking attempts/claims on the same payout; zero payout leaves claim pending. Failure/abandonment grants no reward.

| Business tier | Bonus now | Theft at normal payout | Nominal total |
|---|---|---|---|
| Teahouse/shop/pawnshop | 300 | 100 of 200 | 400 |
| Warehouse/bathhouse/brewery | 275 | 175 of 350 | 450 |
| Gambling den | 200 | 300 of 600 | 500 |
| Tenements/manor/customs house | 200 | 400 of 800 | 600 |

These totals describe normal payouts, not a guarantee after payout modifiers. Exact modified-payout notation/tuning, ownership changes, competing claims and formal-raid collisions require decisions. A failed-attempt sixty-second retry lock and ownership-change claim cancellation were not individually approved.

Kuroda Sweep success pays **500 ryo total**, including generic sector-clear reward for the same clear, never 500 plus 200. Reusing existing per-clan/sector three-minute claim/cooldown is proposed anti-farming integration; generic sector-clear code is built, Sweep claim integration is not. Empty-sector eligibility/cooldown details remain open. All reward implementation/checks remain unchecked in the linked phased plan.

### Shakedown implementation status (2026-10-28)

Shakedown claims/rewards and Sweep reward integration are built; see the latest [assignment/operation checkpoint](deployment_sector_plan.md#phase-e-assignmentoperation-integration-checkpoint-2026-10-30) for patrol, guard-return and route behavior. Success grants bonus 300 for payout tier ≤200, 275 for ≤350, otherwise 200. Next positive actual payout, after modifiers, transfers floor(half) to claimant and pays remainder to owner. Zero/sabotaged payouts leave claim pending. Claim blocks another attempt; ownership change cancels it. An existing formal raid blocks Shakedown; a running Shakedown blocks raid start. Sixty-second retry lock and ownership-change cancellation are implemented initial choices, not earlier individually finalized approvals. A Shakedown hold no longer requires a living hostage, since the squad's own blasts can kill both and otherwise stall the attempt; it still requires an available capable intimidator and no defender. The hold total comes from rules, and its countdown appears through Entering, Securing, Holding and Contested phases both inside and above the business outside. Focused `test_shakedown` passed; visual/balance review pending. [Lifecycle/tuning](deployment_sector_plan.md#shakedown-implementation-checkpoint-2026-10-28).

### Sweep implementation checkpoint (2026-10-29)

Sweep rewards are now implemented locally: 500 ryo total, including any normal sector-clear 200 awarded during the operation; shared claim sequence prevents duplicate awards, and both use the same three-minute clan/sector cooldown. Initial tuning requires two encountered rival units for reward eligibility. Prior Sweep-unbuilt notes are historical design context. [Current checkpoint, tests and pending integration](deployment_sector_plan.md#sweep-checkpoint-tracking-2026-10-29).

### Treasury loss audit checkpoint (2026-10-29)

`sim/treasury.js` routes existing authoritative debits for hiring, clinic services, business purchases, police bribes/bail, contract theft and HQ theft through `debitRyo`. Exact amount/before/after/reason/source/business is recorded when supplied: transient `state.ryoLosses` clears each step, saved clan `ryoHistory` caps at twenty entries. Ryo-badge hover shows six recent debits; involuntary contract/HQ theft adds a red negative popup naming the culprit. No theft share/cap or expense rate changed.

Audit: Steal takes floor(20% of treasury at completion), capped at 500 plus 100 times victim business score; no duplicate completion debit reproduced. Five uncapped 20% losses compound to 67.2% lost. That is a possible explanation, **not proof** of Tim’s reported instant roughly 70% loss. Original incident remains unconfirmed. Sabotage skips a future payout; Shakedown diverts half a payout; neither directly debits treasury. [Initial contract-cadence tuning, check results and stale test caveat](ninja_clan_plan.md#contract-pacing-checkpoint-2026-10-29).
