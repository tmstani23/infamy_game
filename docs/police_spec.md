# Police

Status: **Built** (settled by Tim and built 2026-10-18). Numbers live in `game/data/police.json` (officer stats in `units.json` `junsa`); rules in `game/src/sim/police.js`; test `game/tools/test_police.mjs`. They are defaults to tune in playtests.

## Heat tiers (per clan)

| Heat | Tier | What happens |
|---|---|---|
| 0-29 | Quiet | Nothing. |
| 30-59 | Watched | 2 junsa patrol near the clan's last fight and attack its units when they see them fighting. |
| 60-89 | Wanted | A 4-man squad hunts the hero. Clinic prices double. |
| 90-119 | Manhunt | 6 officers hunt the hero and crew. Business payouts are cut until heat drops below 90 (a hook only so far). |
| 120+ | Most Wanted | 6 officers always know where the hero is, never give up and follow him indoors. Bribe 50 ryo. |

Heat itself (how it is gained and cools) is in `combat_spec.md`, section H. Infamy for the underdog rule is lifetime heat until the infamy board exists.

## Officers

- Junsa: 360 HP, hit for 14, run 4.8 (the hero runs 6.0). They carry a jitte.
- They fight whoever hits them first. The hero and crew never auto-target police.
- A knocked-out officer is replaced after 60 s, coming out of the HQ or the box.

## New officers

Every new officer (the first squad at a tier, officers added when heat rises, and replacements) walks out of the HQ or the box and patrols around the clan's last fight. It joins the hunt only once it sees the hero itself (within 9 steps, same floor). At Most Wanted (120+) new officers always know where he is and come straight for him.

## Losing the police (60-119 heat)

- Police only know where the hero is while an officer sees him (police sight 9; the fog sight stays 18) and for 2 s after.
- Watched officers give up beyond 12 steps. Going indoors loses them (below 120 there is no search round the door; they patrol on at once).
- Lost on the street, they search a 5-step radius for 20 s, then go back to patrolling. A blue "LOST THE POLICE" banner shows and they calm down (blue rings).
- Patrol: round the clan's last fight only while it is under 30 s old (`patrolFightSeconds`); otherwise they wander the streets from where they are in 12-step legs (`patrolRadius`), drifting back toward the HQ.
- Wanted (60-89): crew are left alone unless they fight or block the chase, so losing the hero calms the officers at once. Manhunt (90-119): crew stay targets on sight.
- Most Wanted (120+) indoors: officers fight, down and arrest everyone inside, the hero goes to jail, then they walk out.

## Arrests

- Police knock units down but never kill or execute. Downed units of a clan at 30+ heat are always arrested.
- Arrested crew go to jail at the police HQ: they stay there until bailed out (50% of the hire price, Space at the HQ, 1 and up); there is no automatic release. Bailed crew follow the hero. Jailed crew still count toward the crew cap and the hire price.
- Hero arrest: an "ARRESTING" channel (2 s, `arrestSeconds`) that only his crew can break. He is then jailed for 60 s, greyed out by the HQ door and untouchable, with a red "IN JAIL" banner and countdown. On release his clan's heat is set to 30 (the heat badge pulses "Out of jail -N") and he leaves at full HP.
- Execute and arrest channels show one labelled bar (EXECUTING red, ARRESTING blue); the health bar is no longer a channel timer.
- Each hit on police adds +10 heat.

## Bribes

At the police box (Space): each bribe removes 20 heat and costs 10 ryo x tier (Quiet 1, Watched 2, Wanted 3, Manhunt 4, Most Wanted 5). A bribe is refused if an officer hit the hero in the last 5 s.

## Rules

- Police are a sim-side clan using the same commands as bots. They target only by heat and never favour a player, so it stays fair in multiplayer.
- No police in the forest outskirts or during the night raid window (`noPoliceAreas` and the raid window are empty until those exist). Known gap: the 120+ hunt ignores no-police areas; fix when the forest is added.
- Underdog rule: the clan with the most infamy gains 25% more heat from everything.

## Map

- The police box replaces the watch post.
- The police HQ (with its jail wing) replaces the western office.
