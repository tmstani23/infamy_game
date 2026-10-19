# Businesses and raids plan

Status: agreed with Tim 2026-10-18 (map, build order and phases added the same day); still evolving. Built so far (2026-10-19): the 2x map, the settings file and checkpoints 1-3 (section 8). Numbers are starting points to tune in playtests.

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

- Three businesses for now: **teahouse**, **warehouse**, **gambling den**. They start unowned.
- Once you own one, it stays yours until someone takes it. You don't have to leave crew there.
- Every owned business comes with **2 house guards** (free, no upkeep). Crew you station there defend automatically too.
- Owning a business still gives +3 crew cap (already built) and 10-unit vision (already built).

## 2. Payouts

- Each owned business pays ryo **once per day/night cycle, at dawn** (default; Tim to confirm).
- Starting numbers: teahouse **100**, warehouse **175**, den **300**.
- The police payout cut already hooked in (Manhunt tier, see `police_spec.md`) applies.
- A gold ryo notice shows the payout (reuse the bandit ryo notice).

## 3. Taking an unowned business

Two ways, both from the **building panel** (left-click the building; already built):

**Buy** (day or night)
- Price is about 4 nights of payout: teahouse **400**, warehouse **700**, den **1,200**.
- Hero must be at the door ring.

**Attack** (night only, no lantern needed)
- Click Attack in the building panel while the hero is at the door ring.
- The owner calls the police: officers come through the door in **waves of 2**. Starting point: 3 waves, plus 1 more wave per heat tier you're on.
- **Win:** beat all waves, then hold the back room for **30 s**. The business is yours.
- **Lose:** hero KO'd (by police that means arrest, as today), or your side leaves the building.
- **Heat after a win:** set back to what it was before the attack, **+15**. Heat during the fight builds as usual, so losing leaves you hot.

## 4. Raiding a rival's business (War Lantern)

- A rival-owned business (bought or seized) can only be taken by a raid, and a raid always needs a **War Lantern** (Tim 2026-10-19): a tall red lantern on a pole with your clan crest, with a red aura.
- **Where to get it:** the **moneylender's house** (building 43 in `buildings.md`, b16 on the map, M on the minimap), from its building panel at the door ring. Until inventory exists it's a counter on your clan ("War Lanterns: 1").
- **Cost: 2,400 ryo** (2x the den). **Carry at most 1.** No per-night cap. Out of reach early game on purpose; affordable once you hold a few businesses.
- **Starting a raid:** night only. Hero at the door ring, building panel, Raid. Greyed out without a lantern.
- The lantern is planted beside the door ring and the aura starts. **Raiders can't enter for 60 s** (warm-up; `rules.raid.warmupSeconds`, 2026-10-19). Then the doors open to raiders and they must hold the back room for 30 s; the timer pauses while a defender stands in the zone.
- **Lost** if the hero goes down, nobody of yours is inside for 10 s, or the business changes owner.
- **Joining late:** any of your crew who walk in count, up to **6 crew inside** at once (plus the hero).
- **Used up** whether the raid wins or loses.
- No police come to a rival raid (yakuza don't call the police on each other). Normal heat rules for hitting townsfolk still apply.

## 5. Defending

- **Alert (built 2026-10-19):** a bell (WebAudio, no sound file) and a red banner at the top: first the doors-open countdown, then the hold time and whether the raiders are held off. Double-click the banner to jump the camera there. A red ping pulses on the minimap.
- **Time to get there:** 60 s warm-up + the time to beat your guards/crew + the 30 s hold. Crossing the district takes the hero about 15 s (estimate).
- **Contested back room:** while any of your units stand in the back room, the 30 s hold timer pauses.
- **Knock down the lantern (built):** the owner's hero stands within 1.6 of it and presses Space: a **4 s** channel (`raid.knockSeconds`, `knockReach`) that moving or any hit cancels; he doesn't auto-attack meanwhile (the channel clears his swing and locked target). Lantern down = the raid is lost for the raider. So you must clear or KO the attackers near the door first.
- **Send crew in:** right-click your own business and the selected crew go to its door, go in and hold near the entrance (station order).
- Offline or too far away: house guards and stationed crew fight on their own, and defenders in the back room pause the hold timer (built in checkpoint 4).

## 6. Controls to add (Controls panel, ? key)

- Building panel buttons: **Buy**, **Attack**, **Raid** (moneylender's house: **Buy War Lantern**).
- **Space** at a lantern (defender): knock it down (4 s channel).
- Double-click raid banner = camera jump.

## 7. Multiplayer and bots

- Buy, Attack, Raid, Buy Lantern and Knock Down are sim commands in game/src/sim, used the same way by players and bots. The rival bot clan (next feature) uses exactly these.

## 8. Build checkpoints (each: game runs, Node tests pass)

1. [x] Ownership + payouts at dawn + Buy button (built 2026-10-19). Payout at every dawn (a manual N into day counts as a dawn). Prices and payouts in `settings.json` `businesses`: teahouse 400 / 100, warehouse 700 / 175, den 1200 / 300. A rival-owned business can't be bought; payouts are 0 during a Manhunt (`police.payoutShare`).
2. [x] House guards (built 2026-10-19): 2 per owned business, unit type `guard` (thug sprite, 260 HP, hit 10). They patrol the building's rooms at a walk, pausing 3-8 s per spot, and defend on their own. They die outright; the same owner gets a replacement after 120 s (`units.json` `rules.houseGuards`). Not crew: no cap, no orders, not on the action bar. The building panel shows "Guards N of 2".
3. [x] Attack on an unowned business (built 2026-10-19): night only, hero at the door ring. After a 5 s countdown, police come through the room door in waves: teahouse 3, warehouse 4, den 6, plus 1 per heat tier (`settings.json` `businesses[kind].attackWaves`; count fixed at the start). Waves bring 2 officers, 3 from halfway (`attack.bigWave`, `bigWavesFrom`), 5 s apart, at full street HP, with no heat for fighting them (retuned 2026-10-19). Then hold the back room (radius 2.5) for 30 s; the timer runs only while one of yours stands in it and no defender does. Lost if the hero goes down (arrested) or nobody of yours is inside for 10 s. Win or lose, heat is set once at the end to the pre-attack value +15. A win gives the business, its guards and the clan banner. Numbers in `units.json` `rules.attack`.
   - Visuals: clan banner (a nobori in the clan colour, about 2.4 tall, soft glow and faint ring at its foot, swaps on owner change; `render/banners.js`), a gold claim burst, and the clan badge (crest + name) in the top bar.
4. [x] War Lantern raids (built 2026-10-19, as section 4). Crew slots by business type (`settings.json` `businesses[kind].crewSlots`): teahouse +3, den +2, warehouse +1; no hard cap (base 3 plus the sum). Test param `?rival=den|teahouse|warehouse` gives a rival clan that business. Art: `game/art/props/war_lantern.png` (a recoloured lantern_post) with a soft 1.6 s pulsing red glow and a ground ring.
5. [x] Defending (built 2026-10-19, as section 5). Test with `?raidme=den` (see `test_params.md`).
6. Controls panel entries + doc notes to the coordinator.

Visuals that need a preview for Tim first: War Lantern prop + aura, raid banner, back-room hold timer.

## 9. Territory (Tim, 2026-10-19)

- Territory = the businesses a clan holds. The clan holding the most at season end wins.
- Holding every business in one quarter (Bund, pleasure quarter and so on) controls that quarter: a small extra payout and a map tint.
- Once a business is revealed (explored in the fog), the minimap (and a full map later) shows it in its owner's colour.
- A War Lantern is always needed to take a rival-owned business, however the rival got it (bought or seized). See section 4.

## Open (small, can decide during build)

- Payout at dawn: confirmed 2026-10-19.
- How long a newly taken business stays "contested" (no payout, guards not back yet), if at all.
- Wave count for police attacks: per business + 1 per tier (retuned 2026-10-19); tune in playtests.

## Alerts (built 2026-10-19)

Top-of-screen callouts, one at a time: "<clan> boss knocked out!" and "<clan> boss arrested!" (only if visible), "War Lantern destroyed!" (defender), "Your War Lantern was destroyed" (raider). The sim pushes `state.news` (`bossDown`, `bossArrested`, `lanternDown`, `crewOut`) from `game.js` `hit()`, `police.js` `jailHero()` and the knock in `businesses.js`; `main.js` `callout()` queues them into `#callout`.

TODO (2026-10-19, document when confirmed): the lantern now disappears when the doors open, and a "back room contested" alert was added (businesses thread's last changes).
