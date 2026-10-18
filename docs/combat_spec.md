# Combat spec

Status: started 2026-10-16. Tim OK'd the feel fixes (A to D), crits and hero chase on 2026-10-16; they are built. Abilities and the action bar (section F) were approved and built the same day. Owned by the crew thread. Numbers live in `game/data/units.json`; rules in `game/src/sim/game.js` (combat section); drawing in `game/src/render/`.

## Now (built)

- **Style:** RTS / Dota hybrid. Hero = Dota-style character on WASD; crew = RTS army (select, right-click).
- **Enemies:** units of different clans in the same place.
- **Crew:** auto-attack within 6 steps, leashed 10 steps to their hero / station / move point. A plain move ignores enemies until it arrives. Right-click enemy = focus. X + click = attack-move.
- **Hero:** hits the nearest enemy in reach while standing still; moving stops attacks. Lock-on (2026-10-18): right-click or Tab locks a target (left-click only marks it); the hero swings when within 2.5 steps and does not chase; the lock drops beyond 14 steps or when the target is down. At 0 HP knocked out, back up at the clinic after 20 s.
- **Hits:** `damage` every `attackSpeed` seconds once within `attackRange`. Damage lands 40% through the swing (build order 1).
- **Death (2026-10-17):** crew at 0 HP go down first; executed crew play the death animation and are removed (dead, rehire), the rest are carried to the clinic. See section H.
- **Health (2026-10-16, Tim):** all HP doubled (hero 800, thug 200, brute 360, swordsman 240). Slow regen until the hospital exists: 0.25% of max HP per second once not hit for 6 s (a thug refills in about 7 minutes).
- **Bars:** red over enemies, green over your units when hurt.

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
| E | Intimidate | Enemies within 4 steps deal 30% less damage for 5 s (a dark aura shows on them). | 14 s |
| R | Rally | You and your crew within 8 steps attack 30% faster for 6 s and heal 10% of your health (hero included 2026-10-18). | 20 s |
| F | Red Lantern (ultimate) | For 8 s the ronin deals 50% more damage and heals 20% of the damage he deals; a red glow surrounds him. | 60 s |

**Keys (done, F2):** doors moved to **Space** (it shows on the door prompt), and E is Intimidate. Hire menu keys 1 to 3 stay as they are (only inside a teahouse).

**Action bar (WoW-style), bottom centre of the screen:**
- Hero portrait corner with a big health bar ("640 / 800"), turning red and pulsing below 25%.
- Five slots: basic attack (lights up on each swing, shows the target's name), then Q, E, R, F.
- Each slot: placeholder icon (brush-style symbol until real icons are painted), key letter in the corner, a dark clock-sweep with seconds left while on cooldown, a flash when it comes back, greyed out while knocked out.
- A buff row above the bar for active effects (Rally, Red Lantern) with time left.
- A small crew strip at the left end: one health pip per crew member, so you see who is hurt.
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

## G. Ability VFX upgrade plan (research 2026-10-17, approved for the doc by Tim; nothing built yet)

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
- R: gold seal, glowing petals, light pillars.
- F: glowing lanterns orbiting him, red light, embers.
- Stacking buff auras (outline, ground ring and sparkles per ability), heal, lifesteal and regen sparkles, and bloom on effects only.

**Weapon glow (2026-10-18):** a faint glow on each held weapon (katana steel blue-white, club ember amber, jitte soft blue), a bit brighter mid-swing, fading on death. Tuned in `game/data/weapon_glow.json`; needs the `_glow` sheets from the exporter.

Ninja spells (not built): Smoke Step = smoke bursts at start and end; Sleep Dart = thin trail and sleep puff (needs sim projectiles first, same gap as rifles and bows); Shadow Mark = dark circle with tendrils under the target; Thousand Cuts = hero flashes between enemies with many slash arcs.

## H. Downed, execute and hospital (approved by Tim 2026-10-17)

- **Downed:** crew at 0 HP go down. A downed unit can't act and attacks skip it. The hero is still only knocked out.
- **Execute:** a 3 s channel next to a downed enemy, by the hero, crew or bots. Taking a hit, moving or a new order cancels it. A channel bar shows over the executor: red for an execute, blue for a police arrest. Success = dead (rehire at a teahouse).
- **Carried off:** a downed unit nobody finishes, with no enemy within 8 steps for 5 s, is carried to the hospital. There is only this timer, no bleed-out.
- **Hospital:** the bonesetter's clinic on the waterfront map. Recovery timer (about 30 s for a thug, longer for pricier types), costing about 25% of the hire price, paid on return (it waits if you have no ryo). Then the unit walks out and follows the hero.
- **Execute ryo (2026-10-18):** executing an enemy pays `executeRyo` from `units.json`: thug 20, swordsman 30, brute 40, ±25%. Townsfolk pay nothing.
- **Fog of war (2026-10-18):** you only fight what your clan can see (`sim/vision.js`); bots follow the same rule.
- **Heal order:** hurt crew can be sent to the clinic for a little ryo.
- **Clinic menu (2026-10-17):** heal nearby crew at 0.2 ryo per HP, or revive a recovering crew member now for 50% of the hire price.
- **Hero:** knocked out, up again at the clinic after 20 s.
- **Townsfolk:** can be fought too; see `civilians_plan.md`.
- **Heat (2026-10-17):** per clan, +2 for a hit, +10 for a down, +30 for a kill; cools 1 every 30 s. Shown in the heat badge with notices.
- **Controls:** right-click a downed enemy = execute (nearest selected crew, else the hero).
- **Bots:** each clan has an aggression value from 0 to 1. Bots execute only with no enemy within 5 steps and not in a fight, on an aggression-weighted roll (repeated every second), pricier types first. Bot clans' downed crew are taken off the map (not to the clinic) until rival bases exist. Executions add heat once heat exists. Defenders attack anyone channelling an execute on a downed friend.

**Build order:**
- [x] H1. Downed state and execute in the sim, with Node tests (done 2026-10-17: `startExecute`, `executeStep` in `sim/game.js`; test `game/tools/test_downed.mjs`)
- [x] H2. Bot execute choice (done 2026-10-17: `botExecute` in `sim/game.js`)
- [x] H3. Carried off, clinic recovery and the heal order (done 2026-10-17: `carryOffDowned` in `sim/game.js`; clinic list, `carryOff`, `checkIn`, `clinicTick` in `sim/clans.js`; heal order on G)
- [x] H4. Clinic on the map, down marker, channel bar, controls (done 2026-10-17: clinic b9 in `data/waterfront.json`; rules in `units.json`: `executeSeconds`, `botAggression`, `carryAfterSeconds`, `carryRadius`, `recoverCostShare`, `healPerSecond`, `healCostPerHp`, `recoverSeconds`)
- [ ] H5. Tim playtests

## I. Night bandits (built 2026-10-17)

Numbers in `game/data/bandits.json` (stats in `units.json`); rules in `sim/bandits.js`; test `game/tools/test_bandits.mjs`.

- Types: bandit (thug stats, about 20 ryo, weight 2) and night brute (brute stats, about 40 ryo, weight 1). Ryo varies by 25%.
- At night: 2 walk in first, then one every 20 s, up to 6 at once and 12 a night, from the map's `edges` (spawn points at least 25 steps away, `minDistance`). They wander between `pois` (6 to 15 s per spot) and walk out at dawn.
- Neutral until hit; then they and every bandit within 8 steps fight that clan, giving up after 10 s without being hit or with nobody of it within 15 steps.
- No downing (they die at 0 HP) and no heat. The ryo goes to the killer's clan, with a gold "Bandit killed +20 ryo" notice by the heat gauge (`state.ryoGains`).
