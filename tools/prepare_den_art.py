"""Resize the selected transparent den cutouts for the game's sprite catalog."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/environment/interior_prop_previews/den"
DEST = ROOT / "game/art/interior"
SPRITES = {
    "den_card_table": ("card_table_source.png", 360),
    "den_dice_table": ("dice_table_source.png", 360),
    "den_side_bar": ("side_bar_source.png", 430),
    "den_corner_bar": ("corner_bar_source.png", 450),
}


def main():
    for name, (source, width) in SPRITES.items():
        image = Image.open(SOURCE / source).convert("RGBA")
        bounds = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
        if not bounds:
            raise ValueError(f"{source} has no opaque pixels")
        pad = 6
        image = image.crop((max(0, bounds[0] - pad), max(0, bounds[1] - pad),
                            min(image.width, bounds[2] + pad), min(image.height, bounds[3] + pad)))
        if image.width > width:
            image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        image.save(DEST / f"{name}.png", optimize=True)
        print(f"{name}: {image.width}x{image.height}")


if __name__ == "__main__":
    main()
