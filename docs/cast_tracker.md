# Cast tracker

Progress of each concept through the character pipeline (see `art_direction.md`). Filled from the game folder on 2026-10-14. All 22 Tencent zips were checked valid on 2026-10-15 (1 .obj, material.mtl, 4 textures each).

- **Tencent zip**: OBJ zip in `assets/models/source`.
- **Mixamo rigged**: with-skin `assets/models/<name>.fbx`.
- **Sheets**: exported to `assets/sprites/<name>_*.png`.
- **Anim set**: the animation subfolder the export pairs it with (`civilian` unless listed in `tools/export_sprites.mjs`).

| Concept | Role | Tencent zip | Mixamo rigged | Sheets | Anim set |
|---|---|---|---|---|---|
| hero1 (ronin) | Hero | ✅ roninheroobj1.zip | ✅ ronin.fbx | ✅ 10 (160px) | combat |
| mercenary1 | Hero | ✅ mercobj1.zip | ✅ mercenary.fbx | ✅ 7 (160px), with rifle | gunner |
| Western gunslinger | Unassigned concept; possible mercenary/enemy | concept art only; see below | — | — | pending |
| Western dockside bruiser | Unassigned concept; possible mercenary/enemy | concept art only; see below | — | — | pending |
| brute1 | Hero | ✅ bruteobj1.zip | ✅ brute.fbx | ✅ 9 (160px, 1.12x scale) | brawler (+ Mutant files) |
| ninja_leader | Hero (ninja); cape rigged fine | ✅ ninjaleader2obj.zip (ninja_leader2 concept) | ✅ ninja_leader.fbx | ✅ 8 (160px), with ninjato (shortened) | ninja |
| ninja1 | Spare concept, no model planned (ninja_leader is the ninja hero) |  |  |  |  |
| thug | Crew | ✅ thugobj1.zip | ✅ thug.fbx | ✅ 7 (160px) | brawler |
| swordsman | Crew | ✅ | ✅ (Great Sword Idle) | ✅ 10 (walk borrowed from brawler) | combat, katana |
| archer | Crew | ✅ | ✅ archer.fbx | ✅ 6 (160px), with bow | archer |
| Kuroda spear guard | Kuroda tank recruit (new model) | concept approved; see below | — | — | pending |
| Shinobi masked bodyguard | Shinobi dodge tank (new model) | concept approved; see below | — | — | pending |
| lookout | Crew | ✅ | ✅ | ✅ 7 | brawler |
| demolitions | Crew | ✅ demoobj1.zip | ✅ | ✅ 7 | brawler |
| ninja_grunt | Crew | ✅ | ✅ | ✅ 8 (blade tip touches the top in 2 frames of slash 2) | ninja, ninjato |
| police_officer | Enemy, medium rig risk: cape | ✅ policemanobj1.zip | ✅ police.fbx (was policeman2) | ✅ 7, with jitte (2026-10-18) | brawler |
| bandit | Enemy | ✅ | ✅ | ✅ 7 (cloak touches the edge at the end of dying) | brawler |
| rival_yakuza | Enemy | ✅ femyakuza2obj1.zip (concept rivalyakuza2) | ✅ | ✅ 10 (walk borrowed from brawler) | combat, katana (confirmed by Tim); wired into `data/art.json` 2026-10-19 (bot hero, `?raidme` boss) |
| merchant | Townsfolk | ✅ (concept merchant2) | ✅ | ✅ 6 | civilian |
| geisha | Townsfolk | ✅ geisha2 zip (the older geisha zip won't rig) | ✅ geisha.fbx (was geisha2) | ✅ 6; robe flares as she lands in the new death (Tim: keep) | civilian |
| laborer | Townsfolk | ✅ | ✅ | ✅ 6 | civilian |
| fisherman | Townsfolk | ✅ | ✅ | ✅ 6 (empty-handed) | civilian |
| monk | Townsfolk | ✅ monk3obj1.zip (redrawn concept monk3) | ✅ monk.fbx | ✅ 6 (160px), exported 2026-10-17 | civilian |
| monk2 | Townsfolk, second take | ✅ monk4obj1.zip (concept monk4) | ✅ monk2.fbx | ✅ 6 (160px), exported 2026-10-17 | civilian |
| old_woman | Townsfolk | ✅ oldwoman2obj1.zip (concept oldwoman2) | ✅ old_woman.fbx | ✅ 6 (160px), exported 2026-10-17 | civilian |
| sailor | Townsfolk | ✅ | ✅ | ✅ 6 | civilian |

## Held items (assets/models/items)

Checked 2026-10-14: all four rigged models (ronin, thug, brute, mercenary) are empty-handed, and every concept prompt says "nothing in the hands", so every weapon is a separate item model.

Thin items are image slabs made by `tools/make_slabs.py` from `assets/concepts/items/*.png` (white cut out, tip at the front, image on both faces). Bulky items stay Tencent GLBs for later.

| Item | Used by | Model | Attached in export |
|---|---|---|---|
| rifle | mercenary | ✅ slab | ✅ both hands |
| katana | ronin, swordsman, rival_yakuza | ✅ built in code (see Weapon look pass) | ✅ both hands; held point-up from the right hand when the hands part (idle, walk); while running it trails behind the hand with a 12° tip drop (`runBack`, 2026-10-19) |
| ninjato | ninja_leader, ninja_grunt | ✅ slab | ✅ right hand |
| tanto | | ✅ slab | |
| jitte | police | ✅ built in code (procedural, 2026-10-18) | ✅ right hand |
| spear | | ✅ slab | |
| wooden_club | thug, brute (until a kanabo model exists) | ✅ built in code (see Weapon look pass) | ✅ right hand; brute's club tip touches the top edge in a few frames |
| bow | archer | ✅ slab | ✅ left hand |
| revolver | | ✅ slab | |
| shuriken (one star) | | ✅ slab | |
| folding_fan | | ✅ slab | |
| fishing_rod | | ✅ slab | |
| monk_staff | | ✅ slab | |
| kanabo, quiver, dynamite, fuse_bomb, paper_lantern, carrying_pole | | Tencent GLB later | |

## Animation sets in assets/animations

Save Mixamo downloads under their own names in the set's subfolder.

For a new character, keep one with-skin FBX for its rig; reuse the shared without-skin animation clips. Download additional clips without skin only when needed and place them in the appropriate existing animation set.

- **brawler/** (thug, brute): `Walking`, `Running`, `Hit Reaction` are copies of the ronin's walk (a copy of `ronin.fbx`, whose walk is built in), run and reaction. Tim's own: `Fighting Idle`, `Punching`, `Hook Punch`, `Dying` (saved with a `_noskin` tag, which the export ignores). Brute-only: `Mutant Idle`, `Mutant Punch`, `Mutant Walking` (replaces `Walking` for the brute). A Mixamo download saved under the same name replaces the copy. `Mutant ...` files are brute-only.
- **combat** (ronin, files directly in the folder): 9 files plus the walk built into `ronin.fbx`.
- **gunner/** (mercenary): Rifle Aiming Idle, Walk With Rifle, Rifle Run, Firing Rifle, Reloading, Hit Reaction, Death From The Front. The rifle is attached by the export.
- **ninja/** (ninja_leader, ninja_grunt): Fighting Idle, Sneak Walk, Fast Run, Sword And Shield Slash, Sword And Shield Slash 2, Pointing, Hit Reaction, Standing Death Forward 02, Stand To Roll (exported 2026-10-17 for both: 28 frames, 8 directions, 160px; not in the game yet).
- **archer/** (archer): Standing Draw Arrow, Standing Aim Recoil, Standing Aim Walk Forward, Standing Run Forward, Standing React Small From Front 02, Standing Death Backward 01.
- **civilian/** (geisha, default for townsfolk): Standing Idle, Catwalk Walk Forward, Scared, Quick Formal Bow, Gentle Reaction (hit), Standing Death Forward 01 (death). Terrified was skipped (sleeves). Dying and Zombie Reaction Hit were retired 2026-10-16 to assets/animations_retired/civilian/; the geisha's old sheets were deleted; the other townsfolk's old *_dying / *_zombie_reaction_hit sheets are kept (Tim, 2026-10-16).

Export note (2026-10-16): clips that stay in place (idles, in-place walks) keep their own hip sway so planted feet don't slide; clips that travel (runs, jumps, lunges) still have the hips pinned. All sheets were re-exported with this.

## Weapon look pass (2026-10-16)

Katana and wooden club are now built in code by `look_tests/sprite_render_test.html` (`PROC_ITEMS`, `ITEMS.proc` in `tools/export_sprites.mjs`) instead of using the image slabs: drawn faceted blade with edge glint, wrapped hilt, gold fittings; ironwood club with leather grip, iron bands and studs; both get a cool moonlight rim. Hands are fitted to the palm centre (both-hand katana) and the club uses a hammer grip (`dir` in the hand bone frame). Preview: `look_tests/weapon_preview.png`. Katana length 1.3 with a strong curve (SORI 0.1); clubs 1.1 (thug) and 1.15 (brute). Tim OK'd 2026-10-16: ronin, swordsman, rival_yakuza, thug, brute (46 sheets) re-exported; the previous versions are kept in `assets/sprites_archive/2026-10-16_weapons/`.

Katana fix 2026-10-17 (Tim playtest): curve reversed (tip curves up, edge down); when the hands part the katana is held point-up and forward from the right hand instead of hanging across the body. ronin, swordsman, rival_yakuza re-exported (30 sheets); originals in assets/sprites_archive/2026-10-16_weapons/.

Run sword fix 2026-10-19: the katana trails behind the hand while running (`runBack` in `tools/export_sprites.mjs` and `look_tests/sprite_render_test.html`, 12° tip drop). ronin, swordsman, rival_yakuza run and run glow sheets re-exported; old ones in `assets/sprites_archive/2026-10-19_run_sword/`.

Police jitte and weapon glow (2026-10-18): the police sheets were re-exported holding a procedural jitte (old sheets in `assets/sprites_archive/2026-10-18_police_jitte/`). All six armed models (police, ronin, swordsman, rival_yakuza, thug, brute) have `_glow` sheets for the weapon glow (`tools/export_sprites.mjs --glow-only`).

## Ninja look (2026-10-20, Tim OK'd)

Ninja blades 40% bigger, held in the left hand in idle/walk/pointing, tip back and 45° up; thin dark purple glow (`weapon_glow.json` `ninjato`); hidden opacity 0.8 plus a slight purple shimmer. Old sheets: `assets/sprites_archive/2026-10-20_ninja_small_blade`.

## Ninja (tanto) (Tim, 2026-10-21)

One additional recruit using the existing ninja_grunt rig; ninja1 concept excluded. Nine animation/glow pairs (18 production `ninja_tanto_*.png` sheets), leaving old ninja sheets intact. Palm-fitted tanto: forward/up 45° idle; reverse grip trailing nearly level (5° drop) while running; attack rotations retained. Charcoal halo with tight pale-silver weapon-only additive edge, brighter on swings. Exporter supports rig aliases and per-item palm/idle/run settings. No duplicated model.

## Kuroda spear kit (Tim, 2026-10-22)

Existing female leader uses one-handed yari and compact shield; exclusive spearman uses the related recruit rig. Approved production export: 24 colour/glow sheets, including Upward Thrust and Bayonet Stab clips; old sheets retained in `assets/sprites_archive/2026-10-22_kuroda_spear/`. Hero spear has a warm gold halo/crimson core; recruit glow is subdued deep red. Ability effects: [combat spec](combat_spec.md#kuroda-leader-kit-tim-2026-10-22).

## Phase 8 tank recruit concepts (Tim approved, 2026-10-30)

New models are required for both concepts: the existing swordsman rig is explicitly rejected for the Kuroda guard, and the Shinobi guard needs a fresh masked bodyguard model. Tim approved both generated concepts. Weapon/source attachments were intentionally excluded for separate attachment work.

| Recruit | Approved concept | Prompt provenance | Next |
|---|---|---|---|
| Kuroda spear guard | [`assets/concepts/kuroda_spear_guard.png`](../assets/concepts/kuroda_spear_guard.png): stocky armored ashigaru with long shield and one-handed spear attachments | [`kuroda_spear_guard.prompt.txt`](../assets/concepts/kuroda_spear_guard.prompt.txt) | Tencent image-to-3D, then fresh Mixamo rig |
| Shinobi masked bodyguard | [`assets/concepts/shinobi_masked_bodyguard.png`](../assets/concepts/shinobi_masked_bodyguard.png): athletic masked, armored dodge tank | [`shinobi_masked_bodyguard.prompt.txt`](../assets/concepts/shinobi_masked_bodyguard.prompt.txt) | Tencent image-to-3D, then fresh Mixamo rig |

These are concept images only; neither is a rigged 3D model or an exported sprite sheet.

## Western character concepts (art only, 2026-10-30)

These are visual concepts for possible future mercenary/enemy roles; neither role nor gameplay/roster use is approved. No model or rig work is underway.

| Concept | Image | Prompt |
|---|---|---|
| Western gunslinger: lean build, waistcoat and short coat | [`assets/concepts/western_gunslinger.png`](../assets/concepts/western_gunslinger.png) | [`western_gunslinger.prompt.txt`](../assets/concepts/western_gunslinger.prompt.txt) |
| Western dockside bruiser: broad muscular sailor, tattoos and suspenders | [`assets/concepts/western_dockside_bruiser.png`](../assets/concepts/western_dockside_bruiser.png) | [`western_dockside_bruiser.prompt.txt`](../assets/concepts/western_dockside_bruiser.prompt.txt) |

## Shinobi geisha runtime alias (2026-10-26)

`shinobi_geisha` reuses the adult geisha sheets through a model alias, with a subtle violet aura and an active violet ring. Dance: `assets/sprites/geisha_arms_hip_hop_dance.png` (64 frames, first 5.33 s of Mixamo "Arms Hip Hop Dance" at 12 fps; source `assets/animations/Arms Hip Hop Dance.fbx`; `art.json` `shinobi_geisha.dance`). The dance plays while she charms (lure, 2026-10-27); attack still uses the formal-bow placeholder.

## Brute looks (2026-10-29)

The hireable Brute uses the demolitions look; the night brutes use the lookout look.

## Kuroda hero blade/lightning (2026-10-28)

Hero `rival_yakuza` only: twelve production color/glow sheets re-exported across six clips using `spear_hero`, length 2.05/grip 0.36, broader leaf head (normalized 0.66–1, about 88% longer blade), crimson ridge/gold edge. Recruit spearman geometry/config is unchanged. Previous twelve hero sheets preserved in `assets/sprites_archive/2026-10-28_hero_blade/` (about 10 MB).

`weapon_lightning.js`/`weapon_lightning_pattern.js` replace this hero's shimmer/trail with quiet crimson base and pale-hot branching red discharges: uneven leader steps, thinner rooted forks, rapid pulses and stronger thrusts. Blade-mask axis is read once per sheet; reusable mesh/buffers disposed with sprite. Respect opacity/depth; suppress on death/missing mask. Rules/stats unchanged.

Build coordinator reports lightning/assets checks passed, offline margin check found zero clipped poses, syntax/diff checks clean. User-requested offline actual-CharacterSprite animation preview ran without renderer errors; this is not browser/full-gameplay testing. Generated preview outputs remain local review artifacts, not production assets.

## Shinobi hero shadow blade (2026-10-28)

`ninjato_hero` uses void/shadow preset: tight silver edge/dark halo, blade-clinging black-violet wisps and recent slash ribbons closing inward. Actual critical hits trigger two delayed fading echoes through `view.addHits` and `shadowBlade.critical()`. Shape/sim stats, recruit/tanto effects and Kuroda lightning unchanged.

`weapon_shadow.js` uses existing blade-only frame-mask axes, bounded reusable geometry/materials, inherited opacity/depth/visibility, death/missing-mask suppression and sprite disposal. Build coordinator reports syntax/diff and shared attachment `test_weapon_lightning` checks passed; requested offline production-renderer preview regenerated without errors. Preview source is committed; generated shadow GIF remains local. No new test run/full-game browser/visual-playtest approval claimed by this note.

## Hero weapon effects (2026-10-29, render-only)

Ninja: idle wisps, running trail, stronger cut (`render/weapon_shadow.js`). Ronin: "sonic" run trail and hum rings. Kuroda: "static" run streaks, crimson sparks, extra swing arc (`render/run_trail.js`, `weapon_glow.json` `runTrail`). Details: `combat_spec.md` "Hero visual polish".
