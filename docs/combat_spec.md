# Combat spec

Status: started 2026-10-16. Tim OK'd the feel fixes (A to D), crits and hero chase on 2026-10-16; they are built. Abilities and the action bar (section F) were approved and built the same day. Owned by the crew thread. Numbers live in `game/data/units.json`; rules in `game/src/sim/game.js` (combat section); drawing in `game/src/render/`.

## Now (built)

- **Style:** RTS / Dota hybrid. Hero = Dota-style character on WASD; crew = RTS army (select, right-click).
- **Enemies:** units of different clans in the same place.
- **Crew:** auto-attack within 6 steps, leashed 10 steps to their hero / station / move point. A plain move ignores enemies until it arrives. Right-click enemy = focus. X + click = attack-move.
- **Who fights (2026-10-19/20):** no clan's hero or crew picks fights. They fight on an attack order or T, attack-move, while stationed, when hit (hit back at whoever hit them in the last 5 s), and as **backup**: crew within 6 steps join in on whoever hit their boss or a clanmate in the last 5 s (all clans; crew stopped with Z or on a move order don't). Inside a raided or attacked business everyone fights on their own.
- **Hero:** hits the nearest enemy in reach while standing still; moving stops attacks. Lock-on (2026-10-18): right-click or Tab locks a target (left-click only marks it); the hero swings when within 2.5 steps and does not chase; the lock drops beyond 14 steps or when the target is down. At 0 HP knocked out, back up at the clinic after 20 s.
- **Hits:** `damage` every `attackSpeed` seconds once within `attackRange`. Damage lands 40% through the swing (build order 1).
- **Death (2026-10-17):** crew at 0 HP go down first; executed crew play the death animation and are removed (dead, rehire), the rest are carried to the clinic. See section H.
- **Health (Tim, 2026-10-21):** ronin 560, ninja leader 490, thug 200, brute 360, swordsman 240 HP. Slow regen until the hospital exists: 0.25% of max HP per second once not hit for 6 s (a thug refills in about 7 minutes).
- **Bars:** red over enemies, green over your units when hurt.

Balance and targeting (Tim, 2026-10-21): hero base damage 22.5 (-25%); hero HP -30%. Recruit damage +25%: thug 10, brute 17.5, swordsman 20, ninja 15. Plain crew moves finish before retaliation. Hidden Shinobi clear hero/crew target locks, windups and indicators; revealing does not restore locks automatically.

Shinobi dodge (Tim, 2026-10-21): leader and both ninja recruits have 15% innate dodge against weapon swings; a successful dodge shows small DODGE combat text.

## Why it feels clunky (research)

Common causes in RTS/MOBA melee, checked against our code:

1. **Hit timing doesn't match the swing.** We deal damage at the start of the swing, and the attack animation just loops at its own speed, so the visible strike and the health drop are out of sync. Dota-style games split every attack into a wind-up ("attack point", the hit lands about 30-50% through the swing) and a back-swing, and play the animation scaled to the attack speed so the blade connects exactly when damage lands.
2. **No hit feedback.** Nothing happens to the unit that gets hit: no flash, no flinch, no number, no sound. Players read impact from the victim more than the attacker.
3. **Instant starts and stops.** Units snap from run to attack to idle in one tick and turn instantly between 8 directions.
4. **Crowding.** Several crew attacking one target all walk to the same point and get pushed apart, so they jostle instead of surrounding it.
5. **Death feels flat.** No impact frame or pause on the killing blow.

## Feel fixes (approved and built 2026-10-16)

### A. Attack timing (biggest win)
- Each swing: wind-up (damage lands at 40% of the swing), then back-swing; a new swing starts every `attackSpeed` seconds.
- The renderer restarts the attack animation on every swing and plays it stretched to the swing length, so the strike frame matches the damage.
- The sim sends a small `hits` list each tick (attacker, target, damage, crit, killed) for the renderer. Plain data, so it works over the network later.

### B. Floating damage numbers (League-style)
- Number pops up over the victim, rises and fades in about 0.8 s, with a small sideways drift so stacked hits don't overlap.
- Pops in big then settles (scale 1.6 to 1.0 in the first 0.12 s), bold with a dark outline.
- Colours: white for hits on enemies, red for hits on your units, gold and larger with a "!" for crits, green "+" for big heals.
- Crits (new rule): 10% chance for double damage. Tunable per unit type; can be 0.
- Drawn as an HTML overlay (cheap, crisp text). Up to about 40 on screen; the oldest are dropped first.

### C. Hit feedback
- The victim flashes white for 0.08 s and leans back a little (0.15 steps, eased back).
- Killing blows: a stronger flash and a short screen shake when near the hero.
- Every 3rd hit, or any crit, plays the hit-reaction animation if the unit isn't attacking.

### C2. Strike effects (in-game graphics, on top of the sprite sheets)
- **Slash trails:** a short glowing arc (katana: thin pale-steel crescent; club: wider dull-orange smear) drawn in front of the attacker on the strike frame, fading in about 0.15 s. Shaped and angled by the attacker's facing.
- **Impact sparks:** 6 to 10 small additive sparks burst from the victim on each hit (steel blue-white for blades, warm dust for clubs), bigger on crits.
- **Crit glint:** a quick gold star flash at the impact point.
- **Night glow:** trails and sparks light up slightly more at night so they read against the dark.
- All drawn by the renderer from the same `hits` list; nothing here changes the rules. Weapon art itself (how blades look and sit in the hands) is the "Weapon look and grip fit" thread's job.

### D. Smoother movement and crowding
- Attackers pick spots around their target (an arc), so 3 to 6 crew surround it instead of queueing.
- Turn toward a target over about 0.1 s instead of snapping.

### E. Sound (later)
- Swing, impact and death sounds; not planned until art and feel are settled.

## Build order

- [x] 1. Attack timing (A) and the `hits` list from the sim, with Node tests (done 2026-10-16: `e.swing` {start, len, strike, target}; swing = min(0.85 x attackSpeed, 0.7 s), damage on the strike tick at 40%; target must still be in reach + 0.6 or the swing misses; `state.hits` cleared each tick; seeded random numbers (`options.seed`). Renderer stretches the attack sheet over the swing.)
- [x] 2. Damage numbers (B) and crits (done 2026-10-16: `critChance` 0.1 and `critMultiplier` 2 per type in units.json; numbers in `render/hitfx.js` as an HTML overlay `#fx`: white on enemies, red on yours, big gold "N!" for crits, orange on killing blows; pop 1.7x then rise and fade over 0.85 s; max 40.)
- [x] 3. Hit flash, lean and killing-blow shake (C), slash trails and impact sparks (C2) (done 2026-10-16: `uFlash` in the sprite shader; lean 0.16 steps away from the attacker; steel-blue crescent trail for blades, wider orange smear for clubs; 8 to 16 additive sparks, gold on crits; camera shake on kills (and small on crits) within 9 steps of the hero. Hit-reaction animation not added yet.)
- [x] 4. Surround spots and turning (D) (done 2026-10-16: attackers spread round the target about 0.9 rad apart at 80% of reach; facing turns one eighth per tick and a swing only starts when facing the target.)
- [x] Hero chase (replaced by lock-on, 2026-10-17; see Now): right-click an enemy and the hero runs to it and keeps hitting it; any WASD input cancels. Selected crew attack it too. Command `{ id, type: 'attack', target }`.
- [ ] 5. Tim playtests, tune numbers here

## F. Hero abilities and action bar (approved by Tim 2026-10-16, built)

Ronin kit from the design draft. Each is one command `{ id, type: 'ability', slot, x, z }` (x, z = mouse point on the ground), checked and run in the sim like everything else, so bots can use them too. Nothing needs new map systems. Numbers are starting guesses.

| Key | Ability | What it does | Cooldown |
|---|---|---|---|
| Q | Iaido Dash | Dash up to 6.5 steps over 0.3 s toward the mouse (stops at walls), hitting every enemy passed for 150% damage (2026-10-17, was 5). | 8 s |
| E | Intimidate | Enemies within 4 steps deal 30% less damage for 5 s (a dark aura shows on them), plus a 50% snare for 3 s (2026-10-21). | 14 s |
| R | Rally | You and your crew within 8 steps attack 30% faster for 6 s and heal 15% of your health over 6 s in 6 ticks (hero included; 2026-10-19). | 20 s |
| F | Red Lantern (ultimate) | For 8 s the ronin deals 50% more damage and heals 20% of the damage he deals; a red glow surrounds him. | 60 s |

### Kuroda leader kit (Tim, 2026-10-22)

Spear-and-shield leader; human and bot abilities use the same sim rules.

| Key | Ability | Effect | Cooldown |
|---|---|---|---|
| Q | Sweeping Cut | Visible enemies within 4 take 60% weapon damage and a 50% slow for 3 s; no automatic street-police/civilian aggression | 14 s |
| E | Reprisal | Brace up to 1 s. A damaging hit grants 6 s of 35% cleave within 2; next landed normal attack stuns 0.75 s. Moving before a hit instead grants +30% run speed for 4 s, including casting while moving. Timeout/Escape/stun/death give neither; no stacking or snare removal | 20 s |
| R | Threefold Thrust | Three melee strikes at 45% weapon damage each over 0.9 s; every strike checks reach. Movement/Escape cancels. Cleave applies without consuming Reprisal's normal-hit stun | 12 s |
| F | Iron Formation | Fixed radius-6 circle for 8 s: allies inside take 25% less damage; their weapon hits slow 30% for 1 s. No healing or crew-order changes | 60 s |

Approved visuals use procedural geometry, particles, cards and bloom: broad sweep crescent, assembling/shattering shield crest, pursuit ribbons, spectral spearheads and rotating formation symbols with allied wards/outlines. No new custom effect textures. Future previews use actual game sprites, camera and effects.

Planned, not built (2026-10-22): compact hero buff/debuff icon strip near the action bar for all clans, with duration timers and hover descriptions. Agree layout before implementation.

### Ninja leader kit (built 2026-10-20, `units.json` `models.ninja_leader.abilities`)

| Key | Ability | What it does | Cooldown |
|---|---|---|---|
| Q | Shadow Step | Teleports up to 8 toward the mouse, stopping at walls and water; stays hidden. | 10 s |
| E | Caltrops | Thrown at the mouse: enemies within 4 (not townsfolk) are slowed 50% for 3 s (buff `snared`; `snareRadius`, `snareSeconds`, `snareSpeed`); house guards, police and bandits within 6 walk over to look. Works while seen. | 15 s |
| R | Smoke Bomb | Cloud of radius 4 for 6 s (`state.smokes`). `blind()`: anyone not of the clan inside it or looking into it can't see or target. Own units inside stay hidden and heal 3%/s (`shroud` buff, green rain). Units inside hold fire; lasting expiry passivity and regrouping require presence at expiry (see below). | 40 s |
| F | Assassinate | Needs 3 s hidden, or is immediately usable during Vanish. Hits the enemy at the mouse within reach +1.5: nonheroes (including crew) are one-shot; heroes retain 60% of current HP, rounded to whole HP with minimum 1 (already below 1 stays unchanged); this cannot finish a hero (Tim, 2026-10-22). Consumes the attacker's veil. Hero and living non-guard crew within 8 in the same place gain +20 percentage points crit for 8 s (ninja 15% → 35%); refreshes without stacking. Violet recipient auras and an 8-unit cast pulse. | 45 s |

Phase 3G Vanish (2026-10-21): at the six-second Smoke Bomb's mechanical expiry, the hero and crew still inside gain four seconds of undetectability. Incoming damage can hurt/down them but cannot reveal them; outgoing attacks or Assassinate consume only that attacker's veil. At expiry, recipients become passive; affected crew hold their position and stay passive until explicitly ordered (updated 2026-10-25). Crew outside the cloud at expiry do not gain this lasting passivity. Dark-blue transparent silhouettes/shimmer and blue wisps show the effect; cloud graphics/fade are unchanged. The player hero alone shows VANISH 4/3/2/1s overhead. The Vanish pill and R button show its duration while the real 40 s cooldown continues underneath, then returns to view.

Effects in `render/abilityfx.js` (mock OK'd by Tim): black non-additive smoke with muted purple and blue highlights, thin rings like the ronin's.

**Keys (done, F2):** doors moved to **Space** (it shows on the door prompt), and E is Intimidate. Hire menu keys 1 to 3 stay as they are (only inside a teahouse).

**Action bar (WoW-style), bottom centre of the screen:**
- Hero portrait corner with a big health bar ("640 / 800"), turning red and pulsing below 25%.
- Five slots: basic attack (lights up on each swing, shows the target's name), then Q, E, R, F.
- Each slot: placeholder icon (brush-style symbol until real icons are painted), key letter in the corner, a dark clock-sweep with seconds left while on cooldown, a flash when it comes back, greyed out while knocked out.
- A buff row above the bar for active effects (Rally, Red Lantern) with time left.
- A small crew strip at the left end: one health pip per crew member, so you see who is hurt. The crew command strip (V, T, Z, X, G, C buttons; `crew_bar.js`) sits above the crew pips (2026-10-19).
- Built as an HTML overlay that only reads the state (no rules in the browser).

**Build order:**
- [x] F1. Ability rules in the sim (all four, cooldowns in the state), command, Node tests (game/tools/test_abilities.mjs; numbers in data/units.json hero "abilities")
- [x] F2. Door key to Space, E to Intimidate, controls doc updated
- [x] F3. Action bar with health, slots, cooldown sweeps, buffs and crew pips
- [x] F4. Ability effects: dash streak, intimidate aura, rally ring, red lantern glow
- [ ] F5. Tim playtests and tunes the numbers here

Later (Tim 2026-10-16, after the first ability playtest): ability effects work but could look cooler; revisit the dash, intimidate, rally and red lantern visuals when there is time. Health bars now show over every unit at all times, green to dark red (render/health.js, test game/tools/test_health_bars.mjs).

## Open questions

- Ability numbers get tuned in Tim's playtests (F5).

## G. Ability VFX upgrade plan (research 2026-10-17, approved by Tim; ronin effects built, see below)

Today `render/abilityfx.js` draws flat additive rings, discs and a ground streak. Upgrade toolkit, best payoff first:

1. Timing: 0.1 to 0.2 s wind-up flash before release, 50 to 80 ms hitstop on impact, screen shake. Render-only (freeze sprite frames and effects, never the sim), so multiplayer stays safe.
2. Bloom on bright ability colours only: three.js `UnrealBloomPass` (addons, no new library), threshold set so only effects glow. Big payoff at night.
3. Flipbook VFX sprites: painted sheets (slash arcs, smoke, flame, sparks) on additive billboards. Fits the painted look best. Free source: Kenney Particle Pack (CC0, kenney.nl/assets/particle-pack), or a Gemini 4x4 sheet on black.
4. Particles and trails: three.quarks (npm `three.quarks`), free three.js VFX library with bursts, trails, flipbook particles.
5. Ground decals: shader rings with scrolling noise, cracks, kanji circles instead of solid rings.
6. Dedicated Mixamo cast clips (optional, Tim downloads): sword draw, roar/taunt, battle cry, power-up, throw.

Ronin plan (effort / payoff):
1. Iaido Dash (small / high): fading after-images of the hero sprite along the path (no new art), white slash across each enemy hit, hitstop.
2. Red Lantern (medium / high): bloom, flickering flame flipbook around him, rising embers, red tint on his sprite.
3. Intimidate (small / medium): brief screen dim, rippling shockwave, purple smoke wisps on affected enemies.
4. Rally (small / medium): gold ground circle and light pillars rising on the crew.

**Built (2026-10-17), ronin:**
- Q: after-images, steel glints, hit freeze.
- E: screen dim, ink ring, seal, purple wisps.
- R: thin yellow ring, gold seal, glowing petals, light pillars; no green ring. Each heal tick shows green healing rain and a small green +N heal number, offset left and below the damage numbers. The Rally outline is 20% thinner (2026-10-19).
- F: glowing lanterns orbiting him (halos 20% smaller, 2026-10-19), red light, embers.
- Stacking buff auras (outline, ground ring and sparkles per ability), heal, lifesteal and regen sparkles, and bloom on effects only.

**Thinner effects (2026-10-19):** Rally, Intimidate and Red Lantern outlines, ground rings, cast rings and lantern halos are 50% thinner (`render/abilityfx.js`).

**Sounds (2026-10-19, `render/sound.js`):** brutes pick 50/50 between `club_hit_1-3` and Kenney `impactSoft_medium_000-004` at pitch 0.85; Intimidate uses `impactSoft_medium` at pitch 0.6 (`punch_hit_heavy_1` no longer loaded).

**Targeting (2026-10-19):** nobody picks fights on their own except house guards; see `crew_recruiting_plan.md`.

**Weapon glow (2026-10-18):** a faint glow on each held weapon (katana steel blue-white, club ember amber, jitte soft blue), a bit brighter mid-swing, fading on death. Tuned in `game/data/weapon_glow.json`; needs the `_glow` sheets from the exporter.

Ninja spells (not built): Smoke Step = smoke bursts at start and end; Sleep Dart = thin trail and sleep puff (needs sim projectiles first, same gap as rifles and bows); Shadow Mark = dark circle with tendrils under the target; Thousand Cuts = hero flashes between enemies with many slash arcs.

## H. Downed, execute and hospital (approved by Tim 2026-10-17)

- **Downed:** crew at 0 HP go down. A downed unit can't act and attacks skip it. The hero is still only knocked out.
- **Execute:** a 3 s channel next to a downed enemy, by the hero, crew or bots. Crew channels cancel on a hit, movement or a new order. Hero execution protection: see below. A channel bar shows over the executor: red for an execute, blue for a police arrest. Success = dead (rehire at a teahouse).
- **Hero execution protection (Tim, 2026-10-21):** selection, targeting, Tab, crew attack/move/follow commands and repeated execute clicks do not cancel or restart the channel. Right-click attacks command selected crew only, without a hero attack queued afterwards. Abilities, doors and hero looting cannot replace it. Hero movement, Escape, enemy hits and invalid targets still interrupt it.
- **Carried off (2026-10-21):** executable/arrestable downed units remain on the ground for 20 s. A channel started within that window may finish afterwards, then cleanup occurs. Crew go to the clinic; other units follow their normal removal or respawn rules. Bandits and house guards die outright.
- **Hospital:** the bonesetter's clinic. Recovery timer (30 s thug, 45 s brute/swordsman); since 2026-10-19 crew stay until their boss pays at the clinic menu (25% of the hire price once recovered, 50% before). See `crew_recruiting_plan.md`.
- **Who can be executed (2026-10-19):** only downed rival heroes and crew. Bandits die outright and are looted (section I).
- **Execution notice (2026-10-21):** names the clan and unit type.
- **Execute ryo (2026-10-18):** executing an enemy pays `executeRyo` from `units.json`: thug 20, swordsman 30, brute 40, ±25%. Townsfolk pay nothing.
- **Fog of war (2026-10-18):** you only fight what your clan can see (`sim/vision.js`); bots follow the same rule.
- **Heal order:** hurt crew can be sent to the clinic for a little ryo.
- **Clinic menu (2026-10-17):** heal nearby crew at 0.2 ryo per HP, or revive a recovering crew member now for 50% of the hire price.
- **Not while in a fight (2026-10-20):** the clinic only serves someone not hit for 5 s (`clinicUnhitSeconds`, units.json): the boss's clinic menu (heal + revive) waits, the menu heal skips anyone hit lately, and crew sent with G wait at the door. Same for bots.
- **Hero:** knocked out, up again at the clinic after 20 s.
- **Townsfolk:** can be fought too; see `civilians_plan.md`.
- **Heat (2026-10-17):** per clan, +2 for a hit, +10 for a down, +30 for a kill; cools 1 every 30 s. Shown in the heat badge with notices.
- **Controls:** right-click a downed enemy = execute (nearest selected crew, else the hero).
- **Bots:** each clan has an aggression value from 0 to 1. Bots execute only with no enemy within 5 steps and not in a fight, on an aggression-weighted roll (repeated every second), pricier types first. Bot clans' downed crew go to the clinic like yours and wait for a paid revive (2026-10-19). Executions add heat once heat exists. Defenders attack anyone channelling an execute on a downed friend.

**Build order:**
- [x] H1. Downed state and execute in the sim, with Node tests (done 2026-10-17: `startExecute`, `executeStep` in `sim/game.js`; test `game/tools/test_downed.mjs`)
- [x] H2. Bot execute choice (done 2026-10-17: `botExecute` in `sim/game.js`)
- [x] H3. Carried off, clinic recovery and the heal order (done 2026-10-17: `carryOffDowned` in `sim/game.js`; clinic list, `carryOff`, `checkIn`, `clinicTick` in `sim/clans.js`; heal order on G)
- [x] H4. Clinic on the map, down marker, channel bar, controls (done 2026-10-17: clinic b9 in `data/waterfront.json`; rules in `units.json`: `executeSeconds`, `botAggression`, `carryAfterSeconds`, `carryRadius`, `recoverCostShare`, `healPerSecond`, `healCostPerHp`, `recoverSeconds`)
- [ ] H5. Tim playtests

## I. Night bandits (built 2026-10-17)

Numbers in `game/data/bandits.json` (stats in `units.json`); rules in `sim/bandits.js`; test `game/tools/test_bandits.mjs`.

- Roamers (2026-10-21): bandit 240 HP / 9 damage (weight 2), night brute 432 HP / 16 damage (weight 1); each leaves 50 ryo. Camp bandits retain base stats and 25-ryo loot.
- At night: 3 walk in first, then one every 14 s, up to 10 at once and 20 a night (2026-10-21), from the map's `edges` (spawn points at least 25 steps away, `minDistance`). They wander between `pois` (6 to 15 s per spot) and walk out at dawn.
- All wild/camp and roaming variants have sight, engagement and disengage distance 6, respecting walls, stealth and camp leash (Tim, 2026-10-21). Police pursuit and movement speeds are unchanged. Being hit also angers nearby bandits; anger expires after 10 s without renewed sight/hits. Camps top up missing residents at dawn and dusk, preserving survivors.
- No downing (they die at 0 HP) and no heat. Kills pay nothing (2026-10-19): the body carries the ryo, glints gold and any clan can loot it (hero: right-click; crew: Ctrl + right-click). Unlooted bodies fade after 60 s (`lootSeconds`).

## Large street fights (Tim, 2026-10-25)

Police and civilians retreat from a nearby fight involving at least five actively fighting units per clan on two sides (heroes count). Idle gatherings do not trigger it; attrition does not draw bystanders back while the fight continues. KO countdown and crew-control rules: [controls](controls.md).
