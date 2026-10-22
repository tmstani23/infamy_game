"""Prepare approved transparent interior prop previews for the game sprite catalog.

Run with the bundled Python/Pillow runtime. Source previews remain untouched.
"""
from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/environment/interior_prop_previews"
DEST = ROOT / "game/art/interior"
NAMES = (
    "inspection_table", "ledger_stack", "records_shelf", "customs_notice_board",
    "merchandise_shelf", "pawn_display", "soaking_tub", "bath_bucket_stool",
    "towel_shelf", "weapon_rack", "practice_dummy", "brewing_vat",
)
PASS2 = (
    "shop_dry_goods_shelf", "shop_textile_shelf", "pawn_valuables_display",
    "brewery_bottle_shelf", "brewery_ceramic_shelf", "manor_reception_table",
    "manor_armor_display", "manor_scroll_cabinet",
)


def main():
    for name in (*NAMES, *PASS2):
        folder = SOURCE / "pass2" if name in PASS2 else SOURCE
        source = Image.open(folder / f"{name}.png").convert("RGBA")
        alpha = source.getchannel("A")
        # Ignore the near-invisible fringe from image generation when cropping.
        bounds = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
        if not bounds:
            raise ValueError(f"{name} has no visible pixels")
        sprite = source.crop(bounds)
        scale = min(1, 300 / max(sprite.size))
        size = tuple(max(1, round(dimension * scale)) for dimension in sprite.size)
        sprite = sprite.resize(size, Image.Resampling.LANCZOS)
        sprite.save(DEST / f"{name}.png", optimize=True)
        print(f"{name}: {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
