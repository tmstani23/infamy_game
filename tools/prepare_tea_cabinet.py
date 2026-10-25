"""Remove the baked-in checkerboard from the supplied teahouse cabinet art."""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/environment/tea_cabinet.jpg"
DEST = ROOT / "game/art/interior/teahouse_tea_cabinet.png"


def main():
    image = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(image, dtype=np.int16)
    low = rgb.min(axis=2)
    # The JPEG's checker tiles are grey, while the cabinet is warm wood with
    # dark ink outlines. Keep enclosed neutral bowls and cloths inside it.
    core = ((rgb.max(axis=2) - low > 20) | (low < 55)).astype(np.uint8) * 255
    core = np.asarray(Image.fromarray(core).filter(ImageFilter.MaxFilter(3))) > 0
    background = ~core
    height, width = background.shape
    outside = np.zeros((height, width), dtype=bool)
    queue = deque()
    for x in range(width):
        if background[0, x]:
            queue.append((0, x))
        if background[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if background[y, 0]:
            queue.append((y, 0))
        if background[y, width - 1]:
            queue.append((y, width - 1))
    while queue:
        y, x = queue.popleft()
        if outside[y, x] or not background[y, x]:
            continue
        outside[y, x] = True
        if y: queue.append((y - 1, x))
        if y + 1 < height: queue.append((y + 1, x))
        if x: queue.append((y, x - 1))
        if x + 1 < width: queue.append((y, x + 1))

    alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.65))
    cutout = image.convert("RGBA")
    cutout.putalpha(alpha)
    bounds = alpha.point(lambda value: 255 if value > 128 else 0).getbbox()
    if bounds is None:
        raise ValueError("No cabinet remains after removing the checkerboard")
    pad = 4
    cutout = cutout.crop((max(0, bounds[0] - pad), max(0, bounds[1] - pad),
                          min(width, bounds[2] + pad), min(height, bounds[3] + pad)))
    target_width = 245
    cutout = cutout.resize((target_width, round(cutout.height * target_width / cutout.width)),
                            Image.Resampling.LANCZOS)
    cutout.save(DEST, optimize=True)
    print(f"{DEST}: {cutout.width}x{cutout.height}")


if __name__ == "__main__":
    main()
