"""Install approved angle revisions as game-sized transparent interior cutouts.

Preview sources remain unchanged. Run with the bundled Pillow Python runtime.
"""
import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/environment/interior_prop_previews/angle_revisions"
DEST = ROOT / "game/art/interior"
NAMES = (
    "inspection_table",
    "customs_notice_board",
    "towel_shelf",
    "bath_bucket_stool",
)


def main():
    metadata_path = ROOT / "game/art/cutouts.json"
    metadata_text = metadata_path.read_text(encoding="utf-8")
    metadata = json.loads(metadata_text)
    prepared = []
    for name in NAMES:
        image = Image.open(SOURCE / f"{name}_angle_v2.png").convert("RGBA")
        bounds = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
        if not bounds:
            raise ValueError(f"{name} has no visible pixels")
        image = image.crop(bounds)
        scale = min(1, 300 / max(image.size))
        size = tuple(max(1, round(dimension * scale)) for dimension in image.size)
        image = image.resize(size, Image.Resampling.LANCZOS)

        old = metadata[f"interior/{name}"]
        revised = dict(old, w=size[0], h=size[1], right=size[0] - 1,
                       bottomX=size[0] // 2, bottomY=size[1] - 1)
        pattern = rf'("interior/{name}": )\{{[^\r\n]*\}}'
        replacement = rf'\g<1>{json.dumps(revised, separators=(",", ":"))}'
        metadata_text, count = re.subn(pattern, replacement, metadata_text)
        if count != 1:
            raise ValueError(f"{name}: could not update exactly one metadata entry")
        prepared.append((name, image))

    json.loads(metadata_text)
    for name, image in prepared:
        image.save(DEST / f"{name}.png", optimize=True)
        print(f"{name}: installed {image.width}x{image.height}")
    metadata_path.write_text(metadata_text, encoding="utf-8")


if __name__ == "__main__":
    main()
