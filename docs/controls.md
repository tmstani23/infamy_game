# Game controls

Service access (Tim, 2026-10-21): eligible own crew provide presence for clinic heal/revive, police bribe/bail, shrine contracts, business purchases and War Lantern actions. Select crew at the service, then Space or the building panel's Open menu. Recruiting still requires the hero physically inside. Revived and bailed crew follow their leader.

What works in the game now (updated 2026-10-21). Keep this file up to date whenever a control is added or changed.

## Hero

| Key | What it does |
|---|---|
| W A S D | Move, relative to the screen |
| Shift (hold) | Walk instead of run |
| Space (or Enter) | Go through a door (enter or leave a building); selected crew come along, the rest stay. At the clinic ring it opens the clinic menu (1 heals, 2 and up revive); at the police box (blue ring) it bribes; at the police HQ it pays bail (1 and up; jailed crew stay in jail until bailed) |
| Left-click a building | Show the building panel. At the door ring it has Buy (unowned business), Attack (unowned, night only), Raid (rival-owned, night only, needs a War Lantern) and, at the moneylender (M on the minimap), Buy War Lantern |
| Right-click a bandit's body | Walk over and loot its ryo (WASD cancels) |
| Space by a raider's War Lantern | Knock it down (4 s channel; moving or a hit cancels). Raid warm-up is 60 s |
| Double-click the red raid alarm | Camera to the raided business |
| Click the red lantern bar | A rival is knocking down your War Lantern (4 s): target him (any hit stops his channel) |
| Hideouts | Your inn and the rival's izakaya (H on the minimap) are locked to other clans ("<clan> hideout: no way in"); police can still go in |
| Right-click a unit | Hero locks on and swings within 2.5 steps (no chasing); available selected crew assist. On a downed target he executes. During execution, right-click attacks command selected crew only |
| Tab | Target the nearest enemy and start the auto attack; Tab again cycles (skips townsfolk, crew and downed units). Whoever is knocking down your War Lantern comes first. Available selected crew assist; an active execution continues |
| Left-click an enemy | Target it (blue) and show it in the target frame (top middle). Left-click or drag anywhere else drops the target and stops the auto attack |
| (no target) | The hero doesn't pick fights (2026-10-19): he swings only at his locked target (Tab or right-click), or hits back at whoever hit him in the last 5 s if in reach. |
| Q | Iaido Dash: dash toward the mouse, cutting every enemy passed (8 s cooldown) |
| E | Intimidate: enemies within 4 steps deal 30% less damage for 5 s (14 s) |
| R | Rally: crew within 8 steps attack 30% faster and heal 15% over 6 s (20 s) |
| F | Red Lantern (ultimate): 8 s of 50% more damage, healing 20% of damage dealt (60 s) |

The action bar at the bottom shows the hero's health, the basic attack and the four abilities with their cooldowns (hover a slot for what it does), active buffs above it, and a health pip for each crew member on the left. Click a crew name there to add or remove them from the selection (no Shift needed); double-click selects only that crew member and jumps the camera to them until the hero moves or uses a door. Crew pips show their control-group number. Jailed crew show as blue pips: click one for "In jail: bail N ryo at the police HQ", double-click to jump the camera to the HQ. A blue ‖ on a name means that crew member is passive (Z). The target marker is blue and turns red while the hero attacks; crew targets get a smaller red marker. Units hidden in the fog can't be targeted.

## Hiring crew (inside a teahouse)

| Key | What it does |
|---|---|
| H | Open or close the hire panel. Also works in your hideout (the inn), at half speed; the hideout also lets heat cool 2x with your boss inside, heals everyone inside slowly, and is where your KO'd hero wakes |
| 1 / 2 / 3 (or click the price) | Hire a Thug / Brute / Swordsman |
| Esc | Close the panel |

The top-left line shows your crew count / crew cap; ryo has its own badge. New crew walk out of the teahouse door after a few seconds.

## Crew

| Input | What it does |
|---|---|
| Left-click a crew member | Add or remove them from the selection (sticky; clicking a building or the ground keeps it) |
| Left-drag a box | Select exactly the crew inside it (the rest are dropped; an empty box changes nothing) |
| C | Select all your own crew, including crew inside buildings |
| Ctrl + 1–4 | Assign selected crew to an exclusive control group, replacing that number's membership and transferring crew from other groups. Reassign exactly the same members to the same number to dissolve it |
| 1–4 | Recall a group selection without changing orders; open clinic, police, contract and hiring menus take priority |
| Esc | Clear selection and hero attack/loot actions; cancel hero execution. Menus close as before |
| Right-click the ground | Send the selected crew there |
| Right-click your own business | Selected crew go in and patrol/defend; see [indoor patrol rules](crew_recruiting_plan.md#phase-3c-indoor-patrols-tim-2026-10-21) |
| Ctrl + right-click the ground | Station the selected crew there (they hold that spot) |
| Right-click your hero, or V | Selected crew follow you; outdoor Follow does not recall indoor crew |
| Ctrl + right-click a unit | Selected crew only attack it, or execute it if downed; empty selection does nothing |
| Ctrl + right-click a bandit's body | The nearest selected crew member loots it; empty selection does nothing |
| T | With the hero outdoors, broadcast an attack to outdoor crew, selected or not; indoor crew keep their duties. T again restores the broadcast squad's previous orders. Does nothing with the hero indoors; use selected crew commands inside |
| Z | Selected crew stop and stay passive (even when hit) until any new order; the crew panel shows "Passive (stopped)" |
| X, then left-click the ground | Attack-move: go there and fight anything on the way |
| Left-click a townsperson | Show them in the target frame |
| G | Selected hurt crew walk to the clinic and heal (0.2 ryo per missing HP; street only) |

Phase 3A (Tim, 2026-10-21): crew locking, L and padlocks are removed, including automatic locking on business entry. Clicks, drag selection, C and Esc keep assigned groups; dead or removed crew are pruned. Crew already indoors can be selected and commanded when the hero enters after them.

Phase 3B (Tim, 2026-10-21): hero right-click/Tab assistance uses only explicitly selected available crew and preserves independent T/Ctrl targets. Switching selection/groups and attacking with another squad keeps the previous squad's attack. Follow affects selected crew only; Ctrl commands never fall back to the hero or all crew. Execution protection: [combat rules](combat_spec.md#h-downed-execute-and-hospital-approved-by-tim-2026-10-17).

The crew command strip above the crew pips has buttons that do the same as their keys: V follow, T attack, Z stop, X attack-move, G clinic, C select all; each greys out when it would do nothing. Selected crew have a green ring under them. New crew follow you automatically. Selected crew can enter with you. Exit and patrol behavior: [indoor crew rules](crew_recruiting_plan.md#phase-3c-indoor-patrols-tim-2026-10-21). Mouse crew orders work indoors too (2026-10-18). A door ring flashes teal while your crew are inside.

Crew don't pick fights (2026-10-19): they fight on an attack order or T, an attack-move (X), or while stationed in a business; otherwise they only hit back at whoever hit them in the last 5 s, or back up (crew within 6 steps join in on whoever hit you or a clanmate in the last 5 s; not crew stopped with Z or on a move order). Inside a raided or attacked business everyone fights. Only an explicit selected move to the street brings indoor crew out from outside; move them out before attack or clinic orders. The building flashes when crew go in or come out. Health bars show over enemies (red) and over your hurt units (green). Damage numbers pop up on every hit: white on enemies, red on yours, big gold with "!" for critical hits (10% chance, double damage).

Crew at 0 health go down (red ring under them). An enemy can execute them (dead, rehire them). Ground timing and active channels: [combat rules](combat_spec.md#h-downed-execute-and-hospital-approved-by-tim-2026-10-17). Crew taken to the clinic stay until you pay at its menu: 25% of the hire price once recovered (30 s thug, 45 s brute/swordsman), 50% before that (2026-10-19). The crew pip tooltip says recovering or recovered. A beaten hero is knocked out and wakes at your hideout after 20 seconds (unless arrested). The clinic only serves someone not hit for 5 s: the clinic menu waits, and crew sent with G wait at the door.

For testing, see `test_params.md` (`?test=bot`).

## Screen layout

The unit frames (your frame and the target frame, small squares top middle under the alerts) each have a lock icon to move and resize them; click the target frame to move the camera to the target. Click the lock icon to unlock the HUD, then drag panels and resize them by the gold corner. Reset layout puts everything back. The layout is saved in `game/data/ui_layout.json`.

## Camera and view

| Key | What it does |
|---|---|
| Arrow keys | Pan the camera around, anywhere on the map (it stays there until you snap back) |
| Home, or the "Back to hero" button (bottom right, shown while panned) | Snap the camera back to your hero |
| Mouse wheel, or = and - | Zoom in and out |
| N (dev only) | Switch between day and night (in the sim; townsfolk follow). The button shows the time until the next automatic flip |
| M, or the Map button | Open or close the full game map (Esc closes it too): territory, businesses, police, units, quarters, season score. The game keeps running. Click a spot to move the camera there |
| Shinobi: H in the village dojo or longhouse | Hire ninja crew (J on the minimap is the dojo) |
| Shinobi: hover a lit lantern within 7, then left-click or Space | Snuff it and every lantern within 2.5 ("Snuff (N left tonight)"; 3 per night, badge shows N/3; they relight at dawn) |
| Shinobi: Space at the village shrine | Open the contract board |
| Shinobi: Q E R F | Shadow Step (on a visible enemy or townsperson: lands next to them with a sure crit, then auto-attacks), Caltrops, Smoke Bomb, Assassinate (reach about 4.4, 45 s). Q and F use the target-frame target first (see `ninja_clan_plan.md`) |
| Shinobi: right-click the business of your active contract | Selected crew climb in by the back window (up to 6); rival HQs are off-limits |
| K, or the Mute button | Mute or unmute sounds |
| Mouse at the screen edge | Pans the camera once it is off the hero (not while it follows the hero); Home goes back |
| F3 (dev only) | Show footprint outlines (debugging) |
| P | Show or hide the FPS readout |
| ? or the Controls button | Open the controls panel (Esc closes it) |
| Minimap: left-click or drag | Move the view, anywhere on the map. Businesses show as letters: W warehouse, T teahouse, D den, C clinic, P police, M moneylender, H hideout, J dojo. A business letter fills with its owner's colour once explored (your own always) |
| Minimap: right-click / Ctrl + right-click | Send selected crew there / station them there |

Phase 3G hover labels (2026-10-21): visible units have a small translucent tooltip, suppressed for the targeted unit or while hovering UI.

## Planned (not built yet)

- Clicking action bar slots (keys only for now).
