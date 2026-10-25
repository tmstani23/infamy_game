# Inn whole-scene paint prompt

Attach these images to one Gemini image-editing request, in this order:

1. `inn_furniture_graybox.png` — **primary image**. Paint directly over this complete, wall-free 2048 × 1152 render.
2. `inn_furniture_ids.png` — **placement key only**. It shows the same scene with object IDs. Do not paint the labels.
3. Optional: a screenshot of an existing Infamy interior whose art style you want to match. Use it for style only, never for layout.

Paste this prompt:

> Edit Image 1 as **one complete scene**, not as separate object illustrations. Image 1 is the exact composition and 3D perspective to preserve. Image 2 identifies the objects; its white ID labels must not appear in the result. If Image 3 is present, borrow only its rendering style and material treatment.
>
> Repaint the visible floor and **every existing object** as finished, richly detailed environment art for a historical Japanese inn in the same isometric game style. Keep the camera, 2048 × 1152 framing, floor outline, every object's silhouette, footprint, scale, position, orientation, and overlap exactly registered to Image 1. This is a paint-over of the supplied geometry. Do not redesign or rearrange the room. Preserve the empty dark space outside the floor slab.
>
> Make the floor woven tatami with subtle straw grain and clean seams following the exact grid and isometric diagonals of Image 1. Use weathered dark timber, restrained indigo and cream textiles, aged lacquer, ceramics, iron, and warm amber lantern light. Give each object believable material texture and gentle contact shadows without changing its shape or moving its feet. Keep details readable at game scale; avoid oversaturated color and exaggerated distortion.
>
> **Object key from Image 2:**
> - C1, C2: two simple crew futons with indigo bedding and pillows. C3: dark wooden clothing chest. C4: hanging paper lantern.
> - G1, G2: two slightly finer guest futons with folded bedding and pillows. G3: guest clothing chest. G4: hanging paper lantern.
> - K1: low cooking hearth with iron pot and subdued embers. K2: worn food-preparation table. K3: pantry rack with jars and baskets. K4: wooden water tub. K5: hanging paper lantern.
> - P1: planning table with a map, writing tools, and a few small weights on its existing top. P2: rack of rolled maps and documents. P3: weapon rack holding spears and sheathed weapons within the existing rack silhouette. P4: sturdy gear chest. P5: hanging paper lantern.
> - H1: inn reception counter with a ledger on its existing top. H2: communal dining table with modest tableware confined to its top. H3, H4, H5, H6: four floor seat cushions around H2. H7: linen and service shelf with folded cloth. H8: low tea table with a modest tea service confined to its top. H9, H10: two floor cushions around H8. H11: hanging paper lantern.
>
> All five lanterns hang from the same invisible roof height. **Keep the visible 3D suspension cord above every lantern, at the existing fixed length and position in Image 1.** The cord and lantern must remain separate from nearby furniture.
>
> **Do not add walls, doors, windows, roof, support posts, characters, signs, UI, written labels, ID tags, extra furnishings, or new floor space.** Do not merge objects or paint furniture across the open walking aisles. The walls and doors will be added as separate 3D geometry after this paint-over.
>
> Output a single finished image at the same aspect ratio and, if supported, exactly 2048 × 1152 pixels. Prioritize pixel-for-pixel registration with Image 1 over artistic reinterpretation.

After generation, compare the painted result against Image 1 at 50% opacity. Check floor corners, table edges, futon ends, shelf posts, lamp cords, and the clear gaps around the planning-room doorway. Any drift in these landmarks will need correction before projecting the image onto the 3D scene.
