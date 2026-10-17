# Game controls

What works in the game now (updated 2026-10-16). Keep this file up to date whenever a control is added or changed.

## Hero

| Key | What it does |
|---|---|
| W A S D | Move, relative to the screen |
| Shift (hold) | Walk instead of run |
| Space (or Enter) | Go through a door (enter or leave a building) |
| (stand still) | The hero hits the nearest enemy in reach on its own, Dota-style. Moving stops the attacks. |
| Q | Iaido Dash: dash toward the mouse, cutting every enemy passed (8 s cooldown) |
| E | Intimidate: enemies within 4 steps deal 30% less damage for 5 s (14 s) |
| R | Rally: crew within 8 steps attack 30% faster for 6 s and heal 10% (20 s) |
| F | Red Lantern (ultimate): 8 s of 50% more damage, healing 20% of damage dealt (60 s) |

The action bar at the bottom shows the hero's health, the basic attack and the four abilities with their cooldowns (hover a slot for what it does), active buffs above it, and a health pip for each crew member on the left.

## Hiring crew (inside a teahouse)

| Key | What it does |
|---|---|
| H | Open or close the hire panel |
| 1 / 2 / 3 (or click the price) | Hire a Thug / Brute / Swordsman |
| Esc | Close the panel |

The top-left bar shows your ryo and crew count / crew cap. New crew walk out of the teahouse door after a few seconds.

## Crew (out on the street)

| Input | What it does |
|---|---|
| Left-click a crew member | Select them |
| Left-drag a box | Select every crew member in the box |
| Shift + click or drag | Add to the selection |
| C | Select all your crew |
| Esc | Clear the selection |
| Right-click the ground | Send the selected crew there |
| Ctrl + right-click the ground | Station the selected crew there (they hold that spot) |
| Right-click your hero, or V | Selected crew follow you again |
| Right-click an enemy | Your hero runs to it and keeps hitting it (WASD cancels); selected crew attack it too |
| X, then left-click the ground | Attack-move: go there and fight anything on the way |

Selected crew have a green ring under them. New crew follow you automatically. Crew wait outside when you go into a building.

Crew fight back on their own: anything except a plain right-click move makes them attack enemies that come within about 6 steps. Health bars show over enemies (red) and over your hurt units (green). Damage numbers pop up on every hit: white on enemies, red on yours, big gold with "!" for critical hits (10% chance, double damage). Dead crew are gone; a beaten hero gets back up at the start point after 5 seconds.

For testing, three rival thugs stand outside the gambling den. Add `?enemies=0` to the game address to turn them off.

## Camera and view

| Key | What it does |
|---|---|
| Arrow keys | Pan the camera around (it stays there until you snap back) |
| Home, or the "Back to hero" button (bottom right, shown while panned) | Snap the camera back to your hero |
| Mouse wheel, or = and - | Zoom in and out |
| N | Switch between day and night |
| M | Mute or unmute sounds |
| F3 | Show footprint outlines (debugging) |

## Planned (not built yet)

- Clicking action bar slots (keys only for now).
