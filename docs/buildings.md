# Buildings

Index of every building image (2026-10-18). Use the # to name a building in chat. Add a row whenever a new building is cut.

- **Code id:** the key in `game/art/cutouts.json`; for buildings placed on the map, also the business id `b<n>` (its index in `buildings` in `game/data/port_town.json`; b0-b13 keep their old waterfront ids). "On the map" means placed in `port_town.json` (2026-10-19).
- **Sorted copy:** a copy of every image grouped by area in `assets/environment/buildings/` (town, waterfront, wilderness, ninja_village; source sheets listed in its `index.txt`). The game still loads the **Image** path.
- Town and waterfront buildings are cut by `tools/cut_environment.py` from the sheets in `assets/environment/`. Cells are read left to right, top to bottom.

## Town and waterfront

| # | Name | Code id | Image | Source sheet, cell | On the map | Game role | Sorted copy |
|---|---|---|---|---|---|---|---|
| 1 | Teahouse | `buildings/teahouse`; `b5` | `game/art/buildings/teahouse.png` | buildings1.png, top left | yes (b5) | Teahouse = barracks (hire crew) | `assets/environment/buildings/town/teahouse.png` |
| 2 | Gambling den | `buildings/gambling_den`; `b6` | `game/art/buildings/gambling_den.png` | buildings1.png, top middle | yes (b6) | Gambling den (most money, most heat) | `assets/environment/buildings/town/gambling_den.png` |
| 3 | Warehouse | `buildings/warehouse`; `b0` | `game/art/buildings/warehouse.png` | buildings1.png, top right | yes (b0) | Warehouse (storage, smuggling) | `assets/environment/buildings/waterfront/warehouse.png` |
| 4 | Townhouse | `buildings/townhouse`; `b10` | `game/art/buildings/townhouse.png` | buildings1.png, middle left | yes (b10) |  | `assets/environment/buildings/town/townhouse.png` |
| 5 | Shop | `buildings/shop`; `b7` | `game/art/buildings/shop.png` | buildings1.png, centre | yes (b7) |  | `assets/environment/buildings/town/shop.png` |
| 6 | Shrine | `buildings/shrine`; `b13` | `game/art/buildings/shrine.png` | buildings1.png, middle right | yes (b13) |  | `assets/environment/buildings/wilderness/shrine.png` |
| 7 | Sake brewery | `buildings/sake_brewery`; `b2` | `game/art/buildings/sake_brewery.png` | buildings1.png, bottom left | yes (b2) |  | `assets/environment/buildings/town/sake_brewery.png` |
| 8 | Abandoned house | `buildings/abandoned_house`; `b8` | `game/art/buildings/abandoned_house.png` | buildings1.png, bottom middle | yes (b8) |  | `assets/environment/buildings/town/abandoned_house.png` |
| 9 | Western office | `buildings/western_office` | `game/art/buildings/western_office.png` | buildings1.png, bottom right | no (not used in port_town) |  | `assets/environment/buildings/town/western_office.png` |
| 10 | Watch post | `buildings/watch_post` | `game/art/buildings/watch_post.png` | buildings2.png, top left | no (not used in port_town) |  | `assets/environment/buildings/waterfront/watch_post.png` |
| 11 | Dock warehouse | `buildings/dock_warehouse`; `b12` | `game/art/buildings/dock_warehouse.png` | buildings2.png, top middle | yes (b12) |  | `assets/environment/buildings/waterfront/dock_warehouse.png` |
| 12 | Manor | `buildings/manor`; `b14` | `game/art/buildings/manor.png` | buildings2.png, top right | yes (b14) |  | `assets/environment/buildings/town/manor.png` |
| 13 | Inn | `buildings/inn`; `b4` | `game/art/buildings/inn.png` | buildings2.png, middle left | yes (b4) |  | `assets/environment/buildings/town/inn.png` |
| 14 | Blacksmith | `buildings/blacksmith`; `b27` | `game/art/buildings/blacksmith.png` | buildings2.png, centre | yes (b27) |  | `assets/environment/buildings/town/blacksmith.png` |
| 15 | Bathhouse | `buildings/bathhouse`; `b11` | `game/art/buildings/bathhouse.png` | buildings2.png, middle right | yes (b11) |  | `assets/environment/buildings/town/bathhouse.png` |
| 16 | Forest hut | `buildings/forest_hut`; `b32` | `game/art/buildings/forest_hut.png` | buildings2.png, bottom left | yes (b32) |  | `assets/environment/buildings/wilderness/forest_hut.png` |
| 17 | Bandit camp | `buildings/bandit_camp`; `b31` | `game/art/buildings/bandit_camp.png` | buildings2.png, bottom middle | yes (b31) |  | `assets/environment/buildings/wilderness/bandit_camp.png` |
| 18 | Bridge | `buildings/bridge` | `game/art/buildings/bridge.png` | buildings2.png, bottom right | no (not used in port_town) |  | `assets/environment/buildings/wilderness/bridge.png` |
| 19 | Bonesetter's clinic | `buildings/clinic`; `b9` | `game/art/buildings/clinic.png` | buildings4.png, top left | yes (b9) | Bonesetter's clinic = hospital | `assets/environment/buildings/town/clinic.png` |
| 20 | Pawnshop | `buildings/pawnshop`; `b23` | `game/art/buildings/pawnshop.png` | buildings4.png, top middle | yes (b23) |  | `assets/environment/buildings/town/pawnshop.png` |
| 21 | Rice storehouse (kura) | `buildings/rice_storehouse`; `b28` | `game/art/buildings/rice_storehouse.png` | buildings4.png, top right | yes (b28) |  | `assets/environment/buildings/waterfront/rice_storehouse.png` |
| 22 | Izakaya | `buildings/izakaya`; `b21` | `game/art/buildings/izakaya.png` | buildings4.png, middle left | yes (b21) |  | `assets/environment/buildings/town/izakaya.png` |
| 23 | Fish market stall | `buildings/fish_market`; `b24` | `game/art/buildings/fish_market.png` | buildings4.png, centre | yes (b24) |  | `assets/environment/buildings/waterfront/fish_market.png` |
| 24 | Geisha house | `buildings/geisha_house`; `b18` | `game/art/buildings/geisha_house.png` | buildings4.png, middle right | yes (b18) |  | `assets/environment/buildings/town/geisha_house.png` |
| 25 | Customs house | `buildings/customs_house`; `b25` | `game/art/buildings/customs_house.png` | buildings4.png, bottom left | yes (b25) |  | `assets/environment/buildings/waterfront/customs_house.png` |
| 26 | Boatbuilder's shed | `buildings/boatbuilder`; `b29` | `game/art/buildings/boatbuilder.png` | buildings4.png, bottom middle | yes (b29) |  | `assets/environment/buildings/waterfront/boatbuilder.png` |
| 27 | Nagaya tenements | `buildings/tenements`; `b20` | `game/art/buildings/tenements.png` | buildings4.png, bottom right | yes (b20) |  | `assets/environment/buildings/town/tenements.png` |

## Ninja village

On the map since 2026-10-20 (ninja build): the Shinobi village in the west forest, at the end of the `port_town.json` buildings. The longhouse is the ninja hideout (`"hideout":"ninja"`, claimed by a ninja clan instead of the inn; territory circle at -97, 48, radius 26). The dojo is a new business kind with a warehouse room; the Shinobi hire only in the dojo or longhouse (`clans.hallOf`); J on the minimap. The shrine is the contract board (`ninja_shrine`, `"business":"contract_board"`). Scenery: training yard, watchtower, storehouse, gatehouse, 2 huts. Art cut via `SINGLES` in `tools/cut_environment.py`, listed in `art.json` and `buildings.json`. Glowing mushrooms line the two village bridges (`glowShrooms`, drawing only). The rows below still show the original sheet status.

Map growth (2026-10-20): bounds x -112..100, z -56..94, forest all round except the sea side. A forest stream runs along the old west edge with two plank bridges (west trail at z 48, southeast trail to the west road at z -7); the canal runs north into the stream. Bandit way-in edges moved to the new edges; `noPoliceAreas` cover the new forest.

| # | Name | Code id | Image | Source sheet, cell | On the map | Game role | Sorted copy |
|---|---|---|---|---|---|---|---|
| 28 | Dojo | none yet | `assets/environment/ninja_village/dojo.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/dojo.png` |
| 29 | Longhouse | none yet | `assets/environment/ninja_village/longhouse.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/longhouse.png` |
| 30 | Rope bridge | none yet | `assets/environment/ninja_village/rope_bridge.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/rope_bridge.png` |
| 31 | Shrine | none yet | `assets/environment/ninja_village/shrine.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/shrine.png` |
| 32 | Storehouse | none yet | `assets/environment/ninja_village/storehouse.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/storehouse.png` |
| 33 | Thatched hut | none yet | `assets/environment/ninja_village/thatched_hut.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/thatched_hut.png` |
| 34 | Training yard | none yet | `assets/environment/ninja_village/training_yard.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/training_yard.png` |
| 35 | Village gate | none yet | `assets/environment/ninja_village/village_gate.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/village_gate.png` |
| 36 | Watchtower | none yet | `assets/environment/ninja_village/watchtower.png` | ninja village sheet (already cut) | no | | `assets/environment/buildings/ninja_village/watchtower.png` |

## New town and waterfront buildings (2026-10-18)

From `buildings5.png`, which is not an even grid, so each building was cut along its outline. Only the police box and HQ are in `game/art` and on the map (2026-10-18); the rest are not placed yet.

| # | Name | Code id | Image | Source sheet, cell | On the map | Game role | Sorted copy |
|---|---|---|---|---|---|---|---|
| 37 | Police box | `buildings/police_box`; `b1`, `b33` | `game/art/buildings/police_box.png` | buildings5.png, building 1 (cut along outlines) | yes (b1, b33) | Bribes (see `police_spec.md`) | `assets/environment/buildings/town/police_box.png` |
| 38 | Police HQ | `buildings/police_hq`; `b3` | `game/art/buildings/police_hq.png` | buildings5.png, building 2 (cut along outlines) | yes (b3) | Police HQ and jail, bail | `assets/environment/buildings/town/police_hq.png` |
| 39 | Kabuki theatre | `buildings/kabuki_theatre`; `b17` | `game/art/buildings/kabuki_theatre.png` | buildings5.png, building 3 (cut along outlines) | yes (b17) | | `assets/environment/buildings/town/kabuki_theatre.png` |
| 40 | Temple | `buildings/temple`; `b15` | `game/art/buildings/temple.png` | buildings5.png, building 4 (cut along outlines) | yes (b15) | | `assets/environment/buildings/town/temple.png` |
| 41 | Rickshaw station | `buildings/rickshaw_station`; `b22` | `game/art/buildings/rickshaw_station.png` | buildings5.png, building 5 (cut along outlines) | yes (b22) | | `assets/environment/buildings/town/rickshaw_station.png` |
| 42 | Food stalls | `buildings/food_stalls`; `b19` | `game/art/buildings/food_stalls.png` | buildings5.png, building 6 (cut along outlines) | yes (b19) | | `assets/environment/buildings/town/food_stalls.png` |
| 43 | Moneylender's house | `buildings/moneylender_house`; `b16` | `game/art/buildings/moneylender_house.png` | buildings5.png, building 7 (cut along outlines) | yes (b16) | | `assets/environment/buildings/town/moneylender_house.png` |
| 44 | Lighthouse | `buildings/lighthouse`; `b30` | `game/art/buildings/lighthouse.png` | buildings5.png, building 8 (cut along outlines) | yes (b30) | | `assets/environment/buildings/waterfront/lighthouse.png` |
| 45 | Telegraph office | `buildings/telegraph_office`; `b26` | `game/art/buildings/telegraph_office.png` | buildings5.png, building 9 (cut along outlines) | yes (b26) | | `assets/environment/buildings/town/telegraph_office.png` |
