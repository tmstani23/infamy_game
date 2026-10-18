# Businesses and raids plan

Status: agreed with Tim 2026-10-18; still evolving. Nothing built yet. The 2x map and a settings file come first. Numbers are starting points to tune in playtests.

Goal: finish the tiny version loop. You take businesses, they pay you, and you (and later the rival bot clan) fight over them.

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

- A rival-owned business can only be taken by a raid, and a raid needs a **War Lantern**: a tall red lantern on a pole with your clan crest, with a red aura.
- **Where to get it:** the **moneylender's house** (building 43 in `buildings.md`, not on the map yet), from its building panel. Until inventory exists it's a counter on your clan ("War Lanterns: 1").
- **Cost: 2,400 ryo** (2x the den). **Carry at most 1.** No per-night cap. Out of reach early game on purpose; affordable once you hold a few businesses.
- **Starting a raid:** night only. Hero at the door ring, building panel, Raid. Greyed out without a lantern.
- The lantern drops by the door and the aura starts. **Raiders can't enter for 30 s** (warm-up). Then the doors open to raiders and they must hold the back room for 30 s.
- **Joining late:** any of your crew who walk in count, up to **6 crew inside** at once (plus the hero).
- **Used up** whether the raid wins or loses.
- No police come to a rival raid (yakuza don't call the police on each other). Normal heat rules for hitting townsfolk still apply.

## 5. Defending

- **Alert:** bell sound, red banner "Your <business> is being raided", flashing minimap ping. Double-click the banner to jump the camera there (same as double-clicking a crew name).
- **Time to get there:** 30 s warm-up + the time to beat your guards/crew + the 30 s hold. Crossing the district takes the hero about 15 s (estimate).
- **Contested back room:** while any of your units stand in the back room, the 30 s hold timer pauses.
- **Knock down the lantern:** a defender channels **4 s** at the lantern; any hit cancels it (like the 3 s execute). Lantern down = raid cancelled. So you must clear or KO the attackers near the door first.
- Offline or too far away: guards and stationed crew defend on their own (AI).

## 6. Controls to add (Controls panel, ? key)

- Building panel buttons: **Buy**, **Attack**, **Raid** (moneylender's house: **Buy War Lantern**).
- **Space** at a lantern (defender): knock it down (4 s channel).
- Double-click raid banner = camera jump.

## 7. Multiplayer and bots

- Buy, Attack, Raid, Buy Lantern and Knock Down are sim commands in game/src/sim, used the same way by players and bots. The rival bot clan (next feature) uses exactly these.

## 8. Build checkpoints (each: game runs, Node tests pass)

1. Ownership + payouts at dawn + Buy button (sim + building panel + test).
2. House guards for owned businesses.
3. Attack on unowned businesses: police waves, back-room hold, heat reset +15.
4. War Lantern: buy at the moneylender's house, Raid button, warm-up, hold, used up.
5. Defending: alert banner/ping/bell, contested timer pause, lantern knock-down channel.
6. Controls panel entries + doc notes to the coordinator.

Visuals that need a preview for Tim first: War Lantern prop + aura, raid banner, back-room hold timer.

## Open (small, can decide during build)

- Payout at dawn: confirm.
- How long a newly taken business stays "contested" (no payout, guards not back yet), if at all.
- Wave count for police attacks (3 + 1 per tier is a guess).
