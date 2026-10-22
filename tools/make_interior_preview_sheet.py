"""Assemble the second interior-prop preview set into one review image."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/environment/interior_prop_previews/pass2"
ITEMS = [
    ("shop_dry_goods_shelf", "Shop: dry goods"),
    ("shop_textile_shelf", "Shop: textiles"),
    ("pawn_valuables_display", "Pawnshop: valuables"),
    ("brewery_bottle_shelf", "Brewery: bottles"),
    ("brewery_ceramic_shelf", "Brewery: ceramics"),
    ("manor_reception_table", "Manor: reception table"),
    ("manor_armor_display", "Manor: armor"),
    ("manor_scroll_cabinet", "Manor: scroll cabinet"),
]
TILE_W, TILE_H = 520, 375


def main():
    sheet = Image.new("RGB", (TILE_W * 4, TILE_H * 2), "#171513")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("arial.ttf", 21)
    for i, (name, label) in enumerate(ITEMS):
        x, y = i % 4 * TILE_W, i // 4 * TILE_H
        draw.rounded_rectangle((x + 7, y + 7, x + TILE_W - 7, y + TILE_H - 7), radius=12, fill="#27231e", outline="#594a3c", width=2)
        sprite = Image.open(SOURCE / f"{name}.png").convert("RGBA")
        alpha = sprite.getchannel("A")
        bounds = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
        if bounds:
            sprite = sprite.crop(bounds)
        sprite.thumbnail((TILE_W - 36, TILE_H - 60), Image.Resampling.LANCZOS)
        sheet.paste(sprite, (x + (TILE_W - sprite.width) // 2, y + (TILE_H - 50 - sprite.height) // 2 + 8), sprite)
        draw.text((x + 20, y + TILE_H - 43), label, font=font, fill="#f1ddbb")
    sheet.save(SOURCE / "contact_sheet.png", optimize=True)


if __name__ == "__main__":
    main()
