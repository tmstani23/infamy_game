# Painted interior alignment workflow

Keep approved art. Aim for a believable room and clear movement, not pixel-perfect edges. Work on one room and one reproducible seed at a time; use `game/tools/rooms.html?type=all` only to triage building types, and the normal game for the final close-up when the preview is unreliable.

## Default pass (80/20)

1. From the screenshot, name the visible problem: wrong grouping, wrong art facing, wall penetration, floating foot, or a distracting angle. Leave accepted props alone.
2. Fix relationships in `game/data/room_recipes.json` or `game/src/sim/generate.js`: wall furniture belongs at a wall, tables form deliberate rows, and seats belong opposite the relevant *painted* long sides. The sprite's visible long axis may differ from its recipe rectangle. Keep doorways and access clear.
3. If the placement is right but the picture is displaced, use `painted.offset` or `painted.anchor` in `game/data/interior_parts.json`. A paired decoration can use a shared `around_visual_offsets` recipe value when its footprint is correct but the approved host art is visually offset. Do not move collision to hide an image problem.
4. Check the same seed in game. If it reads well, stop tuning. Run `node game/tools/test_interior_art.mjs` and `node game/tools/test_rooms.mjs 100`; inspect more seeds only when the issue varies by seed or the tests find a layout failure.

The **Painted prop footprints** toggle in `game/tools/rooms.html?type=<room_type>` shows recipe and image-base footprints when a mismatch is hard to locate. Serve the game with its usual dev server; a temporary Python server should bind to `127.0.0.1` to avoid a Windows firewall prompt.

For genuinely missing artwork, write a concise prompt using an approved prop as style reference and the room screenshot as camera-angle reference. The user generates the four-view sheet in Gemini; extract previews, get approval, then catalog the chosen view. Upright cutouts need the correct authored facing because rotating the sprite leans its posts. Flat art can tolerate a small `artAngle` correction.

## Geometry fallback: visible angle or floating-foot errors

Only use this section after the default pass leaves a clear perspective error. The camera is fixed (`ELEVATION = atan(0.5)`), so floor axes project at about ±0.447 slope (±24.1°) in the image. Choose the sign from the *specific* nearby wall or floor seam, not the prop name. Keep the room seed and screenshot fixed. A scale change cannot fix slope.

### Calculate the painted edge correction

Use the same fixed-seed screenshot (or the source PNG at its original size) for every measurement. In image coordinates, `x` increases rightward and `y` downward. Pick two points on one **lower structural edge** of the prop, ordered left to right: `(xL, yL)` and `(xR, yR)`. Pick another two on the corresponding **upper structural edge**. Measure long, straight edges of the furniture body, not transparent PNG corners, cast shadows, ornamentation, or details on a different depth plane. If the two edges belong to different room axes, first correct the prop's facing or placement; their slopes should not be forced to match.

For each edge, compute `m = (yR - yL) / (xR - xL)`. The fixed camera in `game/src/render/iso.js` gives a target screen slope of `+0.4472` for the floor axis that descends to the right (the right/back wall in the usual view), or `-0.4472` for the axis that rises to the right (the left/back wall). These are about `+24.1°` and `-24.1°`, respectively. Choose the sign by comparing the specific prop edge with the nearby wall or floor seam it is meant to parallel; do not choose it from the prop name.

The renderer in `game/src/render/scenery.js` moves the sprite quad vertically while keeping its x coordinates fixed. In the downward-positive image convention, the rendered lower-edge slope is `m_lower - shear`, and the upper-edge slope is `m_upper - shear - topShear`. Therefore set:

```text
painted.shear    = m_lower - m_target
painted.topShear = m_upper - m_lower
```

For example, if a manor cabinet's lower and upper edges measure `+0.337` and `+0.257` against a `+0.447` wall, the starting correction is `shear = -0.110` and `topShear = -0.080`. This matches the current manor scroll cabinet calibration in `game/data/interior_parts.json`. Measure the *visible structural edges after rendering* to confirm the result; the equation is a starting point when the painted art has irregular edges.

**Re-anchor after shearing.** Measure two actual front-floor contacts on the cutout and use their midpoint `(xp, yp)`, rather than the PNG's lowest pixel or a shadow. For image width `w`, height `h`, and downward-positive pixels, the sheared contact's vertical offset from its anchor is `yp - anchorY - (shear + topShear * (1 - yp/h)) * (xp - w/2)`. Set this equal to the desired projected floor offset `gy`, so `anchorY = yp - (shear + topShear * (1 - yp/h)) * (xp - w/2) - gy`. For a display run along the `+x` room axis, the midpoint of its front edge is `gx = -fb/(2*sqrt(2)*k)`, `gy = fb*sin(ELEVATION)/(2*sqrt(2)*k)` relative to the footprint centre, where `fb` is the second `art.json` foot dimension and `k = art scale / PPU`; use `anchorX = xp - gx`. Use original PNG pixels throughout. This preserves the intended ground contact without moving the recipe footprint or blocker. If the silhouette has several depth planes, choose contacts on the same front edge; the outer alpha boundary can belong to a side panel instead.

**If one foot still floats while the top angle is right, pivot around the grounded foot.** Keep `T = shear + topShear` fixed so the upper angle stays fixed. For each foot pixel `(x, y)`, compute `Y = y - (shear + topShear * (1 - y/h)) * (x - w/2)`. Adjust `shear`, with `topShear = T - shear`, until `(Yright - Yleft) / (xRight - xLeft)` matches the floor slope. Then preserve the grounded right foot by setting `anchorY_new = anchorY_old + Yright_new - Yright_old` (or use the left foot instead). This changes the foot-to-foot line and contact in one calculation, without moving the room prop. The accepted pawnshop shelf used feet near `(10,177)` and `(250,268)` in its 300×270 PNG: `shear -0.05`, `topShear -0.09`, and `anchorY 202` kept its upper angle and planted both feet. Avoid another shear pass for a slight irregularity painted into the art itself.

This is a four-corner **image-plane trapezoid correction**, not a 3D rotation or a projective reconstruction of hidden sides. It is suitable for small slope errors; vertical lines remain vertical, but their height can stretch unevenly across the image. If the required shear distorts proportions badly, the top and bottom edges cannot both read correctly, or the art depicts the opposite side of the object, record an art-facing exception for a later four-angle sheet. A scale change alters size but not slope. After any shear or scale change, recheck the visible floor-contact point with the footprint overlay: `painted.anchor` is a pixel coordinate in the cutout, while `painted.offset` moves its image relative to the world footprint. Do not move collision or recipe positions to compensate for the quad correction.

The bathhouse towel shelf is the reference case: `painted.shear: 0.16` fixed its visible wall angle without changing placement or collision. The accepted pawnshop shelf needed a foot-pivot adjustment. These were exceptions, not required steps for every room. Preserve the admired pawnshop, manor, brewery, and valuables artwork.

## Approved inn seed-1 workflow (Tim, 2026-10-24)

Use this process for remaining hideouts:

1. Approve one labeled blueprint with room geometry, doors, furniture/props and stable IDs.
2. Build the matching full 3D graybox: floors, walls, doors and every furnishing. Capture with the intended in-game isometric camera, distance, scale and framing; include a labeled reference.
3. Generate a 1:1 painted scene from that exact reference, preserving object positions, footprints and overlaps. Produce transparent furniture painting and a separate floor.
4. Register both painted layers to the playable scene; retain functional 3D partitions and doors. This is camera-aligned whole-scene painting, not true texture projection onto 3D furniture.
5. Derive furniture blockers from the final visible painting, refine doorway/navigation clearance, then tune proximity wall opacity and selective front/behind wall masks.
6. Visually inspect and traverse the actual game room, including every door, with the final character scale. Keep the path checker as a repeatable clearance check.

The approved inn uses seed 1, `game/art/interior/inn_scene_props.png` and `inn_scene_floor.png`, the inn blueprint recipe and `game/tools/check_inn_paths.mjs`. Keep the source blueprint, graybox, labels, original painting and reproducible tools. Individual masked cutouts remain source dependencies of the graybox tool; they are not the live room's furniture rendering.

Lessons: separately masked props and repeated per-object perspective corrections did not reproduce the complete approved painting reliably. A painting does not supply collision or depth geometry: calibrate blockers against painted bounds, and use selective wall masks for exceptions rather than flattening functional walls. Camera/framing or character-scale changes require rechecking registration, occlusion and navigation together. Trial captures are not canonical room specifications. Cleanup record: [inn_cleanup_manifest.txt](blueprints/inn_cleanup_manifest.txt).
