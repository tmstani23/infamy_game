# Game controls

Service access (2026-10-21): eligible own crew provide presence for clinic heal/revive, police bribe/bail, shrine contracts, business purchases and War Lantern actions. Select crew at the service, then Space or the building panel's Open menu. Recruiting still requires the hero physically inside. Player clinic returns hold until explicitly ordered; see [crew rules](crew_recruiting_plan.md#player-crew-control-tim-2026-10-25).

What works in the game now (updated 2026-10-21). Keep this file up to date whenever a control is added or changed.

Start game (2026-10-22): choose clan and difficulty, then Start; [match rules](gameplay_and_design.md#starting-paths-settled). On the start screen, **Exit Game** asks the browser or app to close; if it cannot, it explains how to close the tab. Kuroda Q/E/R/F use [its own kit](combat_spec.md#kuroda-leader-kit-tim-2026-10-22); the hero table below describes Ronin abilities.

## Hero

| Key | What it does |
|---|---|
| W A S D | Move, relative to the screen |
| J / **Character** button (I or the ▦ **Inventory** button opens it at the bag; press again to close) | Open live hero stats, abilities, passives, 12 carried item slots and weapon/armor/accessory slots. Hover an equipped slot to pulse its effect on the animated hero preview. Right-click or activate carried gear to equip, or equipped gear to remove it. Supplies offers bandages and eligible War Lantern raids. [Character page](combat_spec.md#hero-character-page-authorized-2026-10-27); no multiplayer pause |
| Shift (hold) | Walk instead of run |
| Space (or Enter) | Go through a door (enter or leave a building); selected crew come along, the rest stay. At the clinic ring it opens the clinic menu (1 heals, 2 and up revive); at the police box (blue ring) it bribes; at the police HQ it pays bail (1 and up; jailed crew stay in jail until bailed) |
| Left-click a building | Show the building panel. At the door ring it has Buy (unowned business), Attack (unowned, night only), Raid (rival-owned, night only, needs a War Lantern) and, at the moneylender (M on the minimap), Buy War Lantern. At the neutral blacksmith, open Shop to buy/sell gear. |
| Space at the blacksmith / Shop marker | Open the shop: Buy and Sell tabs; hover or click an item for its detail pane; the Buy or Sell button confirms the picked item; Esc clears the pick, then closes. |
| Space at the island gate ring (campaign only; G on the minimap; the lantern post where the east trail out of town ends) | Go out to the island and back; selected and following crew come along. All your settlers (they wait inside your HQ) come along too. The gate blinks gold while the campaign goal is Leave the city. Shut in Classic. |
| Space at the Land Office (the telegraph office; campaign only) | 1 buys a founding permit (250 Renown, 8 crew and 3 businesses held; Shinobi need 1,500 ryo instead of businesses; one at a time, used up by founding), 2 hires one settler, 3 hires five. A clan holds at most 5 settlers at once (with you, waiting at HQ and signing up; bots too); both hire buttons grey out at 5. Hired settlers wait inside your HQ. Once a permit can be bought, the telegraph office blinks gold and pulses on the minimap (one callout per session); it stops when you buy the permit or open the menu. The window also shows your Influence, its tier and the next unlock (2026-11-05). |
| Click the Goal card banner (campaign) | The Goal card under the minimap shows the next campaign goal (permit, settlers, leave the city, found a town, Influence tier), with one wax seal per requirement showing its count and how to get it. Click the banner to fold or unfold the card. |
| Goals icon (印) beside Ryo (campaign) | Shows or hides the Goal card. Steps with a place pulse gold on the minimap and blink in the street: bandit camp or body, blacksmith, teahouse or dojo, free business, moneylender, shrine, telegraph office (when a permit can be bought), island gate. Shakedown and Sweep steps flash the Deployment icon, then sectors with crew, then Start Shakedown / Dispatch Sweep. At the Land Office the permit Buy and Five settlers buttons flash. The HQ blinks for 8 s when the last settler arrives. After founding, the town panel buttons and the Town icon flash for the current step. |
| Space at the island gate with more than one way out (campaign) | Gate menu: 1 Walk out (with a permit and settlers they ride in the omnibus); 2 Ride to a known site (permit and settlers; known open sites, nearest first, 5 per page; Go needs 5 settlers); 3 Rickshaw to your towns (once you have a station; uses rickshaws waiting outside the gate). With one way out, Space walks through. |
| M map → World tab, click empty ground or the Capital (test build only) | Confirm instant travel there (needs the dev frontier flag and campaign; to be replaced by real travel). |
| Right-click a bandit's body | Walk over and loot its ryo (WASD cancels) |
| Space by a raider's War Lantern | Knock it down (5 s channel; moving or a hit cancels). Raid warm-up is 45 s |
| Double-click the red raid alarm | Camera to the raided business |
| Click the red lantern bar | A rival is knocking down your War Lantern (5 s): target him (any hit stops his channel) |
| Hideouts | Your inn and the rival's izakaya (H on the minimap) are locked to other clans ("<clan> hideout: no way in"); police can still go in |
| Right-click an enemy body/nameplate/target portrait | Attack with current command group; Ctrl remains crew-only. Ground right-click moves; ally interactions remain |
| Tab | Select/cycle enemy only; does not start attacks. Explicit Tab focus takes precedence over an old attack target |
| U, or the Unstuck button | Hero only: 3 s channel back inside your own hideout (5 min cooldown; not within 5 s of a fight, during an HQ raid or in a contract objective room) |
| Left-click an enemy/nameplate | Select target. Through fog, identity persists as Out of sight using last observed data; no new unseen attack or live marker |
| (no target) | The hero doesn't pick fights (2026-10-19): he swings only at his locked target (Tab or right-click), or hits back at whoever hit him in the last 5 s if in reach. |
| Q | Iaido Dash: dash toward the mouse, cutting every enemy passed (8 s cooldown) |
| E | Intimidate: enemies within 4 steps deal 30% less damage for 5 s (14 s) |
| R | Rally: crew within 8 steps attack 30% faster and heal 15% over 6 s (20 s) |
| F | Red Lantern (ultimate): 8 s of 50% more damage, healing 20% of damage dealt (60 s) |
| B or click the item slot (right of F) | Use the first usable item carried (now bandages, count x/2). Cooldown sweep and ready flash; greyed when blocked (full HP or already bandaging); dashed empty frame when none carried. |

The action bar at the bottom shows the hero's health, the basic attack and the four abilities with their cooldowns (hover a slot for what it does), active buff/debuff icons with remaining time (hover for the full name), and a health pip for each crew member on the left. Pips are grouped by Hero/sectors/HQ/active Rally; click a header or normal pip to select that command group, replacing others; double-click selects only that crew member and jumps the camera to them until the hero moves or uses a door. Crew pips show their control-group number. Jailed crew show as blue pips: click one for "In jail: bail N ryo at the police HQ", double-click to jump the camera to the HQ. A blue ‖ on a name means that crew member is passive (Z). The target marker is blue and turns red while the hero attacks; crew targets get a smaller red marker. Units hidden in the fog can't be targeted.

The HUD score panel's day/night clock counts down to the next change.

## Hiring crew (inside a teahouse)

| Key | What it does |
|---|---|
| H | Open or close the hire panel. Inside your own hideout, click **HQ stash** for the separate 12-slot storage window; click or right-click an item to transfer it between carried inventory and stash. Hideout hiring runs at half speed; the hideout also cools heat 2x with your boss inside, heals everyone inside slowly, and is where your KO'd hero wakes |
| 1 / 2 / 3 (or click the price) | Hire a Thug / Brute / Swordsman |
| Esc | Close the panel |

The top-left line shows the active roster and unlocked cap; its hover explains occupied slots in the roster, clinic, jail, respawn and hire queue. Ryo has its own badge. New crew walk out of the teahouse door after a few seconds. At a hideout, switch the H panel to **Dismiss crew · all zones** to dismiss eligible healthy active crew from any zone; click twice to confirm and receive the listed refund.

## Deployment and sectors (updated 2026-10-27)

Rules: [deployment_sector_plan.md](deployment_sector_plan.md). Deployment is separate from selection groups; ordinary crew commands obey deployment membership and area limits, and Follow needs hero-group membership.

| Input | What it does |
|---|---|
| Toolbar **Deployment** button (Esc closes; no hotkey) | Deployment panel: counts, reserved slots, health, transfer status |
| Deployment → **While I'm away** (campaign only) | Standing orders for your lieutenant while the boss is on the island: toggles for defend, retake, shakedown, sweep, contracts and hire, plus Buy (Yakuza and Kuroda: one free business a day, keeps 200 ryo) or, for the Shinobi, Jobs (Scout or Thin out the bandits, one a day) and Steal (one Steal contract a night); all on by default, a daily budget slider (0-2000 ryo, default 600), **Keep defending when I'm back**, and the last 20 log lines. A city captain holds the HQ while you are away and stands down when you return (2026-11-05). |
| **Transfer selected crew** | Lock selected source crew; choosing labelled/map destination starts immediately. Button becomes Cancel transfer for traveling batch; traveler rows also cancel. Action-bar group-to-group pip dragging is also supported |
| **Keep at HQ ready target** / **Keep at HQ** boxes | Reserve size at HQ (default 0) and per-crew keep-home. Full-health idle surplus deploys by itself; raising the target never recalls field crew |
| M map → **Sectors** layer (Deployment menu docked) | Click sector map/tab to select its crew, flash boundary and focus synchronized roster/duty/operation controls |
| Sector desired staffing goal | Default 3; 0 disables automatic staffing there. Lowering never recalls crew; above-three staffing requires legal overflow |
| Owned-business card **Guard business** | Assign guarding for normal clans |
| Duties: task/business, optional objective/route | Apply directly, without Save. Large accepted text/glow follows authoritative success; rejection is explicit. Regular clans choose Patrol/Guard. **↩ Duty** on crew bar or **Back to duty** in map/panel restores selected/focused sector duty and selects available permanent hero-group crew, without Follow |
| Main HUD **Call Rally**; optional group setup | Reuses remembered groups (all on first use). Deployment Rally: temporary command of the called groups (no automatic Follow); panel and toolbar show time left and cooldown. On expiry non-hero-group crew walk back; **Return selected** releases early. Not the ronin's R ability |
| Shinobi: task **Ambush**, **Next enemy**, remembered-target **Arm/Cancel**, **Retreat** | Standing or one-off coordinated Ambush; works while hero KO. No target/sector dropdown required |
| Map remembered row/marker **Inspect**, target-frame **Arm/Armed-Cancel** | Snapshot identity/age only when unseen; no live HP/buffs or hidden camera jump. New targeting/Esc clears inspection |
| Contract tracker **Order sectors to hunt this boss / Cancel boss hunt** | Arm known active boss identity without prior manual selection; authoritative hunt state shown. Marker knowledge never permits an unseen attack |
| Shinobi: Watch | Automatic: crew report sightings and contract-priority pings |
| Shinobi: hire the geisha | She works on her own: charms one nearby enemy crew member or guard every 10 s, runs from attackers, fights when cornered. An attack order still works |

Global Shinobi stealth badge (2026-10-27): round eye icon shows hidden/seen, outer ring actual suspicion and near-reveal pulse, violet concealment movement/light, and compact movement/F cues. Hover for state/snuff details. Move/resize through the existing HUD editor; saved-layout/reset/reduced-motion rules apply. [Stealth/HUD behavior](ninja_clan_plan.md#stealthhud-s2-completion-checkpoint-2026-10-27); visual/layout playtest pending.

## Crew

| Input | What it does |
|---|---|
| Left-click a crew member | Select its deployment command group, replacing other groups; double-click selects individual. Ordinary selection never combines deployment groups |
| Double-click a crew name / a group header | Camera follows that crew member / that group; arrows, a map click or Home stop following |
| Left-drag a box | Select exactly the crew inside it (the rest are dropped; an empty box changes nothing) |
| Crew frame tabs 1–4 | Click selects that control group (same as 1–4); Ctrl+click puts the selected crew in it (same as Ctrl+1–4); again dissolves it |
| Shift + click a crew name | Add or remove that crew member from the selection |
| Click a group header in the Crew frame | Select that whole group |
| Home, or double-click the hero frame | Camera back to the hero |
| Drag a crew name onto another group | Transfer them (selected crew go together); they take that group's duty. Sector and Hero group targets also accept transfers. While dragging, gold = room, red = can't take them; dropping on red flashes the reason |
| Drag title bar (or the dot strip at the top) | Move the hire, clinic, police, contracts, town, towns overview, settings, stash, character and shop windows; resizing stays in Edit layout (Tim 2026-11-04). |
| C | Select hero party, or active Rally force; replace sector selection |
| Ctrl + 1–4 | Assign selected crew to an exclusive control group, replacing that number's membership and transferring crew from other groups. Reassign exactly the same members to the same number to dissolve it |
| 1–4 | Recall a numbered selection filtered by active deployment command group; manual move/attack continues, then duty; open clinic, police, contract and hiring menus take priority |
| Esc | Clear selection, returning released manually controlled sector crew to saved duty; clear hero attack/loot and cancel hero execution. Menus close as before; Ctrl behavior unchanged |
| Right-click the ground | Send the selected crew there |
| Right-click your own business | Selected crew go in and patrol/defend; see [indoor patrol rules](crew_recruiting_plan.md#phase-3c-indoor-patrols-tim-2026-10-21) |
| Ctrl + right-click the ground | Station the selected crew there (they hold that spot) |
| Right-click your hero, or V | Selected crew follow you, entering if you are inside; outdoor Follow does not recall indoor crew |
| Ctrl + right-click a unit | Selected crew only attack it, or execute it if downed; empty selection does nothing |
| Ctrl + right-click a bandit's body | The nearest selected crew member loots it; empty selection does nothing |
| T | Attack current target with the selected command group; no broadcast |
| Z | Selected crew stop and stay passive (even when hit) until any new order; the crew panel shows "Passive (stopped)" |
| X, then left-click the ground | Attack-move: go there and fight anything on the way |
| Left-click a townsperson | Show them in the target frame |
| G | Selected hurt crew walk to the clinic and heal (0.2 ryo per missing HP; street only) |

Phase 3A (2026-10-21): crew locking, L and padlocks are removed, including automatic locking on business entry. Clicks, drag selection, C and Esc keep assigned groups; dead or removed crew are pruned. Crew already indoors can be selected and commanded when the hero enters after them.

Phase 3B (2026-10-21): hero right-click/Tab assistance uses only explicitly selected available crew and preserves independent T/Ctrl targets. Switching selection/groups and attacking with another squad keeps the previous squad's attack. Follow affects selected crew only; Ctrl commands never fall back to the hero or all crew. Execution protection: [combat rules](combat_spec.md#h-downed-execute-and-hospital-approved-by-tim-2026-10-17).

The crew command strip above the crew pips has buttons that do the same as their keys: V follow, T attack, Z stop, X attack-move, G clinic, C select all; each greys out when it would do nothing. Selected crew have a green ring under them. Player recruits hold until ordered; [current crew behavior](crew_recruiting_plan.md#player-crew-control-tim-2026-10-25). Selected crew can enter with you. Exit and patrol behavior: [indoor crew rules](crew_recruiting_plan.md#phase-3c-indoor-patrols-tim-2026-10-21). Mouse crew orders work indoors too (2026-10-18). A door ring flashes teal while your crew are inside.

Crew don't pick fights (2026-10-19): they fight on an attack order or T, an attack-move (X), or while stationed in a business; otherwise they only hit back at whoever hit them in the last 5 s, or back up (crew within 6 steps join in on whoever hit you or a clanmate in the last 5 s; not crew stopped with Z or on a move order). Inside a raided or attacked business everyone fights. Only an explicit selected move to the street brings indoor crew out from outside; move them out before attack or clinic orders. The building flashes when crew go in or come out. Health bars show over enemies (red) and over your hurt units (green). Damage numbers pop up on every hit: white on enemies, red on yours, big gold with "!" for critical hits (10% chance, double damage).

Crew at 0 health go down (red ring under them). An enemy can execute them (dead, rehire them). Ground timing and active channels: [combat rules](combat_spec.md#h-downed-execute-and-hospital-approved-by-tim-2026-10-17). Crew taken to the clinic stay until you pay at its menu: 25% of the hire price once recovered (30 s thug, 45 s brute/swordsman), 50% before that (2026-10-19). The crew pip tooltip says recovering or recovered. A beaten hero is knocked out and wakes at your hideout after 20 seconds (unless arrested). The clinic only serves someone not hit for 5 s: the clinic menu waits, and crew sent with G wait at the door.

For testing, see `test_params.md` (`?test=bot`).

Nameplates (2026-10-25): L toggles them; clan units show their crest and a thin clan-colored border, police blue and civilians yellow. Sound follows the viewed camera area. Selected-target effects show duration badges on its frame; the hero portrait has a draining HP ring, numeric HP, a red hit flash and KO countdown.

## Screen layout

In blueprint interiors, Space near an internal sliding door opens/closes it; a doorway occupied by a unit cannot be closed (2026-10-24).

The minimap has an integrated footer that moves/resizes with it, with −/+ map zoom buttons. Indoors, the footer shows the building name. Hover or keyboard-focus the name for its owner and available live stats (income, crew capacity, guards and season score). The name/details hide on the street (2026-10-24).

During a Yakuza Shakedown, the business label above the building and the HUD show the operation phase and rules-based hold countdown, including while entering, securing, holding or contested.

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
| Shinobi: Space at the village shrine | Open the contract board; accept/work/finish at any time of day. Active jobs persist across dawn; tracker and viewed objective-room counters show local progress |
| Shinobi: Q E R F | Shadow Step (on a visible enemy or townsperson: lands next to them with a sure crit, then auto-attacks), Caltrops, Smoke Bomb, Assassinate (reach about 4.4, 45 s). Q and F use the target-frame target first (see `ninja_clan_plan.md`) |
| Shinobi: right-click the business of your active contract | Selected crew climb in by the back window (up to 6); rival HQs are off-limits |
| K, or Mute | Toggle saved sound mute; silences current voices too |
| Settings | Locally saved Master/Effects/Mute and Test sound |
| M map: World tab (updated 2026-11-03) | Illustrated north-up atlas with full geography and discovered features. Drag to pan, wheel or +/− to zoom; Fit island resets the view and Your location centers on you. Hover shows the named blueprint region, biome, grid square, coordinates and marked feature. Click for details or test travel in the bar above the map; no scrollbars. Own location and pins remain visible. |
| Right-click the World map | Drop a pin with a note (40 characters, max 50 pins); right-click a pin removes it. Notes appear in hover/details. |
| World atlas layer buttons | Toggle Routes, Sites & towns, Camps & ruins, Resources, Spots, Crossings & passes, Zone names, Biome tint and Grid. Spots shows discovered small resource spots; Resources shows rich deposits. Zone names labels the blueprint regions; hover always gives the region. Crossings & passes shows bridges (H), fords (X) and passes (hollow diamond), with matching key and type/ID hover. Sites, camps and resources require discovery; hollow sites are unscouted. Grid lines start hidden; adaptive rulers remain visible. |
| Island minimap | North-up island view with your 500-unit square label and the camera footprint shown as a diamond. Zoom in to see discovered resource spots within the minimap view. |
| Hover a resource spot in the world | A small twinkle and card show its kind and piece stages. |
| O | Open the town panel (needs a town; has a Governor button for the governor chat). |
| Town panel → Build bar | Choose Road, Wall, Gate, Housing, Farm, Work, Eraser or a building; drag a rectangle (a building uses the release cell), then review and confirm or cancel. Green is allowed; red shows why. Eraser previews and refunds paid costs; the hall is protected. Right-click or Esc cancels the brush; Close build bar hides the tints. |
| Click a town building, zone or resource spot | Inspect its kind and state; zones show health and spots show harvest amount, stages and your assigned workers. Esc or × closes the inspector. |
| Town panel or town hall → Train worker | Choose a quantity, review total people and ryo requirements, then confirm or cancel; training shows remaining time. |
| Town panel → Workers | View status and cargo, select individuals, all workers or a saved group, and assign selected workers to a group. Stop / stand (Z) holds selected workers. Nearby discovered resource buttons pan to the spot. The Idle tab lists workers standing, waiting for orders or stuck; select them there (2026-11-05). |
| Town panel → Workers → Jobs buttons | One button per harvest job in use (Timber, Stone, Fish, Forage, with counts). Click selects every worker on that job; Ctrl or Shift + click adds them to the selection. |
| Select workers, then right-click | Click workers to add/remove them or box-select them. Right-click a discovered resource spot to assign harvesting, or ground to move and stand. Esc clears the selection. |
| Town panel → Stock → Usage | Click a stock or Usage: one tab per resource shows stock against its cap, net change per minute and when it fills or runs out, then what is coming in and going out (averaged over the last minute) and one-time costs still to pay. The **Housing** tab shows beds used (townsfolk and workers), the next arrival or what blocks growth, houses by level with what each level needs, what housing uses, and the tier limits. Click a row to see it on the map (2026-11-05). |
| Build bar → zone buttons (hover) | Shows the zone cells remaining at this tier (green, amber when none are left) plus the zone's goods, input and upkeep needs (2026-11-05). |
| Build bar → roads | A zoned cell grows only with a road or gate within 3 cells that links back to the town hall through other road or gate cells (diagonals join). Roads not linked to the hall show orange with a ! icon while the build bar is open; hovering an unlinked road says "Roads must connect through other roads or gates to the town hall." (2026-11-05) |
| Build bar → placed buildings | Placed buildings go through build site, frame, then the finished building, like zone buildings. Their stock costs were doubled (2026-11-05). |
| Town panel or town hall card → Upgrade to … | Upgrades the town hall tier: pays the listed stock at once (needs enough people; costs are 75% of the current tier's base storage cap: Village 750, Town 2,250 each of timber, stone and goods), then a scaffold and build phases go up around the hall until it finishes. A higher tier widens the build ring (dashed circle with the build bar open) and raises zone cell, building, worker and storage limits. Hover for costs and limits. On the new tier, fireworks go up over the hall for 20 seconds (2026-11-05). |
| Town panel → Steer → Market (Village tier) | A built market sells goods above the town's keep level for ryo (about 1 ryo per goods, a little each second). − / + changes the keep level in steps of 100 (default 400). Sales show in Usage → Goods as Market sales. Idle townsfolk pay half tax (2026-11-05). |
| H (island) | Ride your horse, or call her from anywhere (no whistles): beyond whistleRange 300, stored or lost, she turns up arriveDistance 40 away and gallops in. H no longer gets you off (the button reads "Get off (Q)" while riding). No fighting while mounted; thrown off below 1/3 health and at the gate. In the city H still hires crew. |
| Shift while mounted | Gallop (otherwise the horse trots at run speed). |
| Mount controls → Sprint / Shift | On a horse or driving a vehicle, Shift or the Sprint button toggles gallop on and off (until toggled again or he gets off). On foot, Shift still walks while held. The Shift+H button reads Mount up, or All off once the crew ride. |
| Driving a rickshaw or omnibus | The hero's vehicle trots at run speed; Sprint toggled on (Shift or Mount controls → Sprint) gallops at full speed (rickshaw 3.5x, omnibus 3x). Crew-driven and following vehicles keep full speed. |
| Gold ring (island) | Marks where Space works at each built town hall, stable and station, on the screen-down front of the building; standing in or near it shows the prompt. |
| Right-click own finished stockade | With crew selected: they go in (farther than 14 walk over first, then enter; the hero never walks by order). No selection: opens the town panel. Hit area is wider and taller than other buildings (11 each side, 12 up, 6 down world units). |
| Stockade badge | Shows Inside N / 40 · Evacuate; clicking walks everyone out. Hovering the stockade shows the same count. |
| Shift+K | Evacuates all your stockades (K alone is mute). |
| Space at a station | Picking a train calls All aboard: a gold zone (ride.zoneRadius 25) shows on the ground round the station for ride.callSeconds 10, or until the train leaves if sooner. When it ends, the hero and his standing units in the zone (on foot or horseback; not horses, vehicles or workers) board as seats allow; crew outside stay. Space during the call boards at once; leaving the zone cancels it. Horses and vehicles stay at the departure station. A board over each of your stations (island and city) lists each line's next train: time to arrival and destination, or Boarding and time to departure. |
| Hover / left-click a salute cannon | Hover shows a card with ready or seconds left; left-click fires the salute (10 s cooldown, shared with the governor's Fire a salute). Four cannons stand in a row 1.6 cells in front of the town hall, facing screen down-left; the shot is a black-powder muzzle blast (flash, flame cone, drifting smoke, ground dust). Each shot plays cannon_fire_1, 2 or 3 at random (never the same twice in a row) with slight pitch variation. |
| Vehicles following in a line | Loaded vehicles following the hero ride single file along his track. On the island, units standing on each other ease apart as in the city; the follow ring is wider on horseback. Each stays (length of the one ahead + own length)/2 + followClearance back along the trail, gallops to catch up, and never moves into the one ahead (units.json: omnibus length 7, followClearance 4; rickshaw length 5). |
| Click a vehicle | Selects it and shows it in the target frame; loaded vehicles have a 45 px click reach. A group box selects crew only and clears the target frame. Parked or taken-out vehicles pick clear spots and ease apart if they overlap. |
| Selecting crew who ride in a vehicle | Selects that vehicle instead (C, crew-panel group header, crew name, Ctrl/1–4 groups). |
| Group move order with vehicles | Vehicles line up back from the target; a moving vehicle waits rather than driving into another. Left-click on a loaded vehicle targets the vehicle, not its riders (double-click follows it). |
| Double-click a crew member or vehicle | Camera follows it until you pan, click the map or press Home. |
| Right-click a vehicle (world) | Only ever loads: selected crew within popRange 40 pop straight in (white flash, gold rings, "▲ N aboard"); crew further away walk over. A full vehicle shows a red "✕ Full". If a horse stands beside it, the click goes to whichever is nearer the pointer. The click area runs the vehicle's whole length. |
| Q (island) | With vehicles selected: unload them. Driving one: everyone steps out. On a horse: the boss gets off. Right beside an empty vehicle: the boss gets in. With a mounted crewman selected: he gets off. Crew who step out wait where they are until told to follow (V) or sent somewhere; settlers keep following. |
| Right-click a vehicle's card | Unloads it: everyone steps out and waits beside it (hover shows "⏏ Unload"). Right-clicking one rider's seat lets only him out (the hero's seat does nothing). |
| Mount cards (crew panel) | Each mounted crewman shows as "Mount · <horse>" under Frontier crew. Click selects him; right-click (or Q) gets him off and he waits there. Group headers select only the crew they show (on foot or mounted, not riders); the vehicles header selects only vehicles; the Frontier crew header selects vehicles and mounted crew. Clicking one vehicle card selects it and shows it in the target frame until Esc. |
| Worker cards | With 2+ town workers selected, each shows as a card in the selection panel (small portraits past 8); click one to select just him. |
| F3 | Frame time breakdown. |
| Shift+H (island) | Mount up: the hero group's crew get on horses (not settlers or workers); crew dismount to fight. |
| Shift+Y | Vehicles panel: your vehicles, with recall, store and take out. |
| Vehicles panel → Call | Makes that horse your mount and calls her the same way as H. |
| Hover a minimap icon | Shows the building's name. |
| Hover a train | Shows the train's card. |
| U or Unstuck (island) | Sends you to the nearest town hall, or to the capital if it is closer. |
| Q or right-click an omnibus or rickshaw | Board or deploy it (the omnibus icon flashes on hover). Omnibus: 8 seats, 3x speed, 800 health; rickshaw: 2 seats, 3.5x, 400 health. Nobody inside fights; hits land on the vehicle and everyone piles out when it is wrecked. |
| Space at a station | Rickshaw travel: pick one of your stations or the capital; instant, 2 per waiting rickshaw; refused within 10 s of a hit or with enemies within 12. From the city, use the gate menu (3). |
| Space beside your lieutenant at the island gate (campaign) | Talk to your lieutenant: what he does while you are on the island. Show me opens Deployment → While I'm away; Later closes. |
| Omnibus on the island | No drive-back action: return by driving, walking or the train. The station menu opens only at a station. |
| Space beside the old surveyor (by the Land Office door, campaign) | After buying a permit: he reports the 3 nearest open sites you have not found and tours them on the World map (Next / Back, his pick last; Show me again replays). Once per permit. |
| Place camp here (rich deposit card) | Places a work camp beside a rich deposit so its harvest is in reach (camp reach 400). |
| Buy cart (camp card) | Buys a 3rd camp cart for 150 timber and 75 goods. Two free carts per camp carry stock to the hall (60% of stock, up to 150 a trip). |
| Space at your town hall (island) | Talk to the town governor: his report, what each Focus does, and focus and initiative buttons. |
| Governor talk → Fire a salute | The 4 cannons by the town hall fire a salute (no damage; 2-minute cooldown). They also fire on the first talk after founding and after each tier upgrade. |
| O → town panel tabs | Overview (with the build bar), Projects, Steer (focus, taxes, market keep, stockade garrison, takes initiative), Governor, Stable (once a stable is built) and Workers. |
| Town panel → Steer → Stockade: Send in selected / Hero & crew / Workers / Leave | A finished stockade (4 cells) shelters up to 40 of your hero, crew and workers within range 14: they aren't drawn and heal 3x faster, and hits on them land on the stockade instead (its health shows in the Stockade row). If it breaks, everyone inside piles out. Leave sends everyone out. Double-click a garrisoned unit to jump the camera to the stockade. |
| Town panel → Steer → Governor takes initiative | Ask first: the governor only suggests and nothing is built until you press Approve. On: he zones and builds by himself, and now also trains workers when all are busy (keeping some ryo and goods), lays short road spurs that open new cells, places work camps, and sends idle workers gathering. While the hall upgrade is affordable, a reminder repeats every so often; you still press Upgrade (2026-11-06). |
| New townsfolk | A newcomer walks out of the town hall to a house, and a gold "+1 Homed" pops up where they go in (2026-11-05). |
| Stuck workers | A worker stuck for about 15 s jumps to open ground or returns to the nearest drop-off and goes idle; it then shows in Workers → Idle. Resources glow on the ground and show on the minimap at every zoom (2026-11-05). |
| Y | Open the all-towns window: sort columns and drag rows to reorder the priority list. The Need column (Urgent, High, Medium, Low, OK; hover for why) sorts worst-first. |
| Town alerts (under the big callout) | Urgent town alerts (under attack, lost a building, road blocked) and alerts from the town you stand in show on their own line; other towns fold into "Towns: N need attention". Click any to open Y with the worst towns first. On the island, city alerts stay quiet; only major capital losses show, prefixed "Capital:". |
| M map → World tab, hover or click a town | Hover shows a town card; click opens its details. |
| Settings → Save game | Save the city now under a name (any time). |
| Settings → saved games list | Load any saved clan or Classic/campaign match, or Delete a save (moves it to `saves/_trash`); dawn autosaves appear here too (newest 3 kept). |
| Settings → saved games list → Overwrite | Replace that save with the current game. Click twice to confirm (the first click shows "Sure?") (Tim 2026-11-04). |
| Start screen → Mode | Classic: the city only, with the season and Renown. Campaign (early): the city plus the island (gate, camps, towns, settlers), no season end. Chosen once per match; saves remember it (2026-11-05). |
| Start screen → Continue / Load game | Continue loads the newest save; Load game opens the saved-games list. Both need a second click to confirm (the first click arms the button; any other click disarms it) (Tim 2026-11-04). The Load list also has Delete, with an in-game confirmation (checked by Tim 2026-11-02). |
| Alt+Enter / fullscreen | Fullscreen toggle; short Escape stays with game UI only where Keyboard Lock is supported/allowed. Browser long-Escape exit remains. [Capability limits](tech_plan.md#approved-shellaudio-playtest-fixes-2026-10-27) |
| Mouse at the screen edge | Pans the camera once it is off the hero (not while it follows the hero); Home goes back |
| F3 (dev only) | Show footprint outlines (debugging) |
| P | Show or hide the FPS readout |
| Hire menu | Grid of crew cards (portrait, health, damage per second, reach, special, price, training time; number keys 1-N); hover shows full stats. Picking a card opens a bar with − / + quantity, total, Cancel and Hire N. Pages (hirePerPage 6), no scrollbar. Under the training bar the queue lists what is next (portrait, name, ×N); ✕ on an entry cancels one, Cancel training cancels the one in training, each refunding exactly what was paid. |
| Hideout → Dismiss crew | Lists every crewman from any zone and in any state (hurt, downed) and each clinic patient, each for the usual refund (two clicks); Dismiss all lets everyone go at once. Pages (dismissPerPage 6). |
| F2 | Hide all UI (panels, minimap, unit bars, selection rings, nameplates); F2 again shows it |
| Town panel ✕ (or O / Esc) | Close the town panel |
| Settings → Video | Resolution 1920×1080 (default) / 1600×900 / 1280×720 draws about that many pixels whatever the window shape; Sharp draws every screen pixel (up to 2 per page pixel); `?dpr=N` in the URL overrides. Toggles: Glow, Screen shake, Show FPS. Frame cap Off / 60 / 30. Applied live and kept in this browser (localStorage `infamy.video.v1`). |
| ` (backquote), Pause, or the Pause button | Pause / resume (single player): the game stops, menus still work |
| ? or the Controls button | Open the controls panel (Esc closes it) |
| Minimap: left-click or drag | Move the view, anywhere on the map. Businesses show as letters: W warehouse, T teahouse, D den, C clinic, P police, M moneylender, H hideout, J dojo. A business letter fills with its owner's colour once explored (your own always) |
| Minimap: right-click / Ctrl + right-click | Send selected crew there / station them there |

Phase 3G hover labels (2026-10-21): visible units have a small translucent tooltip, suppressed for the targeted unit or while hovering UI.

## Planned (not built yet)

- Clicking action bar slots (keys only for now).

## Approved playtest controls (2026-10-27)

Implemented controls are listed above. Validation/build history lives in the [deployment owner](deployment_sector_plan.md#playtest-phase-6-final-integration-passed-2026-10-27); use the [manual playtest list](deployment_sector_plan.md#tim-manual-playtest-checklist-2026-10-27) for pending visual checks.

Transfer/card follow-up (2026-10-28): destination-first **Assign crew to [ward]** offers source group, available crew/HP checkboxes, preview and **Assign selected crew**. Crew-first has no extra confirmation. Cancel physically returns crew, with pinned-HQ fallback if original group unavailable/full. Live selection cards dock inside Deployment/map, including traveler inspection, and restore HUD on close. [Rules/checks](deployment_sector_plan.md#playtest-follow-up-transfercardscleanup-2026-10-28).

Staffing/body jobs (2026-10-28): choose first ward when excess crew arrive; automatic staffing fills one ward's goal then the next cyclically. Right-click downed enemy/loot dispatches one nearest eligible worker; no selection uses viewed-place hero party before hero fallback. Worker rejoins latest peer order/duty after job. [Body-job rules](crew_recruiting_plan.md#explicit-single-worker-body-jobs-2026-10-28); [reserve/priority rules](deployment_sector_plan.md#reserve-priority-and-explicit-crew-job-follow-up-2026-10-28).

Current camera/action-bar catch-up (2026-10-28): double-click a crew pip follows that unit continuously; double-click group header follows the center of its largest nearby cluster. Pan/map click/Home ends that watch. Action-bar pips may now be dragged onto another Hero/sector/HQ group to submit the normal authoritative transfer command (Rally/medical are not drop destinations); this supersedes the earlier blanket no-transfer-drag statement for the action bar only. Deployment menu button-based flow remains.

Shakedown (2026-10-28): as Yakuza, focus a staffed sector in Deployment, choose an eligible rival business and **Start Shakedown** at night. **Recall squad** withdraws; operation state/hold progress and authoritative rejection are shown. [Rules](deployment_sector_plan.md#shakedown-implementation-checkpoint-2026-10-28). Sweep is unbuilt.

Intro music manual observation (2026-10-28): Tim reports the intro music and volume slider work well. This observation does not verify every autoplay/visibility/fade lifecycle case.

Intro music (2026-10-29): start screen streams/loops one of two tracks per load, with play/pause and saved music volume respecting master/mute. Autoplay retries on first gesture; hidden tabs pause, Start fades/relinquishes audio over 600 ms. Test presets bypassing match selection skip intro music. Coordinator reports menu-music and game-shell checks passed. Tim reports music and volume slider work well; other lifecycle cases have no manual sign-off. Originals preserved in sounds/new_sounds; runtime copies in assets/music.

Kuroda Sweep: in Deployment choose a staffed source sector, rival clan and adjacent destination, then **Dispatch Sweep** or **Recall squad**. [Rules/checkpoint](deployment_sector_plan.md#sweep-checkpoint-tracking-2026-10-29).

### Deployment layout follow-up (2026-10-29)

Fullscreen map keeps the key left and attaches a wider deployment panel flush right (420–540 px desktop); the key stays visible. **Crew & staffing / Duties / Rally / HQ** section buttons share one panel without scroll/range sliders. Previous/Next pages show six roster/inbound candidates (four on short windows), and two active transfers/remembered targets. Group/selection persists across sections; selecting a sector opens Duties, disabled for hero/HQ groups. Operation cards and primary actions are emphasized; Rally has its own status/group page.

Staffing goals live in Crew & staffing. Header shows assigned excluding travelers, incoming and goal; goals draw from ready HQ without recalling field crew. Existing transfer/accept/cancel/assignment/Rally rules remain. One own-unit roster shows cached portrait/name/HP/status while docked: duplicate own target/selection cards are suppressed, travelers appear only in the transfer list. Traveling crew is collapsed by default with its count in the summary; expanding it replaces the regular roster so the lists do not stack. Paging and per-unit cancel remain available. Enemy/remembered target inspection remains in the shared dock; ordinary world HUD restores on close. [Partial phase 2 status and reported Node checks](playtest_followup_plan.md#2-fullscreen-deployment-simplification); full memory/FPS audit remains pending.

View crew (2026-10-29): below **Select group**, **View crew** closes Deployment/map and follows only selected crew using the existing single-unit watch or largest-cluster group camera. Interior units use existing public-door camera behavior. Disabled without a viewable selection; selection, orders and assignments remain unchanged. Panel-flow coverage checks exact selected IDs, close behavior and no sim/command changes; latest coordinator run completed successfully. Syntax/diff checks reported passing. Future menu icons/Rally/Resume/timers and combined Map/Deployment button remain proposals only.

### In-game background music (2026-10-29)

**Settings → Audio:** Background music toggles playback; Music volume persists alongside existing master/mute, independent of effects volume. One streamed audio element plays the existing two tracks in shuffled cycles without immediate repeats; disabling pauses in place, enabling resumes. Hidden-tab pause, autoplay retry, bounded failed-track skipping and pagehide cleanup are implemented; map presentation does not stop music. Intro respects the saved music toggle; explicit intro Play reenables it. More tracks can be added later; no new assets in this batch. Coordinator reports passing game-music, menu-music and game-shell checks. Manual in-game listening and sound balance remain pending.

Crew pip statuses (2026-10-29): grouped crew portraits now show live per-crew duty/status text and tooltip, including medical states. Shared status prioritizes Charmed/Charming, recovery and actual operation/duty membership before generic stopped text. Nodes are reused; coordinator reports passing panel-flow stable-node/status-update and selection-panel checks. Manual Geisha playtesting remains pending; [revised Charm rules](combat_spec.md#revised-geisha-specification-implemented-2026-10-29).

Treasury/contract feedback (2026-10-29): hover the ryo badge for six recent debits; involuntary contract/HQ theft shows a negative popup naming its source. Contract board/tracker display the shared start-cooldown countdown; Take/number shortcuts wait until ready. [Audit/cadence details and limits](business_raids_plan.md#treasury-loss-audit-checkpoint-2026-10-29).

Section 3 controls (2026-10-29): compact nine-icon utility menu beside movable Ryo; hover/focus shows action, shortcut and availability. One Map/Deployment button or M opens the combined workspace; Close map/Esc closes it. Crew frames are movable/resizable at top left; group/solo/status/drag retained; abilities one row. Rally shows active/cooldown; War Lantern previews entry and uses existing command. Firefox fullscreen keyboard lock uses progressive requestFullscreen option with legacy fallback; Firefox-version/manual Esc tests pending. Coordinator reports focused UI checks passed; no browser automation or visual fit claim.

Edit layout (built 2026-10-30): **Settings → Edit layout** lets you move and resize every UI panel, including placeholders for hidden panels (`hud_layout.js` registry; the target-marker layer is excluded). Its translucent toolbar can be moved; **Grid: Off (10px)** toggles 10 px snapping for panel movement and resizing. Drag a panel to move it, drag its gold corner to resize; on text and list panels drag a left, right, top or bottom edge bar to change just the width or height (ryo, minimap, heat, icon menu, stealth badge and raid alarm keep corner-only scaling). Done saves and locks everything; Cancel or Esc restores the previous layout; Reset layout restores defaults. **Settings → Quit to game menu**: click twice to leave the match for the start screen (the match is not saved).

Responsive layout follow-up (2026-10-30): Crew commands now live in an independently resizable layout panel and use the same shared crew input actions. Roster cards, buttons, buffs, text and building details wrap; long populated panels use explicit Previous/Next paging instead of editor scrollbars. Controls pages its sections; character stats and service windows page their rows. All entries remain attached and selection is preserved. Panel height can grow to fit content; saved height is a minimum. Coordinator reports focused layout/command checks passed; narrow/tall viewport visual review remains pending.

Watch the city (2026-11-08): **Watch the city** button in Deployment → While I'm away and on the M map, available only while the boss is on the island. The camera moves to the city HQ; pan and click crew and businesses for status; no crew orders. Return with the gold Return to hero banner, Home or Esc; it returns on its own if the boss is hit. Code: `src/city_watch.js`; test `tools/test_city_watch.mjs`.

Out on the island (2026-11-08): the boss can't give city crew orders or use Deployment (transfers, staffing, Keep at HQ, reserve target, first zone, Rally); a notice says the lieutenant runs the city. The lieutenant's own commands still run. Orders to crew out on the island work. The map and the Deployment panel stay open to look at: the order tabs (Duties, Rally, HQ) and order controls (transfer, assign, staffing goal, select group) are hidden and a status line reads "Orders are not available: the lieutenant runs the city while you're away". On the island only the status line and While I'm away show; in Watch the city the group tabs, crew lists, Traveling crew and View crew show too. The Rally button is greyed out. Watch the city gives no orders either.
