# Rival bot clan plan

Status: built 2026-10-19 (B1-B5 in one go, Tim playtested). Code `game/src/sim/bot.js` (`createBot`, `BOT_DEFAULTS`), knobs `game/data/bots.json` (difficulty "easy" for now). See "As built" at the end.

Already decided: the bot clan starts at the izakaya; it acts only through the same sim commands as a player, with the same fog of war; territory = businesses held, most at season end wins; a War Lantern is always needed to take a rival-owned business.

## How the bot thinks (first version)

A simple rule list, checked every ~2 s, top rule first. No cheating: it only knows what its units see, plus what it remembers seeing.

1. **Defend.** One of its businesses is raided or attacked: everyone nearby goes there, the bot hero too.
2. **Hire.** Crew below cap and enough ryo (keeping a small reserve): hire at the teahouse.
3. **Expand.** An unowned business it can afford: buy it. At night, with 4+ crew and heat below Wanted: attack an unowned one (police waves) instead of waiting for the money.
4. **Raid.** 2,400 ryo plus a reserve and 6 crew: buy a War Lantern, send one crew member to scout first, then raid the player's business it thinks is weakest (fewest defenders last seen).
5. **Keep busy.** Station crew at its businesses, patrol its streets, hunt night bandits for ryo, bribe the police when heat reaches Wanted (60).

Bot crew still use the existing combat rules (auto-attack, execute aggression roll, police never auto-targeted).

## Bot hero

A leader with the hero's rules (KO not death, respawn at clinic, can be arrested). Leads raids and attacks; otherwise stays near its home business.

## Difficulty (Tim 2026-10-19: always fair, no hidden bonuses; 3 levels)

Bot hero uses the **rival_yakuza boss** sprite (Tim).

- **Easy**: thinks every ~5 s; never ambushes your crew; mostly buys rather than attacks; raids rarely; doesn't target your hero; few abilities.
- **Medium**: rules 1-5 as written, every ~2 s; ambushes your lone crew near its own turf; uses its hero's abilities; pulls hurt crew back to the clinic.
- **Hard**: reacts in ~1 s; prioritises your hero (Tim); times raids for when you're weak (hero far away, crew busy, your heat high); focus-fires; executes your downed crew when safe; remembers scouted info longer.

Knobs in a data file (tune in playtests): think interval, ambush on/off and range, raid frequency, hero priority, focus fire, retreat-to-clinic HP, memory time.

## Hiring and teahouse camping (Tim agreed 2026-10-19)

- Stationed crew attack enemy units inside the business they guard (so a bot hero hiring at your teahouse gets jumped).
- So camping can't starve a clan of crew: every clan has a **home hideout** that can't be taken in the tiny version (bot: izakaya; player: the **inn**, on the main road west of centre). You can always hire at home, but slower; the teahouse is the fast, cheap place to hire.

## Home hideout extras (Tim agreed 2026-10-19; both clans)

- **Respawn point**: a KO'd hero wakes at the hideout instead of the clinic (unless arrested).
- **Lay low**: heat cools 2x faster while the hero is inside.
- **Rest**: hurt crew inside heal slowly for free (clinic stays the fast, paid option).
- Later: a stash once inventory exists (loot, spare War Lanterns); upgrades as ryo sinks (guard, faster hiring, back exit).

## Build phases (each: game runs, Node tests pass)

- B1 Bot brain skeleton + hire + buy (sim/bot.js, data/bots.json, test).
- B2 Defend + station crew + patrol.
- B3 Night attacks on unowned businesses, bandit hunting, bribes.
- B4 War Lantern raids with scouting.
- B5 Difficulty knobs, Tim playtest and tune.

## Decisions

Answered 2026-10-19: fair play, 3 difficulties (easy no ambush; medium/hard ambush; hard prioritises your hero), rival_yakuza boss sprite.
Home hideouts agreed: bot izakaya, player inn.

## As built (2026-10-19)

- **Brain:** a client that sends the same commands as a player and sees only what its clan sees; it gives a goal up when stuck. Every `thinkSeconds` it picks one goal, in order: defend (raid on its business: boss runs to knock the lantern down, crew attack-move there or go in when the doors open), bribe at `bribeAtHeat`, revive recovered crew at the clinic, buy the dearest business it can afford, hire at home, raid, night attack on an unclaimed business, station spare crew (beyond an escort of 3, one per business), patrol.
- **Raids:** once decided the plan sticks: buy a War Lantern at the moneylender, scout by day with 1 crew (remembers defenders), raid the weakest at night, go in when the doors open, hold the back room.
- **Every `reactSeconds`:** night bandit hunting and looting, ambush of lone rival crew near its turf (medium/hard), focus fire, going for the rival boss (hard: `heroPriority`), executing downed crew when safe, hurt crew to the clinic, abilities. Its crew only fight through these explicit orders (no auto-aggro).
- **Revenge (every level):** if your boss hits its boss, or downs `revengeDowns` (2) of its crew within `revengeRange` (14) of its boss inside `revengeSeconds` (30), its boss and crew go for your boss.
- **Flee:** below `fleeHp` (0.3) its boss runs home to the hideout and rests until `restUntilHp` (0.8); crew stay. `fleeInRaid`: easy true (flees mid-raid too), medium and hard false.

| Knob | Easy | Medium | Hard |
|---|---|---|---|
| thinkSeconds / reactSeconds | 5 / 2 | 2 / 1 | 1 / 0.5 |
| attackChance / raidChance | 0.2 / 0.15 | 0.5 / 0.5 | 0.8 / 0.8 |
| raidWhenWeak, memorySeconds | no, 30 | no, 60 | yes, 180 |
| ambush (range) | no | yes (10) | yes (14) |
| heroPriority, focusFire, executeDowned | no | no | yes |
| retreatHp | 0 | 0.3 | 0.35 |
| fleeHp / restUntilHp / fleeInRaid | 0.3 / 0.8 / yes | 0.3 / 0.8 / no | 0.3 / 0.8 / no |
| abilities | R | Q E R F | Q E R F |
| aggression (crew execute chance with no enemy near) | 0.25 | 0.5 | 0.8 |

- **Hideouts:** inn (you) and izakaya (Kuroda) in `port_town.json`, business `hideout`, teahouse-style rooms. `clans.addClan` claims it; never for sale, can't be attacked or raided, no guards. Locked to other clans (2026-10-20, `businesses.mayEnter`): their units can't go in ("<clan> hideout: no way in"); police still can. `units.json` `rules.hideout` / `settings.json` `hideout`: hiring 2x slower, heat cools 2x with the boss inside, everyone inside heals 0.01 of max HP a second, a KO'd hero wakes there. Minimap letter H.
- **Backup (2026-10-20):** bot crew follow the same backup rule as everyone (`combat_spec.md`): crew within 6 join in on whoever hit their boss or a clanmate in the last 5 s.
- **Defend, knock-down:** if the boss is hit while knocking down a War Lantern, he fights back at whoever hit him (5 s window), then goes back to the lantern.
- **Three clans (2026-10-20):** Shinobi, Yakuza and Kuroda; the two you don't play are bots. Playing Shinobi (`?test=ninja`), the inn goes to a Yakuza bot clan (`bots.json` `yakuza`, ronin boss, `main.js` `botList`), with the same brain and difficulty as Kuroda. A Shinobi bot for Yakuza games is not built yet (next: `src/sim/ninja_bot.js`). The game has 3 fixed clans (Shinobi, Yakuza, Kuroda); the two you don't play are bots.
- **Tests:** `game/tools/test_bot.mjs` (incl. revenge and flee) and `test_bot_game.mjs` (15 simulated minutes).
