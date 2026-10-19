# Rival bot clan plan

Status: agreed with Tim 2026-10-19. Not built: it comes after businesses and raids, on Tim's go.

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
