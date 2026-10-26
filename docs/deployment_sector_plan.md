# Phase 4: deployment, sectors and Rally

Status: agreed backbone (Tim, 2026-10-25), **not built**. Open details below require decisions before their implementation. This plan owns deployment, sector assignments/UI and deployment Rally; [businesses and raids](business_raids_plan.md#planned-shinobi-hq-raid-tim-2026-10-25-not-built) owns the Shinobi HQ raid. Deployment/sector gameplay remains deferred; the separately owned HQ raid is built and sim-checked, awaiting visual/balance review.

Build scope (Tim, 2026-10-25): only the linked Shinobi HQ raid is authorized now. Deployment Rally/reset, crew separation and sectors remain deferred. The raid owner doc records its three implemented phases and pending visual/balance playtest.

## Purpose

Keep a useful hero squad without making the full roster follow everywhere. Give spare crew local duties, retain independent group control and allow occasional large battles. Shinobi need meaningful assignments despite owning no businesses. Selection groups and deployment assignments are separate concepts.

## Shared deployment

- Hero plus at most **six assigned crew** outside deployment Rally. Numbered selection groups create no extra slots. This is **not a six-total-field cap**.
- Other crew have saved local assignments. Manual Move/Attack is allowed within their assigned sector; ordinary commands cannot take them across its boundary. Crossing sectors or joining the hero group requires an assignment-UI transfer.
- Normal group-based hero buffs affect assigned hero-group crew only, retaining each ability's range and other conditions. During deployment Rally all participating crew count as one buff-eligible group, even across separate numbered selection groups.
- Four town sectors initially use the existing quarters: Pleasure Quarter, Bund, West Ward and East Ward. Shinobi also have a village home assignment.
- Each town sector normally holds three crew. Only once the hero six and **all four town sectors** are full may additional owned crew overflow into sectors; never into the hero group outside Rally. Recruitment/cap progression still applies; assignment grants no free crew.
- Every sector always has one active assignment, including empty sectors. Temporary manual orders preserve its saved task, objective and fallback. Switching crew groups or pressing **Return to Assignment** ends manual control and returns affected crew to that assignment.

## Transfers

Transfers cannot start while the hero is in combat. Crew then physically run to the destination without automatic attacks or retaliation; they remain vulnerable. The hero may fight after initiation. Incoming hero-group transferees join on arrival, like recruits. No teleportation.

UI states: Transferring → Arrived → Starting assignment.

## Deployment Rally

Distinct from Ronin's existing combat ability. Manually select assigned groups to release their location restrictions and join the hero force for **two minutes**, with normal travel. Cooldown is **five minutes after expiry**. Survivors return to saved assignments when Rally ends; a deliberate permanent reassignment takes precedence.

An enemy actually planting a War Lantern for a formal raid resets the defender's deployment Rally cooldown. Activation remains manual; ordinary fights never reset it. This includes the planned Shinobi HQ raid.

## Shinobi assignments

One active task per sector: **Watch, Diversion or Secure Extraction**. Normal sightings/monitoring are baseline across tasks. No passive money or Renown: benefits are information, openings, escape protection and survival.

### Watch and shared sightings

Combine ordinary monitoring and contract-target priority monitoring. Alert “Enemy entered X sector”; ping map and minimap while tracked, with last position/travel direction after exit. Contract targets get a special icon/alert. Watcher groups coordinate truthful sightings across sectors.

Watchers must actually see targets under normal fog/stealth rules; no magical reveal. Live pings are intended while enemies remain tracked in the area. Loss-of-contact and marker lifetime need explicit rules before implementation. Watch reports and defends itself but does not start attacks on passing enemies; manual local attacks remain allowed.

### Manual Ambush capability

Available to assigned Shinobi groups in addition to their saved task; the hero can activate remotely. Select a group and one spotted enemy; show nearby defenders before activation. Wait for the target to be visible within the assigned area, then focus ordinary combat on it—no guaranteed instant boss kill.

States: Watching → Ambush armed → Attacking → Escaping → Watching. Allow Cancel while armed and Retreat during attack. Killing the target triggers retreat to saved fallback, ordinary attempts to regain stealth, then the saved task resumes. Unsafe conditions also abort/retreat; thresholds need tuning. One attempt disarms Ambush. It may temporarily override another sector task and restore it after escape.

### Diversion

Adult ninja geisha specialist, initially the existing standard geisha with a Shinobi recolor/subtle violet glow; a special dance animation may follow later. Manually activate a seductive dance at a chosen point to attract eligible nearby idle enemy crew/guards, opening an infiltration/ambush opportunity. Give a clear warning and player counterplay; attacking a distracted unit breaks distraction. Then escape to fallback and return to the saved task.

States: Ready → Moving → Dancing → Escaping → Returning. Hiring price, slot cost, radius, duration, cooldown, resistance/break rules and permitted targets are **unsettled**.

### Secure Extraction

Hold a chosen exit/retreat point; actively intercept enemies entering a small protection zone, pursue only on a short leash, then return. Radius/leash remain unset. States: Moving → Securing → Holding → Defending → Holding.

## Assignment UI and shared rules

Remote hero access: assign/remove individual crew, select one task and objective/fallback, transfer, return, activate/cancel. Show task, living/assigned counts, health, state, target/location and applicable buttons. Sector alerts highlight the corresponding status panel.

All rules/state live in the sim. Players, bots and multiplayer use the same commands, capacity checks and truthful clan sightings. Selection does not reveal unseen enemies. Free house guards remain distinct from hired crew and cannot join deployment Rally.

## Non-Shinobi details: proposed, not finalized

Reuse the four-sector UI with Patrol Sector, Guard Own Business (interior plus nearby exterior approach), and Hold Position/Route. Business assignment would be optional. Local defense/manual control would preserve saved tasks. **Exact task list, business-to-sector mapping/capacity and home-HQ reserves have not been individually approved.** Shared hero-six, local-sector, transfer, Rally and buff rules above are agreed.

## Decisions still needed

- Transfer combat timeout; blocked/interrupted routes, destination reservations and full-capacity races; hero KO; cancellation and failed-transfer recovery.
- Rally reset during an active Rally or overlapping raids; how participating groups and permanent reassignment are represented.
- Sector boundaries, village assignment capacity and overflow UI; local manual-order boundary handling.
- Watch detection-loss/live-ping cutoff and last-known marker duration; coordinated sightings must obey visibility.
- Ambush unsafe/retreat thresholds; Diversion balance/eligibility; Extraction radius/leash.
- Proposed non-Shinobi tasks and HQ reserve behavior; HQ raid implementation edges in its owner doc.

## Implementation checklist (unchecked: not built)

- [ ] Settle edge cases and split implementation into approved small batches.
- [ ] Shared hero-group membership, sector tasks/capacity/overflow and buff eligibility.
- [ ] Physical transfers, saved local orders and Return to Assignment UI.
- [ ] Deployment Rally timers, expiry returns and formal-raid defensive reset.
- [ ] Truthful Watch reporting and manual Ambush states/fallback.
- [ ] Diversion specialist and Secure Extraction after their tuning decisions.
- [ ] Finalize and implement non-Shinobi tasks.
- [x] Implement and sim-check the separately owned [Shinobi HQ raid](business_raids_plan.md#planned-shinobi-hq-raid-tim-2026-10-25-not-built).
- [ ] Focused sim checks and Tim's phased visual/balance playtests; no omnibus build before review.
