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
| brute1 | Hero | ✅ bruteobj1.zip | ✅ brute.fbx | ✅ 9 (160px, 1.12x scale) | brawler (+ Mutant files) |
| ninja_leader | Hero (ninja); cape rigged fine | ✅ ninjaleader2obj.zip (ninja_leader2 concept) | ✅ ninja_leader.fbx | ✅ 8 (160px), with ninjato (shortened) | ninja |
| ninja1 | Spare concept, no model planned (ninja_leader is the ninja hero) |  |  |  |  |
| thug | Crew | ✅ thugobj1.zip | ✅ thug.fbx | ✅ 7 (160px) | brawler |
| swordsman | Crew | ✅ | ✅ (Great Sword Idle) | ✅ 10 (walk borrowed from brawler) | combat, katana |
| archer | Crew | ✅ | ✅ archer.fbx | ✅ 6 (160px), with bow | archer |
| lookout | Crew | ✅ | ✅ | ✅ 7 | brawler |
| demolitions | Crew | ✅ demoobj1.zip | ✅ | ✅ 7 | brawler |
| ninja_grunt | Crew | ✅ | ✅ | ✅ 8 (blade tip touches the top in 2 frames of slash 2) | ninja, ninjato |
| police_officer | Enemy, medium rig risk: cape | ✅ policemanobj1.zip | ✅ police.fbx (was policeman2) | ✅ 7, with jitte (2026-10-18) | brawler |
| bandit | Enemy | ✅ | ✅ | ✅ 7 (cloak touches the edge at the end of dying) | brawler |
| rival_yakuza | Enemy | ✅ femyakuza2obj1.zip (concept rivalyakuza2) | ✅ | ✅ 10 (walk borrowed from brawler) | combat, katana (confirmed by Tim) |
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
