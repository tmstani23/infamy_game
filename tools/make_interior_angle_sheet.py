"""Make a review sheet for optional perspective-correction artwork."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


SOURCE = Path(__file__).resolve().parents[1] / "assets/environment/interior_prop_previews/angle_revisions"
ITEMS = [
    ("futon_angle_v2", "Futon (optional; rotation also tested)"),
    ("inspection_table_angle_v2", "Customs inspection desk"),
    ("customs_notice_board_angle_v2", "Customs notice board"),
    ("towel_shelf_angle_v2", "Bathhouse towel shelf"),
    ("bath_bucket_stool_angle_v2", "Bathhouse bucket and stool"),
]
WIDTH, HEIGHT = 560, 390


def main():
    sheet = Image.new("RGB", (WIDTH * 3, HEIGHT * 2), "#171513")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("arial.ttf", 20)
    for i, (name, label) in enumerate(ITEMS):
        x, y = (i % 3) * WIDTH, (i // 3) * HEIGHT
        draw.rounded_rectangle((x + 8, y + 8, x + WIDTH - 8, y + HEIGHT - 8), radius=12, fill="#28231d", outline="#594a3c", width=2)
        image = Image.open(SOURCE / f"{name}.png").convert("RGBA")
        bounds = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if bounds:
            image = image.crop(bounds)
        image.thumbnail((WIDTH - 44, HEIGHT - 75), Image.Resampling.LANCZOS)
        sheet.paste(image, (x + (WIDTH - image.width) // 2, y + 12 + (HEIGHT - 75 - image.height) // 2), image)
        draw.text((x + 20, y + HEIGHT - 42), label, font=font, fill="#f1ddbb")
    sheet.save(SOURCE / "contact_sheet.png", optimize=True)


if __name__ == "__main__":
    main()
