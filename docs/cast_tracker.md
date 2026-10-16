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
| police_officer | Enemy, medium rig risk: cape | ✅ policemanobj1.zip |  |  |  |
| bandit | Enemy | ✅ |  |  |  |
| rival_yakuza | Enemy | ✅ femyakuza2obj1.zip (concept rivalyakuza2) | ✅ | ✅ 10 (walk borrowed from brawler) | combat, katana (confirmed by Tim) |
| merchant | Townsfolk | ✅ (concept merchant2) | ✅ | ✅ 6 | civilian |
| geisha | Townsfolk | ✅ geisha2 zip (the older geisha zip won't rig) | ✅ geisha.fbx (was geisha2) | ✅ 6; robe flares as she lands in the new death (Tim: keep) | civilian |
| laborer | Townsfolk | ✅ | ✅ | ✅ 6 | civilian |
| fisherman | Townsfolk | ✅ | ✅ | ✅ 6 (empty-handed) | civilian |
| monk | Townsfolk, high rig risk: long robe, draped sleeves | ✅ monk1obj1.zip |  |  | civilian |
| monk2 | Townsfolk, second take, high rig risk: long robe, draped sleeves | ✅ |  |  | civilian |
| old_woman | Townsfolk, high rig risk: arms near long robe | ✅ |  |  | civilian |
| sailor | Townsfolk | ✅ | ✅ | ✅ 6 | civilian |

## Held items (assets/models/items)

Checked 2026-10-14: all four rigged models (ronin, thug, brute, mercenary) are empty-handed, and every concept prompt says "nothing in the hands", so every weapon is a separate item model.

Thin items are image slabs made by `tools/make_slabs.py` from `assets/concepts/items/*.png` (white cut out, tip at the front, image on both faces). Bulky items stay Tencent GLBs for later.

| Item | Used by | Model | Attached in export |
|---|---|---|---|
| rifle | mercenary | ✅ slab | ✅ both hands |
| katana (sheathed for now) | swordsman, rival_yakuza | ✅ slab | ✅ both hands (length 0.95) |
| ninjato | ninja_leader, ninja_grunt | ✅ slab | ✅ right hand |
| tanto | | ✅ slab | |
| jitte | | ✅ slab | |
| spear | | ✅ slab | |
| wooden_club | | ✅ slab | |
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
- **ninja/** (ninja_leader, ninja_grunt): Fighting Idle, Sneak Walk, Fast Run, Sword And Shield Slash, Sword And Shield Slash 2, Pointing, Hit Reaction, Standing Death Forward 02.
- **archer/** (archer): Standing Draw Arrow, Standing Aim Recoil, Standing Aim Walk Forward, Standing Run Forward, Standing React Small From Front 02, Standing Death Backward 01.
- **civilian/** (geisha, default for townsfolk): Standing Idle, Catwalk Walk Forward, Scared, Quick Formal Bow, Gentle Reaction (hit), Standing Death Forward 01 (death). Terrified was skipped (sleeves). Dying and Zombie Reaction Hit were retired 2026-10-16 to assets/animations_retired/civilian/; the geisha's old sheets were deleted; the other townsfolk's old *_dying / *_zombie_reaction_hit sheets are kept (Tim, 2026-10-16).

Export note (2026-10-16): clips that stay in place (idles, in-place walks) keep their own hip sway so planted feet don't slide; clips that travel (runs, jumps, lunges) still have the hips pinned. All sheets were re-exported with this.
