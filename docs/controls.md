# Game controls

What works in the game now (updated 2026-10-17). Keep this file up to date whenever a control is added or changed.

## Hero

| Key | What it does |
|---|---|
| W A S D | Move, relative to the screen |
| Shift (hold) | Walk instead of run |
| Space (or Enter) | Go through a door (enter or leave a building); selected crew come along, the rest stay. At the clinic ring it opens the clinic menu (1 heals, 2 and up revive); at the police box (blue ring) it bribes; at the police HQ it pays bail |
| Left-click a building | Show the building panel |
| Right-click a unit | Hero auto attack: locks on and swings whenever it is within 2.5 steps (no chasing); on a downed target he executes them |
| Tab | Target the nearest enemy and start the auto attack; Tab again cycles (skips townsfolk, crew and downed units) |
| Left-click an enemy | Mark it as the target and show its card |
| (stand still) | The hero hits the nearest enemy in reach on its own, Dota-style. Moving stops the attacks. |
| Q | Iaido Dash: dash toward the mouse, cutting every enemy passed (8 s cooldown) |
| E | Intimidate: enemies within 4 steps deal 30% less damage for 5 s (14 s) |
| R | Rally: crew within 8 steps attack 30% faster for 6 s and heal 10% (20 s) |
| F | Red Lantern (ultimate): 8 s of 50% more damage, healing 20% of damage dealt (60 s) |

The action bar at the bottom shows the hero's health, the basic attack and the four abilities with their cooldowns (hover a slot for what it does), active buffs above it, and a health pip for each crew member on the left. Click a crew name there to select them; Shift-click adds or removes; double-click jumps the camera to them until the hero moves or uses a door. The target marker is blue and turns red while the hero attacks; crew targets get a smaller red marker. Units hidden in the fog can't be targeted.

## Hiring crew (inside a teahouse)

| Key | What it does |
|---|---|
| H | Open or close the hire panel |
| 1 / 2 / 3 (or click the price) | Hire a Thug / Brute / Swordsman |
| Esc | Close the panel |

The top-left line shows your crew count / crew cap; ryo has its own badge. New crew walk out of the teahouse door after a few seconds.

## Crew (out on the street)

| Input | What it does |
|---|---|
| Left-click a crew member | Select them |
| Left-drag a box | Select every crew member in the box |
| Shift + click or drag | Add to the selection |
| C | Select all your crew (indoors: the crew in this room) |
| Esc | Clear the selection |
| Right-click the ground | Send the selected crew there |
| Ctrl + right-click the ground | Station the selected crew there (they hold that spot) |
| Right-click your hero, or V | Selected crew follow you again |
| Ctrl + right-click a unit | Selected crew attack it, or execute it if it is downed |
| T | All crew attack the hero's target |
| X, then left-click the ground | Attack-move: go there and fight anything on the way |
| Left-click a townsperson | Show their card |
| G | Selected hurt crew walk to the clinic and heal (0.2 ryo per missing HP; street only) |

Selected crew have a green ring under them. New crew follow you automatically. Selected crew go into buildings with you and come back out with you; unselected crew wait outside. Mouse crew orders work indoors too (2026-10-18). A door ring flashes teal while your crew are inside.

Crew fight back on their own: anything except a plain right-click move makes them attack enemies that come within about 6 steps. Health bars show over enemies (red) and over your hurt units (green). Damage numbers pop up on every hit: white on enemies, red on yours, big gold with "!" for critical hits (10% chance, double damage). 

Crew at 0 health go down (red ring under them). An enemy can execute them (dead, rehire them). If nobody does it within 5 s with no enemy close by, they are carried to the bonesetter's clinic, recover (30 s thug, 45 s brute/swordsman) and walk back out after paying 25% of their hire price. A beaten hero is knocked out and gets back up at the clinic after 20 seconds.

For testing, three rival thugs stand outside the gambling den. Add `?enemies=0` to the game address to turn them off, and `?civilians=0` to turn off the townsfolk.

## Screen layout

Click the lock icon to unlock the HUD, then drag panels and resize them by the gold corner. Reset layout puts everything back. The layout is saved in `game/data/ui_layout.json`.

## Camera and view

| Key | What it does |
|---|---|
| Arrow keys | Pan the camera around (it stays there until you snap back) |
| Home, or the "Back to hero" button (bottom right, shown while panned) | Snap the camera back to your hero |
| Mouse wheel, or = and - | Zoom in and out |
| N | Switch between day and night (in the sim; townsfolk follow) |
| M | Mute or unmute sounds |
| F3 | Show footprint outlines (debugging) |
| P | Show or hide the FPS readout |
| ? or the Controls button | Open the controls panel (Esc closes it) |
| Minimap: left-click or drag | Move the view |
| Minimap: right-click / Ctrl + right-click | Send selected crew there / station them there |

## Planned (not built yet)

- Clicking action bar slots (keys only for now).
