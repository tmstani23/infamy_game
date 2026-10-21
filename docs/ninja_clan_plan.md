# Ninja (Shinobi) clan plan

Status: phases 1-5 built 2026-10-20 (units, stealth, village and map, leader kit, contracts); see "As built". Adaptive bot contracts and difficulty profiles built 2026-10-21; see [rival AI](rival_bot_plan.md#phase-3-adaptive-ai-2026-10-21). Clan select comes with the start menu.

Source: `next_steps/feature_ideas_2026-10-20.md` in the project files (section 2 and the DECIDED notes).

Related docs: `territory.md` (one season score for all clans; the ninja village is their only territory; hidden ninja and vision), `business_raids_plan.md` (the back-room spot the mark uses), `combat_spec.md` (targeting, executes), `roadmap.md`.

## 1. What the ninja clan is

- A fully playable clan, chosen in clan select (Yakuza or Shinobi) once the start menu exists. Bots can play it too, through the same commands.
- **Contracts only:** ninja hold no territory or property and can't buy businesses. Their home is the hidden village in the west forest (`assets/environment/ninja_village` art).
- **Score:** the shared season score, from Renown: about 100 Renown = 1 point (`settings.json` `season.renownPerPoint`), the same as a teahouse.
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
- Back window entry into buildings, ninja only.
- Hidden ninja don't show even in a rival's own territory until revealed (lantern light, detection, attacking and so on; see `territory.md`).

Stealth targeting update (2026-10-21): [combat rules](combat_spec.md#now-built).

## 5. Leader kit (a strong assassin, not a weak hero)

| Key | Ability | What it does |
|---|---|---|
| Q | Shadow Step | Teleport up to 8 toward the mouse, stays hidden |
| E | Caltrops (replaced Distract) | Slows enemies within 2 by 50% for 3 s; guards, police and bandits within 6 come to look |
| R | Smoke Bomb | Cloud of radius ~4 for 6 s, 40 s cooldown. Enemies inside lose their target and can't pick one; nobody outside sees in (uses "can't target what you can't see"); ninja inside stay hidden. On drop, the leader and all ninja crew stop attacking (hit-back included) until given a new attack order, so stealth isn't broken automatically |
| F | Assassinate | Only from stealth: hidden 3+ s (smoke doesn't count). 90 s cooldown. Damage rules: [combat spec](combat_spec.md#f-hero-abilities-and-action-bar-approved-by-tim-2026-10-16-built). Reveals the ninja |

No miss/dodge yet: that comes with combat variety (`roadmap.md`).

## 6. Dropped ideas

- Watch Posts and hidden marks as ninja territory (Tim 2026-10-20): dropped. Ninja score only through Renown.

## As built (2026-10-20)

- **Units:** `ninja_leader` hero with its own numbers via `units.json` `models` (`statsOf` is model-aware); crew type `ninja` (`ninja_grunt` art), Shinobi-only hiring in the dojo or longhouse. Clan kind `yakuza` / `ninja`. Ninja crew cap from Renown (`rules.renownPerCrew` 100). Test: `?test=ninja` (`test_params.md`), `game/tools/test_ninja.mjs`. Playing Shinobi adds a Yakuza bot clan at the inn next to Kuroda (`bots.json` `yakuza`, `main.js` `botList`); Playing Yakuza, a Shinobi bot clan (`sim/ninja_bot.js`, `bots.json` `shinobi` / `shinobiLevels`, test `test_ninja_bot.mjs`) lives in the village longhouse: hires ninja at the dojo up to its Renown cap; takes contracts at the shrine from the same fair board (easy: bandits, scout, steal; medium adds mark and boss; hard prefers mark and boss); sneaks in by back windows alone (crew wait outside) and snuffs a lantern by the window at night; brings its crew to boss and bandit hunts; flees to the longhouse below 30% HP. Abilities: R below 50% HP, F when hidden 3 s next to a target, E on a fleeing hunted boss or 2 foes close, Q to close on a boss. The game has 3 fixed clans (Shinobi, Yakuza, Kuroda); the two you don't play are bots.
- **Village and map:** see `buildings.md` "Ninja village".
- **Stealth** (`sim/stealth.js`, `units.json` `rules.stealth`): hidden unless an enemy is within 2 in the dark, 5 when lit, 4 indoors, doubled while running. Revealed for 5 s when seen, hitting or hit. Snuff lanterns 3 per night (Space; they relight at dawn). Shinobi-only back windows into every business. Hidden units can't be seen or targeted; your own hidden ninja draw at 80% opacity with a slight purple shimmer. Badge: "HIDDEN · F in N" / "HIDDEN · F ready" / SEEN.
- **Leader kit:** numbers in `combat_spec.md` "Ninja leader kit".
- **Contracts** (`sim/contracts.js`, `units.json` `rules.contracts`, `state.contracts`; menu `contract_menu.js`): Space at the village shrine. 3-5 jobs each dawn; you hold one at a time and it runs until dawn; done pays ryo + Renown, failing or calling it off pays nothing; the target clan gets a warning callout.

| Job | What to do | Pay |
|---|---|---|
| Scout | Stay hidden inside a rival business for 10 s | 150 ryo + 15 Renown |
| Sabotage mark | At night, stand on the back-room spot 3 s, then keep a ninja inside 60 s (nobody inside 10 s = fail). Owner alerted at once if the planter was seen, else after 15 s; owner units on the mark 4 s scrub it. Done: that business pays 0 next dawn | 300 + 30 |
| Steal | Enter the rival hideout by its back window (only while holding the job), stand on the back-room stash 5 s: 20% of their ryo, up to 500 | stolen ryo + 25 Renown |
| Boss | Knock out the rival boss | 400 + 40 |
| Bandits | Knock out 5 bandits | 200 + 20 |

- **Fair board:** at most 2 jobs per clan (`perClan`); a clan hit by a finished contract in the last 2 dawns (`recentDays`) is drawn 1/(1+hits) as often; the season leader 2x (`leaderWeight`); taking a job swaps that clan's other jobs for other clans or the town, or drops them.
- **Renown:** 100 = +1 crew slot and 1 season point; top bar "Renown N" (ninja only).
- **HUD:** contract tracker at the top (job, what's left, "until dawn"); minimap and map ping on taking a job; callouts for done / failed, "Shinobi took a job on you", the mark alert (with a ping) and a sabotaged payout.
- **Polish (2026-10-20):** Shadow Step on a visible enemy or townsperson lands next to them with one sure crit and a big violet slash, then auto-attacks. Snuff: hover a lit lantern within 7 ("Snuff (N left tonight)"), then left-click or Space; dark purple smoke flash; the badge shows snuffs N/3 at night. Assassinate reach about 4.4, with a lunge and a thin V flash. Hidden opacity is now 0.8 (`cast_tracker.md`). Glowing mushrooms along the two village bridges (`port_town.json` `glowShrooms`): drawing only, no light or stealth effect. A harder Steal is paused (ideas in `next_steps/ninja_build_plan.md`).
- **Update 2026-10-21 (overrides older numbers above):**
  - Harder Steal: rival hideouts have patrol guards (`bots.json` `hideoutGuards`: easy 1, medium/hard 2; player clans 0). Steal takes 10 s (`rules.contracts.steal.seconds`); stepping off pauses the count; seen or not. Stash = floor spot furthest from the back window and at least 3 from the front door (`game.js` `stashOf`), violet ring shown through walls (Sabotage too). Seen inside: `stealAlert` ("A Shinobi is in your hideout!" + ping for the owner, "Spotted!" for the thief); medium/hard bots send 2 crew home. Selected crew (or crew right-clicked onto the hideout of your Steal job) climb in by the back window, up to 6. Contract done/failed callouts stay 5 s.
  - Snuff: hover measured from the lamp's glow on screen; one snuff puts out every lantern within 2.5 (`snuffArea`); only being downed cancels it. Back-window rings violet, drawn over walls.
  - Shadow Step: a target-frame target within range+1 comes first (step on, crit, auto-attack), else toward the mouse. Assassinate: frame target first, else the unit at the mouse; both can hit townsfolk and police. Assassinate cooldown 45 s.
  - FX: bigger white crit slash and Assassinate (~0.8 s), lunge streak + white V, short hit-pause on the crit. Bridge mushrooms: 42, 3 shapes, soft glow.
  - Renown: 1 season point per 50 (`settings.json` `season.renownPerPoint`), 1 crew slot per 75 (`units.json` `renownPerCrew`). Map shows "N Renown (M to next)". Shinobi appear on the results screen and can win.

Phase 3E access (Tim, 2026-10-21): all ten ownable businesses have Shinobi back-window entry/exit and reachable sabotage objectives. The interior sabotage ring appears during an active contract; Scout needs no interior circle. Business-target Steal remains deferred.

## Deferred Shinobi pass (Tim, 2026-10-21; not built)

- Proposed third southern river bridge into the village; exact placement and approaches deferred.
- Prohibit entry into rival main home bases, including contract windows. Move Steal contracts from HQs to owned businesses; design details later.
- When a contract against a clan fails, notify that clan with the contract type. Keep the initial warning generic.
- Scale contract ryo/Renown with target business strength and review Shinobi crew/season progression. Approved Steal formula: 20% of treasury, capped at 500 + 100 × target owned business score; not implemented.
- Current reveal-triggered hideout alert stays unchanged.
