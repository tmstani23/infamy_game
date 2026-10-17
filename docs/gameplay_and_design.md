# Gameplay and design

Status key: **Settled** = agreed. **Idea** = suggested, not agreed. **Open** = still to decide.

## Setting and goal (Settled)

- 1870s Japan, around the era of *The Last Samurai*: swords still on hips, old order breaking down.
- You rise from nobody to clan leader by building wealth, power and force.
- Tone: dark, lantern-lit nights in the city.

## Game shape (Settled)

- One shared, persistent city per server: **50 to 100 players** plus bot clans.
- Single player is the same game with the city filled by AI bot clans.
- **2-week seasons**: everything resets at the end of a season except cosmetics.
- Aimed at **20 to 40 minutes a day**; playing longer is allowed but pays off less.
- Anti-grind rules:
  - About **3 raid tokens per clan per night**.
  - Diminishing returns on infamy and money after a daily share.
  - Crew caps come from property held, and each extra crew member costs more to hire.
  - Raids only in a fixed night window.
  - Heat, plus an **underdog bonus** against the leaders.

## Clans (Settled)

- A clan is **1 to 5 players** sharing territory and a treasury. The boss sets each member's cut.
- Bot clans fill empty territory.

## Starting paths (Settled)

Chosen at the start of each season; switch next season. All paths compete on the same infamy board.

- **Yakuza**: starts in town. Ronin hero, thugs and brutes. Strong at holding territory and income.
- **Ninja clan**: starts in the ninja village in the forest. Ninja hero, cheap ninja crew. Strong stealth raids and assassinations, harder to hold big territory.
- **Gaijin gunrunner** (later): starts at the foreign docks. Mercenary hero, cheap riflemen and explosives.
- Non-ninja players can hire ninjas by earning the ninja village's favour through jobs.

Ideas not taken up yet: Bakuto gambling gangs, a merchant house, a specific Western nation for the gunrunner (British, American, French or Dutch).

## The city (Settled)

- About **6 districts** of about **8 blocks** each. Districts contain blocks, blocks contain businesses.
- Buildings are enterable, in the spirit of Project Zomboid. Interiors come from **type templates**, so a large city does not need every room hand-built.
- **Businesses**: teahouse (recruits crew), warehouse (storage and smuggling), gambling den (most money, most heat).
- Own every business in a block for a **block bonus** and your clan banner; own a whole district for a bigger bonus.
- **Real estate**: houses, shops, storehouses, shrines and abandoned lots are bought with money, not raided.
  - They pay rent and can each be searched once for random loot.
  - They can be converted into a safehouse, storage or a crew hideout.
  - Property in a rival's block gives a foothold and counts toward block control.
  - Prices rise in busy and contested areas.
- **Forest outskirts** ring the town: no police and no heat, bandit camps, smuggling routes, rare loot, and buildable secret hideouts. The ninja village is deep in the forest.

## Taking and holding businesses (Settled)

- Businesses are taken only by **night raid**.
- Held by stationing crew there. Stationed crew defend automatically while the owner is offline.
- A held business pays protection each cycle, plus a bonus when the hero visits.
- A business just taken stays **contested** for a counter-attack window.
- Lost when a rival raids at night and holds the back room.

## Fighting and heat (Settled)

- Fighting can happen any time: street fights, ambushes, hero duels.
- In daytime there are witnesses, heat rises fast and police arrive quickly.
- Only business capture is restricted to night raids.
- Past a heat threshold, police patrols come after you. Bribes lower heat.

## Raids (Settled)

- A raid squad is the hero plus up to **about 6 crew** and costs one raid token.
- Scout first with a lookout.
- Defenders are stationed crew plus guards. AI runs them if the owner is offline; the owner can join live.
- **Win**: hold the back room for 30 seconds. **Lose**: hero knocked out, or time runs out.
- Crew at 0 HP go down; executed = dead (rehire), otherwise carried to the hospital (`docs/combat_spec.md` H, 2026-10-17). The hero is knocked out, not killed.

## Controls (Settled)

- WASD hero, Q/E/R/F abilities toward the mouse, RTS mouse control for crew. Every key: `docs/controls.md`.

## Weapons (Settled)

Noise versus power is a choice on every raid.

- **Swords, clubs**: melee.
- **Knives**: fast, silent, throwable.
- **Bows**: silent ranged, no heat.
- **Revolvers, rifles**: strong, slow to reload, loud (heat).
- **Explosives**: black powder bombs and early dynamite. Breach walls, area damage, huge heat, friendly fire.

## Hero and crew (Settled)

- You control one hero with **4 abilities**, roaming the city GTA-style, and command a crew RTS-style. Each crew member has **1 to 2 abilities**.
- Crew types: **Thug, Swordsman, Rifleman, Brute, Lookout, Archer, Demolitions, Ninja**. Knives come as a perk.
- **Ninja**: invisible until it strikes, climbs walls, smoke bombs, shuriken. Expensive and rare except for the Ninja clan.
- Crew are RTS units, not named characters, hired at teahouses with no upkeep (decided 2026-10-16). Details: `docs/crew_recruiting_plan.md`.

## Hero abilities

- **Ronin** (Settled, built 2026-10-16): Iaido Dash, Intimidate, Rally, Red Lantern (ultimate). Numbers: `docs/combat_spec.md`, section F.
- **Ninja hero** (Settled 2026-10-15; ninja_leader concept):
  - Q **Smoke Step**: a short dash in a puff of smoke, then invisible for up to 5s; attacking or taking damage breaks it.
  - E **Sleep Dart**: a silent shot (no heat) that puts one enemy to sleep for 10s (3s on heroes); any damage wakes them.
  - R **Shadow Mark**: marks one enemy; your crew focuses it and it takes 20% more damage.
  - F **Thousand Cuts** (ultimate): blink between up to 5 nearby enemies and slash each.
- Rule for all hero abilities: they must not need new map or game systems. Numbers get tuned in playtests.
- **Gunrunner mercenary hero** (Open).

## Economy (Settled)

- One currency: **ryo**.
- Earned from protection, rent, loot and smuggling.
- Spent on hiring and replacing crew, property, unit-type upgrades (weapons, training), and police bribes. No upkeep.
- Upgrades for businesses and properties: guards, more income, escape routes.

## Inventory and loot (Settled)

- Personal inventory: **6 to 8 slots**.
- Money is banked automatically, so it is not lost to carrying limits.
- Bulky goods have to be hauled by crew or by cart.
- A **stash** for storage and a **fence** for selling stolen goods.
- **Documents** can be looted and used as leverage (blackmail, deeds, debts).

## Infamy (Settled)

- One clan score, **Infamy**, on a city leaderboard. There is no Prestige stat.
- Raised by territory, raids and intimidation.
- High infamy makes you a target: raiding a high-infamy clan pays more and steals some of its infamy.

## Night bandits (built 2026-10-17)

- Up to 6 at once and 12 a night: bandits (thug stats, about 20 ryo) and night brutes (brute stats, about 40 ryo).
- They walk in from the map edge at night, wander like townsfolk and leave at dawn.
- Neutral until hit; nearby bandits join in. No heat. They die outright, and the killer's clan gets the ryo.
- Not done yet: the "+ryo" pop-up.

## Future ideas

- Loot drops from night bandits once inventory exists.

## Open questions

- Gunrunner hero abilities.
- Money: free hobby project, or something people pay for later.
