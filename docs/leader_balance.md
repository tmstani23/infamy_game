# Leader balance and comeback (important mechanic, needs balancing)

Status: built in phase 6 (Tim 2026-10-29). **Watch this in every playtest**: it decides whether matches snowball or stay close. Code: `sim/leader.js`; numbers in `game/data/settings.json` `leader` and `crew`.

## Leader

- The leader is the clan with the top season score, at least `leadMargin` (2) points ahead. Any clan can be the leader.
- Bots go after the leader first; the Shinobi bot weights contracts on the leader x1.5 (`rival_bot_plan.md`).

## Bounty for hitting the leader (`leader`)

| Who earns | Action | Ryo | Key |
|---|---|---|---|
| Property clans | War Lantern raid on a leader's business | +300 | `raid` |
| Property clans | Shakedown on a leader's business | +100 | `shakedown` |
| Any clan, if the Shinobi lead | Shinobi HQ raid | +300 | `shinobiHQ` |
| Any clan, if the Shinobi lead | Shinobi boss knocked out | +150 | `shinobiBoss` |
| Any clan, if the Shinobi lead | Each Shinobi crew downed | +25 | `shinobiCrew` |

Shinobi never earn the bounty (they have their own contract bonuses).

## Underdog help (`leader`)

A clan at or below 60% of the leader's score (`underdogShare`), once the leader has 4+ points (`underdogMinScore`), hires 25% cheaper (`underdogHireDiscount`) and respawns 30% faster, hero included (`underdogRespawnFaster`).

## Crew cap (`crew`)

Cap = min(`maxCrew` 20, `baseCap` 6 + `capPerDawn` 1 x (day - 1) + business slots or Renown slots). No separate bonus cap. Why (2026-10-29): 20 business slots in town and uncapped Renown slots let crews reach 29-35 by day 5-7. A bot with no property rebuilds to 6 crew to raid back.

## Planned (Tim 2026-10-30, phase 8, not built)

- Business revenue -40% with diminishing returns after the 4th (10% less each, floor 60%).
- Property clans earn Renown toward season points at 50 Renown = 1 point (+40 raid win, +20 Shakedown, +15 stopping a Shinobi job, +5 sector clear).
- Shinobi alert window: at least 75-80 s left after the owner is warned.
- One raid per rival per night.
- Details: `business_raids_plan.md`, `ninja_clan_plan.md`; checklist `playtest_followup_plan.md` phase 8.

## Needs balancing / watch in playtests

- Does the leader still win too easily, or does the pile-on make leading pointless?
- Bounty sizes against business payouts (teahouse 200 up to 800) and hire prices.
- Underdog thresholds: 60% share and the 4-point start.
- Crew sizes by day 3, 5 and 7 for each clan; is 20 the right ceiling?
- Deferred: police heat scaling for the leader.
