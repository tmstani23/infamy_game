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

## Repeatable correction loop for another room

1. Pick one failing room and seed. Save a screenshot and identify the exact prop, the wall or divider it should follow, and which edge or floor-contact point is wrong. Keep that seed fixed while calibrating; use `game/tools/rooms.html?type=<room_type>` for the twelve-seed survey, then check the result in the normal game if the preview cannot load.
2. Fix the **layout relationship** first. Put wall furniture on its intended wall, group stations into deliberate rows or work areas, and leave access around doors and interactable props. Change the recipe/generator when multiple objects are misplaced together. Do not use sprite offsets to repair room planning.
3. Turn on **Painted prop footprints**. If the recipe footprint is right but the picture floats or enters a wall, set that asset's `painted.anchor` to the visible floor-contact pixel in `game/data/interior_parts.json`, then use a small `painted.offset` only for the remaining positional error. Keep the footprint and collision box in place unless the actual gameplay space is wrong.
4. Compare a long horizontal edge on the art with the matching wall or divider. The fixed camera projects each floor axis at slope ±0.447. Measure two points on a lower painted edge and two on the matching upper edge. Apply the difference from the target slope as per-asset `painted.shear` for the lower edge and `painted.topShear` for any additional upper-edge correction. This maps the four image-plane corners while leaving gameplay collision and room placement alone. Reserve `artAngle` for flat objects. If this small correction cannot make the perspective believable, record an art exception.
5. Recheck the same seed at close range, then inspect the other eleven seeds and representative rooms using the same asset. Confirm wall contact, upright posts, no overlaps, walkable paths, and interaction access. Run the art and 100-seed room tests above. Record the asset-level correction once rather than adding seed-specific tweaks.

### Calculate the painted edge correction

Use the same fixed-seed screenshot (or the source PNG at its original size) for every measurement. In image coordinates, `x` increases rightward and `y` downward. Pick two points on one **lower structural edge** of the prop, ordered left to right: `(xL, yL)` and `(xR, yR)`. Pick another two on the corresponding **upper structural edge**. Measure long, straight edges of the furniture body, not transparent PNG corners, cast shadows, ornamentation, or details on a different depth plane. If the two edges belong to different room axes, first correct the prop's facing or placement; their slopes should not be forced to match.

For each edge, compute `m = (yR - yL) / (xR - xL)`. The fixed camera in `game/src/render/iso.js` gives a target screen slope of `+0.4472` for the floor axis that descends to the right (the right/back wall in the usual view), or `-0.4472` for the axis that rises to the right (the left/back wall). These are about `+24.1°` and `-24.1°`, respectively. Choose the sign by comparing the specific prop edge with the nearby wall or floor seam it is meant to parallel; do not choose it from the prop name.

The renderer in `game/src/render/scenery.js` moves the sprite quad vertically while keeping its x coordinates fixed. In the downward-positive image convention, the rendered lower-edge slope is `m_lower - shear`, and the upper-edge slope is `m_upper - shear - topShear`. Therefore set:

```text
painted.shear    = m_lower - m_target
painted.topShear = m_upper - m_lower
```

For example, if a manor cabinet's lower and upper edges measure `+0.337` and `+0.257` against a `+0.447` wall, the starting correction is `shear = -0.110` and `topShear = -0.080`. This matches the current manor scroll cabinet calibration in `game/data/interior_parts.json`. Measure the *visible structural edges after rendering* to confirm the result; the equation is a starting point when the painted art has irregular edges.

This is a four-corner **image-plane trapezoid correction**, not a 3D rotation or a projective reconstruction of hidden sides. It is suitable for small slope errors while the vertical posts still look upright. If the required shear makes posts lean badly, the top and bottom edges cannot both read correctly, or the art depicts the opposite side of the object, record an art-facing exception for a later four-angle sheet. A scale change alters size but not slope. After any shear or scale change, recheck the visible floor-contact point with the footprint overlay: `painted.anchor` is a pixel coordinate in the cutout, while `painted.offset` moves its image relative to the world footprint. Do not move collision or recipe positions to compensate for the quad correction.

The bathhouse towel shelf is the reference case: its contact anchor placed it correctly on the floor, but its top edge still missed the right-wall slope. A `painted.shear` of `0.16` corrected that display angle without changing the shelf art, recipe position, or blocker. The user accepted bathhouse seed 1 after this adjustment.

For future *new* concept props, prepare a concise prompt plus a reference to approved art and let the user generate a sheet with all four camera-matched angles in Gemini. The user will copy the sheet into the project; then cut out, catalog, anchor, and place the views in the generator. Do not rotate an upright cutout to fake a missing view. Ask for new art only when the required facing is absent; retain the user's approved existing assets.

## Current batch notes

- Customs house: the main-room generic counter and loose `tansu` drawers have been replaced with a second approved inspection table in a clerk area. The approved notice board still sits slightly into the north wall; check its image offset with footprint guides. The painted records shelves may stay in their current row or be moved to a wall if that improves the work area.
- Bathhouse pilot: the washing stations now follow the actual screen run, centered 0.6 floor units beyond it instead of sampling a broad washing area. The towel shelf, bucket-and-stool asset, and soaking tub have explicit painted floor-contact pixels in `interior_parts.json`; this moves only the images, preserving recipe rectangles and blockers. The shelf alone also gets a small image-plane shear so its long painted edge follows the right wall while its posts remain upright. Seed 1 was accepted in game; inspect other seeds for wall contact and tub access during the full-room pass.
- Keep the admired pawnshop, manor, brewery, and valuables artwork intact. Any remaining mismatch there should be handled as placement or anchor calibration.

The next reusable calibration step is to record a wall-facing contact edge per painted asset and review remaining perspective mismatch. Use it with the new per-asset floor-contact anchor and footprint guide to calculate any small `painted.offset` once per asset. Keep visual calibration separate from collision boxes and recipe positions; recipe positions express where the object belongs, while anchor and offset express where its existing image actually touches the floor or wall.
