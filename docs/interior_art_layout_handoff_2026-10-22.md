# Interior art and layout handoff — 2026-10-22

The user approved the new interior artwork and requested logical, visually aligned layouts. The earlier interior pass was committed as `369d50f`. The four approved angle revisions below are newer, uncommitted changes in the shared working tree. Preserve unrelated changes from concurrent work.

## Integrated work

- Twelve first-pass approved props were added to `game/art/interior/`, `game/data/art.json`, `game/art/cutouts.json`, and `game/data/interior_parts.json`: inspection table, ledger stack, records shelf, customs notice board, merchandise shelf, pawn display, soaking tub, bath bucket/stool, towel shelf, weapon rack, practice dummy, and brewing vat. Full-resolution sources and prompts are in `assets/environment/interior_prop_previews/`.
- Eight second-pass approved props were added in the same catalog: shop dry-goods and textile shelves, pawn valuables display, two brewery shelves, manor reception table, armor display, and scroll cabinet. Sources and contact sheet are in `assets/environment/interior_prop_previews/pass2/`.
- `game/src/sim/generate.js` now supports aligned rows with mixed art variants and optional gaps, fixed sleeping bays, and four cushions around the manor reception table. `game/data/room_recipes.json` arranges shop and pawn displays, customs records, brewery vats and shelves, manor furnishings, tenement sleeping and common areas, and bathhouse washing and tub zones. The bathhouse screen arrangement remains unchanged.
- New brewery painted shelves replaced the old `sake_shelf` within the brewery recipe. The old prop remains available to other rooms.
- Current correction from user screenshots: pawnshop display row includes the merchandise shelf with a 0.5-cell visual gap; brewery bottle shelves have a 1-cell gap; customs notice board is wall-mounted on the north wall; bathhouse towel shelf is north-wall furniture and washing stations form a row separate from the tubs.
- `game/tools/test_interior_art.mjs` checks approved art files, selected-room prop presence, aligned rows, and existing cutout/collision behavior. `tools/prepare_interior_prop_previews.py` prepares game-sized sprites; `tools/make_interior_preview_sheet.py` creates the second-pass contact sheet.
- After reviewing the angle-revision contact sheet, the user approved it. `tools/prepare_interior_angle_revisions.py` installed the revised inspection table, customs notice board, towel shelf, and bath bucket/stool in `game/art/interior/` and updated their dimensions in `game/art/cutouts.json`. The room recipes, placements, and collision footprints did not change. The optional revised futon art remains a preview because the small renderer rotation is already in place.

## Validation and remaining work

- Before the latest pawnshop, brewery, customs-board, and bathhouse refinements, all 14 room types passed 100 seeds and `test_interior_art.mjs` passed.
- After the latest refinements, all 14 types passed 100 seeds and `node game/tools/test_interior_art.mjs` passed. The brewery shelf row now slides along the north wall to avoid a door or counter; this resolved the one previously failing seed.
- User reported that the painted angle of futons, customs inspection desk/notice board, and bathhouse towel shelf/bucket-stool was slightly off from the room wall/floor axes. The room footprints and screens were aligned. Tim suggested rotating the image first, so tenement futons use a small `artAngle: -3` visual rotation through `interiors.js` and `render/scenery.js`, with no collision or screen change. The four other approved perspective-corrected images are now game cutouts. Their full-resolution sources, the optional futon revision, and contact sheet remain under `assets/environment/interior_prop_previews/angle_revisions/`.
- After installing the four revisions, `node game/tools/test_interior_art.mjs` and `node game/tools/test_rooms.mjs 100` passed for all room types.
- Hideout custom layout/art was explicitly deferred to a later pass. Den, teahouse, and warehouse were praised by the user and intentionally left alone in this refinement.
- An anti-camping warning fired inside the brewery. The user asked for this to be sent to another chat. `Fix indoor anti-camping warning` (thread `01a1644d-b06e-7b71-b6b9-9fb94ea7acec`) is handling that fix in the shared checkout. Avoid overlap with its gameplay files.

Commit only the interior-related paths after reviewing `git status`; several unrelated gameplay and menu files are being edited concurrently in the shared checkout.
