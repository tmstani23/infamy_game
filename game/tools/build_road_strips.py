"""Cuts the road strip sheet (six roads side by side, 2026-11-21) into the island road atlas.
Usage: python3 game/tools/build_road_strips.py [sheet] [out]
  defaults: assets/environment/travelroads1.png -> game/art/ground/island/road_strips.png
Each road is found by its opaque columns, cut to a 256-wide column (centred), its rounded ends trimmed, and its
end faded into its start over FADE rows so it repeats along its length. Order: plains, hills, forest, marsh, dry, snow
(world_paint.json trail.strips.types)."""
import sys
import numpy as np
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else 'assets/environment/travelroads1.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'game/art/ground/island/road_strips.png'
CW, TRIM, FADE = 256, 60, 180
im = np.asarray(Image.open(src).convert('RGBA'), float)
cols = (im[..., 3] > 128).mean(0) > 0.5
edges = np.flatnonzero(np.diff(cols.astype(int)))
roads = list(zip(edges[0::2] + 1, edges[1::2] + 1))
assert len(roads) == 6, f'expected 6 roads on the sheet, found {len(roads)}'
rows = np.flatnonzero((im[..., 3] > 128).mean(1) > 0.3)
r0, r1 = rows[0] + TRIM, rows[-1] - TRIM
L = r1 - r0 - FADE
atlas = np.zeros((L, CW * len(roads), 4))
for i, (a, b) in enumerate(roads):
    c = (a + b) // 2
    s = im[r0:r1, c - CW // 2:c + CW // 2].copy()
    s[..., :3] *= s[..., 3:4] / 255                       # premultiplied while blending
    strip = s[:L].copy()
    t = np.linspace(0, 1, FADE)[:, None, None]
    strip[:FADE] = s[L:L + FADE] * (1 - t) + s[:FADE] * t   # the end fades into the start: repeats every L rows
    a_ = strip[..., 3]
    soft = np.apply_along_axis(lambda r: np.convolve(r, np.ones(9) / 9, 'same'), 1, a_)
    atlas[:, i * CW:(i + 1) * CW, :3] = np.clip(strip[..., :3] / np.maximum(strip[..., 3:4], 1) * 255, 0, 255)
    atlas[:, i * CW:(i + 1) * CW, 3] = np.minimum(a_, soft)   # a slightly softer rim
Image.fromarray(atlas.astype('uint8'), 'RGBA').save(out, optimize=True)
print(f'{out}: {len(roads)} roads, {CW} x {L} each')
