# Buildings

Index of every building image (2026-10-18). Use the # to name a building in chat. Add a row whenever a new building is cut.

- **Code id:** the key in `game/art/cutouts.json`; for buildings placed on the map, also the business id `b<n>` (its index in `buildings` in `game/data/waterfront.json`).
- Town and waterfront buildings are cut by `tools/cut_environment.py` from the sheets in `assets/environment/`. Cells are read left to right, top to bottom.

## Town and waterfront

| # | Name | Code id | Image | Source sheet, cell | On the map | Game role |
|---|---|---|---|---|---|---|
| 1 | Teahouse | `buildings/teahouse`; `b5` | `game/art/buildings/teahouse.png` | buildings1.png, top left | yes (b5) | Teahouse = barracks (hire crew) |
| 2 | Gambling den | `buildings/gambling_den`; `b6` | `game/art/buildings/gambling_den.png` | buildings1.png, top middle | yes (b6) | Gambling den (most money, most heat) |
| 3 | Warehouse | `buildings/warehouse`; `b0` | `game/art/buildings/warehouse.png` | buildings1.png, top right | yes (b0) | Warehouse (storage, smuggling) |
| 4 | Townhouse | `buildings/townhouse`; `b10` | `game/art/buildings/townhouse.png` | buildings1.png, middle left | yes (b10) |  |
| 5 | Shop | `buildings/shop`; `b7` | `game/art/buildings/shop.png` | buildings1.png, centre | yes (b7) |  |
| 6 | Shrine | `buildings/shrine`; `b13` | `game/art/buildings/shrine.png` | buildings1.png, middle right | yes (b13) |  |
| 7 | Sake brewery | `buildings/sake_brewery`; `b2` | `game/art/buildings/sake_brewery.png` | buildings1.png, bottom left | yes (b2) |  |
| 8 | Abandoned house | `buildings/abandoned_house`; `b8` | `game/art/buildings/abandoned_house.png` | buildings1.png, bottom middle | yes (b8) |  |
| 9 | Western office | `buildings/western_office`; `b3` | `game/art/buildings/western_office.png` | buildings1.png, bottom right | yes (b3) |  |
| 10 | Watch post | `buildings/watch_post`; `b1` | `game/art/buildings/watch_post.png` | buildings2.png, top left | yes (b1) |  |
| 11 | Dock warehouse | `buildings/dock_warehouse`; `b12` | `game/art/buildings/dock_warehouse.png` | buildings2.png, top middle | yes (b12) |  |
| 12 | Manor | `buildings/manor` | `game/art/buildings/manor.png` | buildings2.png, top right | no |  |
| 13 | Inn | `buildings/inn`; `b4` | `game/art/buildings/inn.png` | buildings2.png, middle left | yes (b4) |  |
| 14 | Blacksmith | `buildings/blacksmith` | `game/art/buildings/blacksmith.png` | buildings2.png, centre | no |  |
| 15 | Bathhouse | `buildings/bathhouse`; `b11` | `game/art/buildings/bathhouse.png` | buildings2.png, middle right | yes (b11) |  |
| 16 | Forest hut | `buildings/forest_hut` | `game/art/buildings/forest_hut.png` | buildings2.png, bottom left | no |  |
| 17 | Bandit camp | `buildings/bandit_camp` | `game/art/buildings/bandit_camp.png` | buildings2.png, bottom middle | no |  |
| 18 | Bridge | `buildings/bridge` | `game/art/buildings/bridge.png` | buildings2.png, bottom right | no |  |
| 19 | Bonesetter's clinic | `buildings/clinic`; `b9` | `game/art/buildings/clinic.png` | buildings4.png, top left | yes (b9) | Bonesetter's clinic = hospital |
| 20 | Pawnshop | `buildings/pawnshop` | `game/art/buildings/pawnshop.png` | buildings4.png, top middle | no |  |
| 21 | Rice storehouse (kura) | `buildings/rice_storehouse` | `game/art/buildings/rice_storehouse.png` | buildings4.png, top right | no |  |
| 22 | Izakaya | `buildings/izakaya` | `game/art/buildings/izakaya.png` | buildings4.png, middle left | no |  |
| 23 | Fish market stall | `buildings/fish_market` | `game/art/buildings/fish_market.png` | buildings4.png, centre | no |  |
| 24 | Geisha house | `buildings/geisha_house` | `game/art/buildings/geisha_house.png` | buildings4.png, middle right | no |  |
| 25 | Customs house | `buildings/customs_house` | `game/art/buildings/customs_house.png` | buildings4.png, bottom left | no |  |
| 26 | Boatbuilder's shed | `buildings/boatbuilder` | `game/art/buildings/boatbuilder.png` | buildings4.png, bottom middle | no |  |
| 27 | Nagaya tenements | `buildings/tenements` | `game/art/buildings/tenements.png` | buildings4.png, bottom right | no |  |

## Ninja village

Not used by the game code yet.

| # | Name | Code id | Image | Source sheet, cell | On the map | Game role |
|---|---|---|---|---|---|---|
| 28 | Dojo | none yet | `assets/environment/ninja_village/dojo.png` | ninja village sheet (already cut) | no | |
| 29 | Longhouse | none yet | `assets/environment/ninja_village/longhouse.png` | ninja village sheet (already cut) | no | |
| 30 | Rope bridge | none yet | `assets/environment/ninja_village/rope_bridge.png` | ninja village sheet (already cut) | no | |
| 31 | Shrine | none yet | `assets/environment/ninja_village/shrine.png` | ninja village sheet (already cut) | no | |
| 32 | Storehouse | none yet | `assets/environment/ninja_village/storehouse.png` | ninja village sheet (already cut) | no | |
| 33 | Thatched hut | none yet | `assets/environment/ninja_village/thatched_hut.png` | ninja village sheet (already cut) | no | |
| 34 | Training yard | none yet | `assets/environment/ninja_village/training_yard.png` | ninja village sheet (already cut) | no | |
| 35 | Village gate | none yet | `assets/environment/ninja_village/village_gate.png` | ninja village sheet (already cut) | no | |
| 36 | Watchtower | none yet | `assets/environment/ninja_village/watchtower.png` | ninja village sheet (already cut) | no | |
