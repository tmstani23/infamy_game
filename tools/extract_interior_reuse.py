"""Extract the approved painted panels without overwriting the original assets.

Run with Pillow: python tools/extract_interior_reuse.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/environment/interiors1.jpg'
OUT = ROOT / 'game/art/interior3d'


def main():
    source = Image.open(SOURCE).convert('RGB')
    # Pillow QUAD order: upper left, lower left, lower right, upper right.
    panels = {
        'painted_dragon': ((880, 242, 880, 310, 939, 285, 939, 221), (256, 256)),
        'painted_alcove': ((141, 544, 141, 612, 188, 632, 188, 564), (192, 320)),
        'painted_plaster': ((102, 75, 102, 138, 163, 114, 163, 51), (192, 256)),
        'painted_wood': ((369, 247, 369, 296, 416, 276, 416, 227), (192, 256)),
        'painted_shoji': ((83, 359, 83, 425, 169, 466, 169, 401), (320, 256)),
        'painted_lattice': ((877, 72, 877, 106, 932, 83, 932, 49), (256, 160)),
    }
    for name, (quad, size) in panels.items():
        image = source.transform(size, Image.Transform.QUAD, quad, Image.Resampling.BICUBIC)
        image.save(OUT / f'{name}.png')
        print(f'{name}: {size}')


if __name__ == '__main__':
    main()
