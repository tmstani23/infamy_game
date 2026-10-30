# Game controls

Service access (Tim, 2026-10-21): eligible own crew provide presence for clinic heal/revive, police bribe/bail, shrine contracts, business purchases and War Lantern actions. Select crew at the service, then Space or the building panel's Open menu. Recruiting still requires the hero physically inside. Player clinic returns hold until explicitly ordered; see [crew rules](crew_recruiting_plan.md#player-crew-control-tim-2026-10-25).

What works in the game now (updated 2026-10-21). Keep this file up to date whenever a control is added or changed.

Start game (2026-10-22): choose clan and difficulty, then Start; [match rules](gameplay_and_design.md#starting-paths-settled). On the start screen, **Exit Game** asks the browser or app to close; if it cannot, it explains how to close the tab. Kuroda Q/E/R/F use [its own kit](combat_spec.md#kuroda-leader-kit-tim-2026-10-22); the hero table below describes Ronin abilities.

## Hero

| Key | What it does |
|---|---|
| W A S D | Move, relative to the screen |
| J / **Character** button | Open live hero stats, abilities and existing passives; hover modifiers/icons for sources. [Character page](combat_spec.md#hero-character-page-authorized-2026-10-27); no multiplayer pause |
| Shift (hold) | Walk instead of run |
| Space (or Enter) | Go through a door (enter or leave a building); selected crew come along, the rest stay. At the clinic ring it opens the clinic menu (1 heals, 2 and up revive); at the police box (blue ring) it bribes; at the police HQ it pays bail (1 and up; jailed crew stay in jail until bailed) |
| Left-click a building | Show the building panel. At the door ring it has Buy (unowned business), Attack (unowned, night only), Raid (rival-owned, night only, needs a War Lantern) and, at the moneylender (M on the minimap), Buy War Lantern |
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

The action bar at the bottom shows the hero's health, the basic attack and the four abilities with their cooldowns (hover a slot for what it does), active buff/debuff icons with remaining time (hover for the full name), and a health pip for each crew member on the left. Pips are grouped by Hero/sectors/HQ/active Rally; click a header or normal pip to select that command group, replacing others; double-click selects only that crew member and jumps the camera to them until the hero moves or uses a door. Crew pips show their control-group number. Jailed crew show as blue pips: click one for "In jail: bail N ryo at the police HQ", double-click to jump the camera to the HQ. A blue ‖ on a name means that crew member is passive (Z). The target marker is blue and turns red while the hero attacks; crew targets get a smaller red marker. Units hidden in the fog can't be targeted.

The HUD score panel's day/night clock counts down to the next change.

## Hiring crew (inside a teahouse)

| Key | What it does |
|---|---|
| H | Open or close the hire panel. Also works in your hideout (the inn), at half speed; the hideout also lets heat cool 2x with your boss inside, heals everyone inside slowly, and is where your KO'd hero wakes |
| 1 / 2 / 3 (or click the price) | Hire a Thug / Brute / Swordsman |
| Esc | Close the panel |

The top-left line shows your crew count / crew cap; ryo has its own badge. New crew walk out of the teahouse door after a few seconds. At a hideout, switch the H panel to **Dismiss crew · all zones** to dismiss eligible healthy active crew from any zone; click twice to confirm and receive the listed refund.

## Deployment and sectors (updated 2026-10-27)

Rules: [deployment_sector_plan.md](deployment_sector_plan.md). Deployment is separate from selection groups; ordinary crew commands obey deployment membership and area limits, and Follow needs hero-group membership.

| Input | What it does |
|---|---|
| Toolbar **Deployment** button (Esc closes; no hotkey) | Deployment panel: counts, reserved slots, health, transfer status |
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

Phase 3A (Tim, 2026-10-21): crew locking, L and padlocks are removed, including automatic locking on business entry. Clicks, drag selection, C and Esc keep assigned groups; dead or removed crew are pruned. Crew already indoors can be selected and commanded when the hero enters after them.

Phase 3B (Tim, 2026-10-21): hero right-click/Tab assistance uses only explicitly selected available crew and preserves independent T/Ctrl targets. Switching selection/groups and attacking with another squad keeps the previous squad's attack. Follow affects selected crew only; Ctrl commands never fall back to the hero or all crew. Execution protection: [combat rules](combat_spec.md#h-downed-execute-and-hospital-approved-by-tim-2026-10-17).

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
| Alt+Enter / fullscreen | Fullscreen toggle; short Escape stays with game UI only where Keyboard Lock is supported/allowed. Browser long-Escape exit remains. [Capability limits](tech_plan.md#approved-shellaudio-playtest-fixes-2026-10-27) |
| Mouse at the screen edge | Pans the camera once it is off the hero (not while it follows the hero); Home goes back |
| F3 (dev only) | Show footprint outlines (debugging) |
| P | Show or hide the FPS readout |
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

Staffing goals live in Crew & staffing. Header shows assigned excluding travelers, incoming and goal; goals draw from ready HQ without recalling field crew. Existing transfer/accept/cancel/assignment/Rally rules remain. One own-unit roster shows cached portrait/name/HP/status while docked: duplicate own target/selection cards are suppressed, travelers appear only in the transfer list. Traveling crew is collapsed by default with its count in the summary; expanding it replaces the regular roster so the lists do not stack. Paging and per-unit cancel remain available. Enemy/remembered target inspection remains in the shared dock; ordinary world HUD restores on close. [Partial phase 2 status and reported Node checks](playtest_followup_plan.md#2-fullscreen-deployment-simplification); Tim approved current layout/staffing usability as good for now (2026-10-29); full memory/FPS audit remains pending.

View crew (2026-10-29): below **Select group**, **View crew** closes Deployment/map and follows only selected crew using the existing single-unit watch or largest-cluster group camera. Interior units use existing public-door camera behavior. Disabled without a viewable selection; selection, orders and assignments remain unchanged. Panel-flow coverage checks exact selected IDs, close behavior and no sim/command changes; latest coordinator run completed successfully. Syntax/diff checks reported passing. Future menu icons/Rally/Resume/timers and combined Map/Deployment button remain proposals only.

### In-game background music (2026-10-29)

**Settings → Audio:** Background music toggles playback; Music volume persists alongside existing master/mute, independent of effects volume. One streamed audio element plays the existing two tracks in shuffled cycles without immediate repeats; disabling pauses in place, enabling resumes. Hidden-tab pause, autoplay retry, bounded failed-track skipping and pagehide cleanup are implemented; map presentation does not stop music. Intro respects the saved music toggle; explicit intro Play reenables it. More tracks can be added later; no new assets in this batch. Coordinator reports passing game-music, menu-music and game-shell checks. Manual in-game listening and sound balance remain pending.

Crew pip statuses (2026-10-29): grouped crew portraits now show live per-crew duty/status text and tooltip, including medical states. Shared status prioritizes Charmed/Charming, recovery and actual operation/duty membership before generic stopped text. Nodes are reused; coordinator reports passing panel-flow stable-node/status-update and selection-panel checks. Manual Geisha playtesting remains pending; [revised Charm rules](combat_spec.md#revised-geisha-specification-implemented-2026-10-29).

Treasury/contract feedback (2026-10-29): hover the ryo badge for six recent debits; involuntary contract/HQ theft shows a negative popup naming its source. Contract board/tracker display the shared start-cooldown countdown; Take/number shortcuts wait until ready. [Audit/cadence details and limits](business_raids_plan.md#treasury-loss-audit-checkpoint-2026-10-29).

Section 3 controls (2026-10-29): compact nine-icon utility menu beside movable Ryo; hover/focus shows action, shortcut and availability. One Map/Deployment button or M opens the combined workspace; Close map/Esc closes it. Crew frames are movable/resizable at top left; group/solo/status/drag retained; abilities one row. Rally shows active/cooldown; War Lantern previews entry and uses existing command. Firefox fullscreen keyboard lock uses progressive requestFullscreen option with legacy fallback; Firefox-version/manual Esc tests pending. Coordinator reports focused UI checks passed; no browser automation or visual fit claim.

Edit layout (built 2026-10-30): **Settings → Edit layout** lets you move and resize every UI panel, including placeholders for hidden panels (`hud_layout.js` registry; the target-marker layer is excluded). Its translucent toolbar can be moved; **Grid: Off (10px)** toggles 10 px snapping for panel movement and resizing. Drag a panel to move it, drag its gold corner to resize; on text and list panels drag a left, right, top or bottom edge bar to change just the width or height (ryo, minimap, heat, icon menu, stealth badge and raid alarm keep corner-only scaling). Done saves and locks everything; Cancel or Esc restores the previous layout; Reset layout restores defaults. **Settings → Quit to game menu**: click twice to leave the match for the start screen (the match is not saved).

Responsive layout follow-up (2026-10-30): Crew commands now live in an independently resizable layout panel and use the same shared crew input actions. Roster cards, buttons, buffs, text and building details wrap; long populated panels use explicit Previous/Next paging instead of editor scrollbars. Controls pages its sections; character stats and service windows page their rows. All entries remain attached and selection is preserved. Panel height can grow to fit content; saved height is a minimum. Coordinator reports focused layout/command checks passed; narrow/tall viewport visual review remains pending.
