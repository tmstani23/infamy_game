# Painted interior alignment pass

Keep the approved prop art. Solve alignment by changing room placement and cutout anchors first; use the existing small visual rotation only for flat art when its painted floor axis is off. The pawnshop valuables, manor furniture, brewery shelves, and other approved pieces are style references, not redraw candidates.

## Review all rooms in one pass

`game/tools/rooms.html?type=all` shows one representative generated seed for every building type. It now renders the same painted cutouts as the game. Click a type to inspect twelve seeds. The **Painted prop footprints** toggle shows the recipe footprint (gold), inferred image-base footprint (blue), recipe centre (cyan), and painted centre (pink). The pink line shows the image offset from its recipe anchor. Click any seed to add it to the picked-seed list, then use **walk in** for an in-game close-up.

Serve the `game` directory with the project's usual dev server. If a temporary Python server is needed, bind it to `127.0.0.1` only; a server bound to all interfaces can trigger a Windows firewall alert.

The camera is fixed (`ELEVATION = atan(0.5)`), so floor axes project at about 24.1 degrees above/below horizontal. Upright edges remain vertical. The painted sprite is a camera-facing plane; the room prop's 90-degree rotation does not rotate its painted perspective. Review each cutout against these axes and its footprint overlay.

Classify each issue before changing anything:

1. **Wrong room position or grouping:** adjust named recipe areas, wall preference, rows, or an explicit spatial relationship in `room_recipes.json` / `sim/generate.js`.
2. **Correct footprint but misplaced image:** adjust that prop's `painted.offset` in `interior_parts.json`; keep collision and walkability unchanged.
3. **Wrong scale or ground anchor:** check `art.json` scale and `cutouts.json` dimensions/anchor against the PNG. Avoid changing collision to disguise a visual problem.
4. **Painted angle:** try `artAngle` only on flat cutouts. Upright cutouts should be placed against the wall direction their perspective depicts; rotating the image would lean the posts.
5. **Generic old prop in a themed room:** prefer an already approved painted prop through the recipe rather than making new art.

Make each data correction once, rerender representative seeds, then run `node game/tools/test_interior_art.mjs` and `node game/tools/test_rooms.mjs 100`. Compare the same seeds before and after. Keep a short exception list for art whose perspective cannot be aligned by placement alone.

## Current batch notes

- Customs house: the main-room generic counter and loose `tansu` drawers have been replaced with a second approved inspection table in a clerk area. The approved notice board still sits slightly into the north wall; check its image offset with footprint guides. The painted records shelves may stay in their current row or be moved to a wall if that improves the work area.
- Bathhouse pilot: the washing stations now follow the actual screen run, centered 0.6 floor units beyond it instead of sampling a broad washing area. The towel shelf, bucket-and-stool asset, and soaking tub have explicit painted floor-contact pixels in `interior_parts.json`; this moves only the images, preserving recipe rectangles and blockers. Review seed 1 and the other eleven preview seeds for any remaining painted-angle mismatch, wall contact, or tub access.
- Keep the admired pawnshop, manor, brewery, and valuables artwork intact. Any remaining mismatch there should be handled as placement or anchor calibration.

The next reusable calibration step is to record a wall-facing contact edge per painted asset and review remaining perspective mismatch. Use it with the new per-asset floor-contact anchor and footprint guide to calculate any small `painted.offset` once per asset. Keep visual calibration separate from collision boxes and recipe positions; recipe positions express where the object belongs, while anchor and offset express where its existing image actually touches the floor or wall.
